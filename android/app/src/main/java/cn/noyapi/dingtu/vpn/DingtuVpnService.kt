// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.SystemClock
import cn.noyapi.dingtu.DingtuApplication
import cn.noyapi.dingtu.MainActivity
import cn.noyapi.dingtu.R
import cn.noyapi.dingtu.config.NetworkAddressPolicy
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.trust.ProductionTrustAnchor
import java.net.InetAddress
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class DingtuVpnService : VpnService() {

    private val workerExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "dingtu-vpn-worker").apply { isDaemon = true }
    }

    @Volatile
    private var leaseEngine: TunnelLeaseEngine? = null

    @Volatile
    private var coreAdapter: LibboxCommandServerAdapter? = null

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISCONNECT -> {
                workerExecutor.execute {
                    val engine = leaseEngine
                    if (engine != null) {
                        engine.disconnectGracefully("USER_NOTIFICATION_DISCONNECT")
                    } else {
                        stopForegroundAndSelf()
                    }
                }
                return START_NOT_STICKY
            }

            ACTION_RELOAD_ROUTING -> {
                val app = application as DingtuApplication
                val mode = app.routingStore.getRoutingMode()
                val selected = if (app.routingStore.hasExplicitSelection()) {
                    app.routingStore.getSelectedPackages()
                } else {
                    null
                }
                workerExecutor.execute {
                    leaseEngine?.updateRoutingConfiguration(mode, selected)
                }
                return START_NOT_STICKY
            }

            ACTION_CONNECT -> {
                val app = application as DingtuApplication
                val modeLabel = app.routingStore.getRoutingMode().displayLabel
                promoteToForeground(regionLabel = null, modeLabel = modeLabel, connecting = true)
                workerExecutor.execute {
                    ensureEngineInitialized().connect()
                }
                return START_NOT_STICKY
            }

            else -> {
                stopForegroundAndSelf()
                return START_NOT_STICKY
            }
        }
    }

    override fun onRevoke() {
        RedactedLogger.warn("System revoked VPN permission; stopping fail-closed")
        val engine = leaseEngine
        if (engine != null) {
            engine.stopVpnFailClosed(
                reasonCode = "SYSTEM_VPN_PERMISSION_REVOKED",
                userRecoveryMessage = "系统已收回 VPN 授权，定途独享隧道已停止。",
            )
        } else {
            coreAdapter?.stopAndReleaseTun("SYSTEM_VPN_PERMISSION_REVOKED")
            stopForegroundAndSelf()
        }
        super.onRevoke()
    }

    override fun onDestroy() {
        runCatching { leaseEngine?.shutdown() }
        leaseEngine = null
        runCatching { coreAdapter?.stopAndReleaseTun("SERVICE_DESTROY") }
        coreAdapter = null
        workerExecutor.shutdownNow()
        super.onDestroy()
    }

    @Synchronized
    private fun ensureEngineInitialized(): TunnelLeaseEngine {
        leaseEngine?.let { return it }

        val app = application as DingtuApplication
        val trustAnchor = ProductionTrustAnchor.loadFromContext(app)

        val platformInterface = DingtuPlatformInterface(
            vpnService = this,
            onPhysicalNetworkChanged = { netKey ->
                workerExecutor.execute {
                    leaseEngine?.onUnderlyingNetworkChanged(netKey)
                }
            },
        )

        val adapter = LibboxCommandServerAdapter(
            appContext = app,
            platformInterface = platformInterface,
            onForegroundNotificationUpdate = { region, modeLabel ->
                promoteToForeground(regionLabel = region, modeLabel = modeLabel, connecting = false)
            },
            onUnexpectedStopFromCore = {
                workerExecutor.execute {
                    leaseEngine?.onUnexpectedCoreExit("LIBBOX_SERVICE_STOP")
                }
            },
        )
        coreAdapter = adapter

        val engine = TunnelLeaseEngine(
            sessionStore = app.sessionStore,
            routingStore = app.routingStore,
            controlClient = app.controlClient,
            productionConfigClient = app.productionConfigClient,
            trustAnchor = trustAnchor,
            coreAdapter = adapter,
            installedPackagesProvider = { VpnRoutingPolicy.queryInstalledNonSelfPackages(app) },
            bootstrapDnsResolver = { hostname -> resolveViaUnderlyingNetwork(hostname) },
            monotonicClock = SystemClock::elapsedRealtime,
            onServiceStopRequested = { stopForegroundAndSelf() },
            onStatusPublished = { snapshot -> app.publishTunnelStatus(snapshot) },
            sessionExecutorOverride = app.sessionExecutor,
            telemetryReporter = app.telemetryReporter,
        )
        leaseEngine = engine
        return engine
    }

    @Suppress("DEPRECATION")
    private fun resolveViaUnderlyingNetwork(hostname: String): List<String> {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        for (net in cm.allNetworks) {
            val caps = cm.getNetworkCapabilities(net) ?: continue
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
                !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            ) {
                continue
            }
            val resolved = runCatching {
                net.getAllByName(hostname)
                    .mapNotNull { it.hostAddress?.substringBefore('%') }
                    .filter(NetworkAddressPolicy::isPublicUnicastIp)
            }.getOrDefault(emptyList())
            if (resolved.isNotEmpty()) {
                return resolved
            }
        }
        return InetAddress.getAllByName(hostname)
            .mapNotNull { it.hostAddress?.substringBefore('%') }
            .filter(NetworkAddressPolicy::isPublicUnicastIp)
    }

    private fun promoteToForeground(
        regionLabel: String?,
        modeLabel: String,
        connecting: Boolean,
    ) {
        val notification = buildForegroundNotification(regionLabel, modeLabel, connecting)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundAndSelf() {
        runCatching {
            stopForeground(STOP_FOREGROUND_REMOVE)
        }
        stopSelf()
    }

    private fun ensureNotificationChannel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "定途隧道状态",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "展示当前受控独享出口状态与快速断开操作"
            setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
    }

    private fun buildForegroundNotification(
        regionLabel: String?,
        modeLabel: String,
        connecting: Boolean,
    ): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this,
            100,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val disconnectIntent = PendingIntent.getService(
            this,
            101,
            Intent(this, DingtuVpnService::class.java).apply {
                action = ACTION_DISCONNECT
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = if (connecting) "定途正在建立安全隧道…" else "定途独享隧道运行中"
        val regionText = regionLabel?.takeIf { it.isNotBlank() } ?: "受控独享出口"
        val contentText = "$regionText · $modeLabel"

        val disconnectAction = Notification.Action.Builder(
            null,
            "断开",
            disconnectIntent,
        ).build()

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_dingtu)
            .setContentTitle(title)
            .setContentText(contentText)
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(disconnectAction)
            .build()
    }

    companion object {
        const val ACTION_CONNECT = "cn.noyapi.dingtu.action.CONNECT"
        const val ACTION_RELOAD_ROUTING = "cn.noyapi.dingtu.action.RELOAD_ROUTING"
        const val ACTION_DISCONNECT = "cn.noyapi.dingtu.action.DISCONNECT"

        private const val CHANNEL_ID = "dingtu_vpn_status"
        private const val NOTIFICATION_ID = 17001

        fun startConnect(context: Context) {
            val intent = Intent(context, DingtuVpnService::class.java).apply {
                action = ACTION_CONNECT
            }
            context.startForegroundService(intent)
        }

        fun requestReloadRouting(context: Context) {
            val intent = Intent(context, DingtuVpnService::class.java).apply {
                action = ACTION_RELOAD_ROUTING
            }
            context.startService(intent)
        }

        fun startDisconnect(context: Context) {
            val intent = Intent(context, DingtuVpnService::class.java).apply {
                action = ACTION_DISCONNECT
            }
            context.startService(intent)
        }

        @Suppress("unused")
        fun currentModeWire(mode: VpnRoutingMode): String = mode.wireValue
    }
}

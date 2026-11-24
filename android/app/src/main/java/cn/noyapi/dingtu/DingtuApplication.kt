// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu

import android.app.Application
import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.diagnostics.BasicConnectivityCheckService
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.ProductionConfigClient
import cn.noyapi.dingtu.storage.DeviceSessionStore
import cn.noyapi.dingtu.storage.KeystoreEncryptedDeviceSessionStore
import cn.noyapi.dingtu.telemetry.AndroidTelemetryReporter
import cn.noyapi.dingtu.telemetry.TelemetryCategory
import cn.noyapi.dingtu.telemetry.TelemetryEventStatus
import cn.noyapi.dingtu.telemetry.TelemetrySeverity
import cn.noyapi.dingtu.telemetry.TelemetryStage
import cn.noyapi.dingtu.ui.DingtuAppController
import cn.noyapi.dingtu.ui.InstalledAppDisplayItem
import cn.noyapi.dingtu.vpn.DingtuVpnService
import cn.noyapi.dingtu.vpn.LibboxSnapshotScrubber
import cn.noyapi.dingtu.vpn.RoutingPreferencesStore
import cn.noyapi.dingtu.vpn.SharedPreferencesRoutingStore
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import cn.noyapi.dingtu.vpn.TunnelStatusSnapshot
import cn.noyapi.dingtu.vpn.VpnRoutingPolicy
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.Locale

class DingtuApplication : Application() {

    @Volatile
    var libboxInitialized: Boolean = false
        private set

    lateinit var sessionStore: DeviceSessionStore
        private set

    lateinit var routingStore: RoutingPreferencesStore
        private set

    lateinit var controlClient: DingtuControlClient
        private set

    lateinit var productionConfigClient: ProductionConfigClient
        private set

    lateinit var sessionExecutor: AuthenticatedSessionExecutor
        private set

    lateinit var telemetryReporter: AndroidTelemetryReporter
        private set

    lateinit var appController: DingtuAppController
        private set

    private val _tunnelStatusFlow = MutableStateFlow(TunnelStatusSnapshot())
    val tunnelStatusFlow: StateFlow<TunnelStatusSnapshot> = _tunnelStatusFlow.asStateFlow()

    internal fun publishTunnelStatus(snapshot: TunnelStatusSnapshot) {
        _tunnelStatusFlow.value = snapshot
        if (::appController.isInitialized) {
            appController.onTunnelStatusChanged(snapshot)
        }
    }

    override fun onCreate() {
        super.onCreate()
        sessionStore = KeystoreEncryptedDeviceSessionStore(this)
        routingStore = SharedPreferencesRoutingStore(this)
        controlClient = DingtuControlClient()
        productionConfigClient = ProductionConfigClient()
        sessionExecutor = AuthenticatedSessionExecutor(
            sessionStore = sessionStore,
            controlClient = controlClient,
            onSessionRefreshFailed = { err, elapsedMs ->
                if (::telemetryReporter.isInitialized) {
                    telemetryReporter.recordEvent(
                        category = TelemetryCategory.AUTH,
                        stage = TelemetryStage.SESSION_REFRESH,
                        action = "session_refresh_failed",
                        status = TelemetryEventStatus.ERROR,
                        severity = if (err.statusCode == 401 || err.statusCode == 403) {
                            TelemetrySeverity.ERROR
                        } else {
                            TelemetrySeverity.WARN
                        },
                        errorCode = err.errorCode,
                        requestId = err.requestId,
                        durationMs = elapsedMs,
                        httpStatus = err.statusCode,
                        retryable = err.statusCode >= 500 || err.statusCode == 429,
                    )
                }
            },
        )
        telemetryReporter = AndroidTelemetryReporter(
            sessionStore = sessionStore,
            sessionExecutor = sessionExecutor,
            controlClient = controlClient,
        )
        publishTunnelStatus(
            TunnelStatusSnapshot(routingMode = routingStore.getRoutingMode())
        )
        initializeLibbox()

        appController = DingtuAppController(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            sessionExecutor = sessionExecutor,
            selfCheckRunner = BasicConnectivityCheckService(),
            tunnelStatusFlow = tunnelStatusFlow,
            installedAppsLoader = { loadInstalledDisplayApps() },
            telemetryReporter = telemetryReporter,
            onRequestReloadVpnRouting = {
                if (tunnelStatusFlow.value.state == TunnelLifecycleState.CONNECTED) {
                    DingtuVpnService.requestReloadRouting(this)
                }
            },
            onRequestStopVpn = {
                DingtuVpnService.startDisconnect(this)
                publishTunnelStatus(
                    tunnelStatusFlow.value.copy(
                        state = TunnelLifecycleState.DISCONNECTED,
                        activePackageCount = 0,
                        bindingRevision = null,
                        configRevision = null,
                        leaseExpiresAtUtc = null,
                    )
                )
            },
            onPublishBoundExitContext = { exitCtx ->
                if (exitCtx != null && tunnelStatusFlow.value.exitContext == null) {
                    publishTunnelStatus(tunnelStatusFlow.value.copy(exitContext = exitCtx))
                }
            },
        )
    }

    private fun loadInstalledDisplayApps(): List<InstalledAppDisplayItem> {
        val pm = packageManager
        val recommendedByPkg = VpnRoutingPolicy.RECOMMENDED_AI_AND_BROWSER_APPS.associateBy { it.packageName }
        return VpnRoutingPolicy.queryInstalledNonSelfPackages(this).map { pkg ->
            val rec = recommendedByPkg[pkg]
            val appLabel = runCatching {
                val appInfo = pm.getApplicationInfo(pkg, 0)
                pm.getApplicationLabel(appInfo).toString().trim()
            }.getOrDefault(rec?.defaultName ?: pkg)
            InstalledAppDisplayItem(
                packageName = pkg,
                displayName = appLabel.ifBlank { rec?.defaultName ?: pkg },
                isRecommended = rec != null,
                recommendedCategory = rec?.category,
            )
        }
    }

    private fun initializeLibbox() {
        val baseDir = File(filesDir, "libbox").apply { mkdirs() }
        val workingDir = File(baseDir, "work").apply { mkdirs() }
        val tempDir = File(cacheDir, "libbox").apply { mkdirs() }
        LibboxSnapshotScrubber.scrubAll(this)
        val secretBytes = Ed25519Crypto.generateSeed()
        val perProcessSecret = Ed25519Crypto.encodeBase64UrlNoPadding(secretBytes)
        secretBytes.fill(0)

        val options = SetupOptions().apply {
            basePath = baseDir.absolutePath
            workingPath = workingDir.absolutePath
            tempPath = tempDir.absolutePath
            fixAndroidStack = true
            commandServerSecret = perProcessSecret
            logMaxLines = 300L
            debug = false
            crashReportSource = "dingtu-android"
            appVersion = DingtuConstants.APP_VERSION
            appMarketingVersion = DingtuConstants.APP_VERSION
        }
        Libbox.setup(options)
        LibboxSnapshotScrubber.scrubAll(this)
        runCatching { Libbox.setLocale(Locale.getDefault().toLanguageTag()) }
        libboxInitialized = true
    }
}

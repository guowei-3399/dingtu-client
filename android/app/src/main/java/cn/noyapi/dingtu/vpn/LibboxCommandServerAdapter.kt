// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import android.content.Context
import cn.noyapi.dingtu.core.RedactedLogger
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SystemProxyStatus

class LibboxCommandServerAdapter(
    private val appContext: Context,
    private val platformInterface: DingtuPlatformInterface,
    private val onForegroundNotificationUpdate: (regionLabel: String?, modeLabel: String) -> Unit,
    private val onUnexpectedStopFromCore: () -> Unit,
) : CoreTunnelAdapter, CommandServerHandler {

    private val lock = Any()
    private var commandServer: CommandServer? = null

    @Volatile
    private var stoppingByAdapter: Boolean = false

    override fun startOrReload(
        closedLibboxConfigJson: String,
        routingPlan: EffectiveVpnApplicationPlan,
        regionLabel: String?,
    ) = synchronized(lock) {
        stoppingByAdapter = false

        // Pre-validate config syntax via native sing-box 1.14.2 before touching TUN.
        Libbox.checkConfig(closedLibboxConfigJson)
        platformInterface.setActiveRoutingPlan(routingPlan)

        val server = commandServer ?: Libbox.newCommandServer(this, platformInterface).also { created ->
            created.start()
            commandServer = created
        }

        val overrideOptions = OverrideOptions().apply {
            autoRedirect = false
        }
        try {
            server.startOrReloadService(closedLibboxConfigJson, overrideOptions)
        } finally {
            scrubSnapshotFiles()
        }
        onForegroundNotificationUpdate(regionLabel, routingPlan.mode.displayLabel)
    }

    override fun resetUnderlyingNetwork() {
        synchronized(lock) {
            commandServer?.resetNetwork()
        }
    }

    override fun stopAndReleaseTun(reason: String) = synchronized(lock) {
        stoppingByAdapter = true
        val existing = commandServer
        commandServer = null
        if (existing != null) {
            runCatching { existing.closeService() }
            runCatching { existing.close() }
        }
        platformInterface.shutdownMonitor()
        platformInterface.closeTunDescriptor()
        scrubSnapshotFiles()
    }

    override fun isTunActive(): Boolean = platformInterface.hasOpenTun()

    private fun scrubSnapshotFiles() {
        LibboxSnapshotScrubber.scrubAll(appContext)
    }

    // CommandServerHandler callbacks:

    override fun serviceReload() {
        RedactedLogger.info("Libbox requested serviceReload", "LibboxCore")
    }

    override fun serviceStop() {
        if (!stoppingByAdapter) {
            onUnexpectedStopFromCore()
        }
    }

    override fun getSystemProxyStatus(): SystemProxyStatus =
        SystemProxyStatus().apply {
            available = false
            enabled = false
        }

    override fun setSystemProxyEnabled(enabled: Boolean) = Unit

    override fun writeDebugMessage(message: String?) {
        if (!message.isNullOrBlank()) {
            RedactedLogger.info(message, "LibboxCore")
        }
    }

    override fun triggerNativeCrash() {
        throw UnsupportedOperationException("Native crash trigger disabled")
    }

    override fun connectSSHAgent(): Int {
        throw UnsupportedOperationException("SSH agent disabled")
    }
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import cn.noyapi.dingtu.core.VpnRoutingMode

enum class TunnelLifecycleState(val proxyStateWire: String) {
    DISCONNECTED("stopped"),
    CONNECTING("starting"),
    CONNECTED("running"),
    RELOADING("running"),
    DISCONNECTING("stopped"),
    FAILED_CLOSED("failed"),
}

data class ExitContextMetadata(
    val countryCode: String,
    val timezone: String,
    val locale: String,
    val regionLabel: String,
)

data class TunnelStatusSnapshot(
    val state: TunnelLifecycleState = TunnelLifecycleState.DISCONNECTED,
    val routingMode: VpnRoutingMode = VpnRoutingMode.PER_APP_VPN,
    val activePackageCount: Int = 0,
    val bindingRevision: String? = null,
    val configRevision: String? = null,
    val leaseExpiresAtUtc: String? = null,
    val exitContext: ExitContextMetadata? = null,
    val lastErrorCode: String? = null,
    val userRecoveryMessage: String? = null,
    val recentErrorCodes: List<String> = emptyList(),
    val recentRequestIds: List<String> = emptyList(),
)

fun interface MonotonicClock {
    fun elapsedRealtimeMillis(): Long
}

fun interface BootstrapDnsResolver {
    fun resolvePublicUnicastIps(hostname: String): List<String>
}

interface CoreTunnelAdapter {
    fun startOrReload(
        closedLibboxConfigJson: String,
        routingPlan: EffectiveVpnApplicationPlan,
        regionLabel: String?,
    )

    fun resetUnderlyingNetwork()

    fun stopAndReleaseTun(reason: String)

    fun isTunActive(): Boolean
}

interface ScheduledTaskHandle {
    fun cancel()
}

interface LeaseTaskScheduler {
    fun scheduleAfterMillis(delayMillis: Long, action: () -> Unit): ScheduledTaskHandle
    fun shutdown()
}

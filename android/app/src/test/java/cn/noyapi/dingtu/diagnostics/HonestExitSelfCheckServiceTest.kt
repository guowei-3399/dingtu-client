// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.diagnostics

import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HonestExitSelfCheckServiceTest {

    private val service = BasicConnectivityCheckService(clockMillis = { 1_795_400_000_000L })

    @Test
    fun disconnectedCheckDoesNotFabricateIpAndIpMaskingProtectsPrivacy() {
        val report = service.runSelfCheck(
            tunnelState = TunnelLifecycleState.DISCONNECTED,
            routingMode = VpnRoutingMode.PER_APP_VPN,
            exitContext = null,
        )
        assertFalse(report.tunnelConnected)
        assertFalse(report.probeReachable)
        assertNull(report.observedMaskedIp)
        assertTrue(report.connectivitySummary.contains("未连接"))

        assertEquals("203.0.*.*", BasicConnectivityCheckService.maskIpAddress("203.0.113.42"))
        assertEquals("2606:4700:*:*:*", BasicConnectivityCheckService.maskIpAddress("2606:4700:4700::1111"))
    }
}

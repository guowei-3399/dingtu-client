// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class VpnRoutingPolicyTest {

    @Test
    fun perAppVpnDefaultPreselectsInstalledAiAndBrowserAppsAndExcludesSelfAndDomesticApps() {
        val installed = setOf(
            DingtuConstants.APPLICATION_ID,
            "com.openai.chatgpt",
            "com.anthropic.claude",
            "com.android.chrome",
            "com.tencent.mm",
            "com.eg.android.AlipayGphone",
        )

        val plan = VpnRoutingPolicy.computeEffectivePlan(
            mode = VpnRoutingMode.PER_APP_VPN,
            userSelectedPackages = null,
            hasExplicitUserSelection = false,
            installedPackages = installed,
        )

        assertEquals(VpnRoutingMode.PER_APP_VPN, plan.mode)
        assertEquals(
            setOf("com.android.chrome", "com.anthropic.claude", "com.openai.chatgpt"),
            plan.allowedPackages,
        )
        assertFalse(DingtuConstants.APPLICATION_ID in plan.allowedPackages)
        assertFalse("com.tencent.mm" in plan.allowedPackages)
        assertTrue(plan.disallowedPackages.isEmpty())
    }

    @Test
    fun perAppVpnStripsSelfPackageAndRejectsEmptyEffectiveAllowlistFailClosed() {
        val installed = setOf("com.tencent.mm", DingtuConstants.APPLICATION_ID)

        // Default preselection finds zero installed AI apps -> must refuse fail-closed
        val emptyDefaultEx = assertThrows(VpnRoutingException::class.java) {
            VpnRoutingPolicy.computeEffectivePlan(
                mode = VpnRoutingMode.PER_APP_VPN,
                userSelectedPackages = null,
                hasExplicitUserSelection = false,
                installedPackages = installed,
            )
        }
        assertEquals("PER_APP_VPN_EMPTY_ALLOWLIST", emptyDefaultEx.errorCode)

        // Explicit selection containing only self or uninstalled package -> must refuse fail-closed
        val selfOnlyEx = assertThrows(VpnRoutingException::class.java) {
            VpnRoutingPolicy.computeEffectivePlan(
                mode = VpnRoutingMode.PER_APP_VPN,
                userSelectedPackages = setOf(DingtuConstants.APPLICATION_ID, "com.uninstalled.app"),
                hasExplicitUserSelection = true,
                installedPackages = installed,
            )
        }
        assertEquals("PER_APP_VPN_EMPTY_ALLOWLIST", selfOnlyEx.errorCode)
    }

    @Test
    fun globalVpnExcludesOnlySelfPackage() {
        val installed = setOf(
            DingtuConstants.APPLICATION_ID,
            "com.openai.chatgpt",
            "com.tencent.mm",
        )

        val plan = VpnRoutingPolicy.computeEffectivePlan(
            mode = VpnRoutingMode.GLOBAL_VPN,
            userSelectedPackages = setOf("com.openai.chatgpt"),
            hasExplicitUserSelection = true,
            installedPackages = installed,
        )

        assertEquals(VpnRoutingMode.GLOBAL_VPN, plan.mode)
        assertTrue(plan.allowedPackages.isEmpty())
        assertEquals(setOf(DingtuConstants.APPLICATION_ID), plan.disallowedPackages)
    }
}

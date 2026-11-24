// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui

import androidx.compose.ui.unit.dp
import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.diagnostics.BasicConnectivityCheckService
import cn.noyapi.dingtu.diagnostics.ExitSelfCheckRunner
import cn.noyapi.dingtu.diagnostics.NetworkSelfCheckReport
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.HttpResponseData
import cn.noyapi.dingtu.network.HttpTransport
import cn.noyapi.dingtu.storage.InMemoryDeviceSessionStore
import cn.noyapi.dingtu.vpn.ExitContextMetadata
import cn.noyapi.dingtu.vpn.InMemoryRoutingPreferencesStore
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import cn.noyapi.dingtu.vpn.TunnelStatusSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.concurrent.Executor

class DingtuAppControllerAndUiPolicyTest {

    private val directExecutor = Executor { runnable -> runnable.run() }
    private val fixedNow = Instant.parse("2026-11-23T06:00:00.000Z").toEpochMilli()
    private val deviceId = "77777777-7777-4777-8777-777777777777"
    private val ticketId = "tkt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

    @Test
    fun controllerHandlesPkceLoginRoutingUsageTicketsAndReliableLogoutEndToEnd() {
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore(VpnRoutingMode.PER_APP_VPN)
        val tunnelFlow = MutableStateFlow(TunnelStatusSnapshot())

        var reloadCalls = 0
        var stopVpnCalls = 0
        var deleteSessionCalls = 0
        var capturedTicketCreateBody: JSONObject? = null

        val controlClient = DingtuControlClient(
            transport = { req ->
                when {
                    req.method == "POST" && req.url.endsWith("/api/v1/client/device/sessions") -> {
                        val resp = JSONObject()
                            .put("device", JSONObject().put("id", deviceId).put("platform", "android").put("appVersion", "0.1.0").put("status", "active").put("createdAt", "2026-11-23T06:00:00.000Z"))
                            .put("session", JSONObject().put("accessToken", "nda_ui_flow_access_1234567").put("expiresIn", 600).put("refreshToken", "ndr_ui_flow_refresh_1234567").put("refreshExpiresAt", "2026-12-23T06:00:00.000Z").put("scope", JSONArray(listOf("customer.read", "tunnel.read", "device.revoke"))))
                        HttpResponseData(201, emptyMap(), resp.toString().toByteArray())
                    }
                    req.url.endsWith("/api/v1/me") ->
                        HttpResponseData(200, emptyMap(), """{"user":{"email":"tester@noyapi.cn"}}""".toByteArray())
                    req.url.endsWith("/api/v1/tenants/me") ->
                        HttpResponseData(200, emptyMap(), """{"customer":{"type":"personal","level":"gold","memberRole":"owner"},"entitlement":{"effectiveTrafficQuotaBytes":107374182400,"expiresAt":"2026-12-31T16:00:00.000Z"}}""".toByteArray())
                    req.url.endsWith("/api/v1/assistant/overview") ->
                        HttpResponseData(200, emptyMap(), """{"data_source":"real","exitContext":{"countryCode":"US","timezone":"America/Los_Angeles","locale":"en-US","regionLabel":"US · Los Angeles"}}""".toByteArray())
                    req.url.endsWith("/api/v1/client/devices") ->
                        HttpResponseData(200, emptyMap(), """{"devices":[{"id":"$deviceId","deviceName":"MuMu 12","platform":"android","appVersion":"0.1.0","status":"active","createdAt":"2026-11-23T06:00:00.000Z"}]}""".toByteArray())
                    req.url.contains("/api/v1/tenants/me/usage-summary") ->
                        HttpResponseData(200, emptyMap(), """{"data_source":"real","windowDays":30,"totals":{"totalTokens":597000,"inputTokens":125000,"thinkingTokens":38000,"outputTokens":24000,"cacheTokens":410000,"sessions":3,"turns":42,"activeDevices":1},"byApp":[{"appId":"claude-code","totalTokens":597000,"sessions":3,"turns":42}]}""".toByteArray())
                    req.method == "GET" && req.url.contains("/api/v1/client/tickets?") ->
                        HttpResponseData(200, emptyMap(), """{"data_source":"real","tickets":[{"ticketId":"$ticketId","subject":"工单测试","category":"connection","status":"submitted","unreadByCustomer":false,"updatedAt":"2026-11-23T06:00:00.000Z"}]}""".toByteArray())
                    req.method == "POST" && req.url.endsWith("/api/v1/client/tickets") -> {
                        capturedTicketCreateBody = JSONObject(String(req.bodyBytes!!, StandardCharsets.UTF_8))
                        HttpResponseData(201, emptyMap(), """{"ticket":{"ticketId":"$ticketId","subject":"测试工单","category":"connection","status":"submitted"},"message":{"messageId":"m1"}}""".toByteArray())
                    }
                    req.method == "GET" && req.url.endsWith("/api/v1/client/tickets/$ticketId") ->
                        HttpResponseData(200, emptyMap(), """{"data_source":"real","ticket":{"ticketId":"$ticketId","subject":"工单测试","category":"connection","status":"resolved"},"messages":[{"messageId":"m1","authorRole":"customer","body":"请排查","createdAt":"2026-11-23T06:00:00.000Z"}]}""".toByteArray())
                    req.method == "POST" && req.url.endsWith("/api/v1/client/tickets/$ticketId/messages") ->
                        HttpResponseData(200, emptyMap(), """{"ticket":{"ticketId":"$ticketId","status":"closed"},"message":{"messageId":"m2"}}""".toByteArray())
                    req.method == "DELETE" && req.url.endsWith("/api/v1/client/device/sessions/$deviceId") -> {
                        deleteSessionCalls++
                        HttpResponseData(204, emptyMap(), ByteArray(0))
                    }
                    else -> error("Unexpected request: ${req.method} ${req.url}")
                }
            },
            nowProvider = { fixedNow },
        )

        val sessionExecutor = AuthenticatedSessionExecutor(
            sessionStore = sessionStore,
            controlClient = controlClient,
            wallClockMillis = { fixedNow },
        )
        val fakeSelfCheck = object : ExitSelfCheckRunner {
            override fun runSelfCheck(
                tunnelState: TunnelLifecycleState,
                routingMode: VpnRoutingMode,
                exitContext: ExitContextMetadata?,
            ): NetworkSelfCheckReport = NetworkSelfCheckReport(
                checkedAtMillis = fixedNow,
                tunnelConnected = tunnelState == TunnelLifecycleState.CONNECTED,
                routingMode = routingMode,
                boundExitRegionLabel = exitContext?.regionLabel ?: "基础联通节点",
                probeReachable = true,
                observedMaskedIp = "203.0.*.*",
                observedCountryOrTrace = "US · LAX",
                connectivitySummary = "基础隧道联通正常",
                routingScopeNote = "受管应用经基础隧道转发",
            )
        }

        val controller = DingtuAppController(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            sessionExecutor = sessionExecutor,
            selfCheckRunner = fakeSelfCheck,
            tunnelStatusFlow = tunnelFlow,
            installedAppsLoader = {
                listOf(
                    InstalledAppDisplayItem("com.openai.chatgpt", "ChatGPT", true, "AI 助手"),
                    InstalledAppDisplayItem("com.android.chrome", "Chrome", true, "浏览器"),
                    InstalledAppDisplayItem("com.tencent.mm", "WeChat", false, null),
                )
            },
            onRequestReloadVpnRouting = { reloadCalls++ },
            onRequestStopVpn = { stopVpnCalls++ },
            ioExecutor = directExecutor,
        )

        // 1. Initial load preselects recommended installed AI/browser apps only
        controller.refreshInitialData()
        assertFalse(controller.uiState.value.isLoggedIn)
        assertEquals(setOf("com.android.chrome", "com.openai.chatgpt"), controller.uiState.value.selectedPackages)

        // 2. PKCE deep link authorization & callback exchange
        val authUrl = controller.prepareDeepLinkAuthorizeUrl()
        val stateParam = Regex("state=([^&]+)").find(authUrl)!!.groupValues[1]
        controller.handleIncomingAuthCallbackUri(
            rawUri = "noya://auth/callback?code=nac_ui_flow_code_1234567890&state=$stateParam",
            deviceName = "MuMu 12",
        )
        assertTrue(controller.uiState.value.isLoggedIn)
        assertEquals("t***@noyapi.cn", controller.uiState.value.accountSummary?.maskedEmail)
        assertEquals("US · Los Angeles", controller.uiState.value.accountSummary?.boundExitContext?.regionLabel)

        // 3. Running per_app_vpn blocks unchecking last managed app
        tunnelFlow.value = TunnelStatusSnapshot(state = TunnelLifecycleState.CONNECTED)
        controller.toggleManagedPackage("com.android.chrome")
        assertEquals(setOf("com.openai.chatgpt"), controller.uiState.value.selectedPackages)
        assertEquals(1, reloadCalls)
        controller.toggleManagedPackage("com.openai.chatgpt")
        assertEquals(setOf("com.openai.chatgpt"), controller.uiState.value.selectedPackages)
        assertNotNull(controller.uiState.value.errorBannerMessage)

        // 4. Switch to global_vpn triggers live reload
        controller.setRoutingMode(VpnRoutingMode.GLOBAL_VPN)
        assertEquals(VpnRoutingMode.GLOBAL_VPN, controller.uiState.value.routingMode)
        assertEquals(2, reloadCalls)

        // 5. Usage & tickets tab auto-loads usage summary & ticket list + creates ticket with sanitized snapshot
        controller.selectTab(MainNavTab.USAGE_AND_TICKETS)
        assertEquals(597000L, controller.uiState.value.usageSummary?.totalTokens)
        assertEquals(1, controller.uiState.value.tickets.size)

        controller.submitNewTicket("测试工单", "connection", "排查问题")
        val sentSnap = capturedTicketCreateBody!!.getJSONObject("diagnosticSnapshot")
        assertEquals(DingtuConstants.APP_VERSION, sentSnap.getString("appVersion"))
        assertEquals("android", sentSnap.getString("platform"))
        assertEquals("tun", sentSnap.getString("environmentMode"))
        assertEquals("running", sentSnap.getString("proxyState"))

        controller.openTicketDetail(ticketId)
        assertEquals(ticketId, controller.uiState.value.activeTicketDetail?.summary?.ticketId)
        controller.submitTicketMessageOrAction(ticketId, null, "close")

        // 6. Honest self-check runs and updates report
        controller.runHonestSelfCheck()
        assertEquals("203.0.*.*", controller.uiState.value.lastSelfCheckReport?.observedMaskedIp)

        // 7. Reliable logout stops VPN, calls DELETE 204, wipes store and UI state
        controller.performLogout()
        assertEquals(1, stopVpnCalls)
        assertEquals(1, deleteSessionCalls)
        assertFalse(controller.uiState.value.isLoggedIn)
        assertNull(sessionStore.readSession())
        assertEquals(MainNavTab.CONNECT, controller.uiState.value.currentTab)
    }

    @Test
    fun uiSourcesContainZeroForbiddenDesktopOrNodeSelectorTerms() {
        val forbiddenTerms = listOf(
            "节点列表",
            "选择地区",
            "切换节点",
            "切换线路",
            "手动填写",
            "规则编辑",
            "导入订阅",
            "订阅导入",
            "直连绕过",
            "17899",
            "硬件指纹",
            "AdsPower",
            "TOTP",
            "工作台",
            "Trojan",
            "Shadowsocks",
        )

        val candidateDirs = listOf(
            File("src/main/java/cn/noyapi/dingtu/ui"),
            File("app/src/main/java/cn/noyapi/dingtu/ui"),
        )
        val uiDir = candidateDirs.firstOrNull { it.isDirectory }
            ?: error("Could not locate UI source directory from ${File(".").absolutePath}")

        val mainFiles = uiDir.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .toMutableList()
        val mainActivity = listOf(
            File("src/main/java/cn/noyapi/dingtu/MainActivity.kt"),
            File("app/src/main/java/cn/noyapi/dingtu/MainActivity.kt"),
        ).firstOrNull { it.isFile }
        assertNotNull("MainActivity.kt must exist", mainActivity)
        mainFiles.add(mainActivity!!)

        val stringsXml = listOf(
            File("src/main/res/values/strings.xml"),
            File("app/src/main/res/values/strings.xml"),
        ).firstOrNull { it.isFile }
        assertNotNull("strings.xml must exist", stringsXml)
        mainFiles.add(stringsXml!!)

        assertTrue("Expected at least 6 UI files to audit", mainFiles.size >= 6)

        val violations = mutableListOf<String>()
        for (file in mainFiles) {
            val content = file.readText(StandardCharsets.UTF_8)
            for (term in forbiddenTerms) {
                if (content.contains(term, ignoreCase = true)) {
                    violations.add("${file.name} contains forbidden term '$term'")
                }
            }
        }
        assertTrue("Forbidden UI terms found: $violations", violations.isEmpty())
    }

    @Test
    fun officialDingtuBrandIconsAndAdaptiveResourcesArePresentAndAligned() {
        val resRoot = listOf(File("src/main/res"), File("app/src/main/res"))
            .firstOrNull { it.isDirectory }
            ?: error("Could not locate Android res directory")

        val bgXml = File(resRoot, "drawable/ic_launcher_background.xml")
        val fgXml = File(resRoot, "drawable/ic_launcher_foreground.xml")
        val notifXml = File(resRoot, "drawable/ic_notification_dingtu.xml")
        val adaptiveXml = File(resRoot, "mipmap-anydpi-v26/ic_launcher.xml")
        val adaptiveRoundXml = File(resRoot, "mipmap-anydpi-v26/ic_launcher_round.xml")

        listOf(bgXml, fgXml, notifXml, adaptiveXml, adaptiveRoundXml).forEach { file ->
            assertTrue("Missing required brand resource: ${file.path}", file.isFile)
        }

        assertTrue(bgXml.readText(StandardCharsets.UTF_8).contains("#FF242425"))
        assertTrue(fgXml.readText(StandardCharsets.UTF_8).contains("M2,13"))
        assertTrue(notifXml.readText(StandardCharsets.UTF_8).contains("M2,13"))
        assertTrue(adaptiveXml.readText(StandardCharsets.UTF_8).contains("@drawable/ic_launcher_foreground"))
        assertTrue(adaptiveRoundXml.readText(StandardCharsets.UTF_8).contains("@drawable/ic_launcher_foreground"))

        for (density in listOf("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")) {
            val sq = File(resRoot, "mipmap-$density/ic_launcher.png")
            val rd = File(resRoot, "mipmap-$density/ic_launcher_round.png")
            assertTrue("Missing density launcher icon: ${sq.path}", sq.isFile && sq.length() > 100L)
            assertTrue("Missing density round launcher icon: ${rd.path}", rd.isFile && rd.length() > 100L)
        }

        // Unified Phone/Tablet official visual assets
        val unifiedAssets = listOf(
            "drawable-nodpi/bg_connection_hero.jpg",
            "drawable-nodpi/logo_app_claude.png",
            "drawable-nodpi/logo_app_openai.png",
            "drawable-nodpi/logo_app_gemini.png",
            "drawable-nodpi/logo_app_grok.png",
            "drawable/ic_logo_copilot.xml",
            "drawable/ic_power.xml",
            "drawable/ic_sun.xml",
            "drawable/ic_moon.xml",
        )
        for (rel in unifiedAssets) {
            val f = File(resRoot, rel)
            assertTrue("Missing unified UI brand asset: ${f.path}", f.isFile && f.length() > 80L)
        }
    }

    @Test
    fun darkLightThemeTogglePersistsAndResponsiveLayoutTiersMatchBreakpoints() {
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore(initialDarkTheme = true)
        val controlClient = DingtuControlClient(
            transport = HttpTransport { throw AssertionError("No network expected") }
        )
        val executor = AuthenticatedSessionExecutor(sessionStore, controlClient)
        val tunnelFlow = MutableStateFlow(TunnelStatusSnapshot())

        val controller = DingtuAppController(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            sessionExecutor = executor,
            selfCheckRunner = BasicConnectivityCheckService(),
            tunnelStatusFlow = tunnelFlow,
            installedAppsLoader = { emptyList() },
            ioExecutor = directExecutor,
        )

        // Default is dark mode on mobile
        assertTrue(controller.uiState.value.isDarkTheme)
        controller.toggleTheme()
        assertFalse(controller.uiState.value.isDarkTheme)
        assertFalse(routingStore.getDarkThemeEnabled())

        controller.setDarkTheme(true)
        assertTrue(controller.uiState.value.isDarkTheme)
        assertTrue(routingStore.getDarkThemeEnabled())

        // Verify Phone (< 600dp), Medium Tablet (600..799dp), Large Tablet (>= 800dp) breakpoints
        assertEquals(
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.PHONE,
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.fromWidth(392.dp),
        )
        assertEquals(
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.MEDIUM_TABLET,
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.fromWidth(700.dp),
        )
        assertEquals(
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.LARGE_TABLET,
            cn.noyapi.dingtu.ui.components.DingtuLayoutTier.fromWidth(960.dp),
        )
    }

    @Test
    fun backgroundFailClosedSessionRevocationImmediatelySignsOutUi() {
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore()
        val controlClient = DingtuControlClient(
            transport = HttpTransport { throw AssertionError("No network expected") }
        )
        val executor = AuthenticatedSessionExecutor(sessionStore, controlClient)
        val tunnelFlow = MutableStateFlow(TunnelStatusSnapshot())

        sessionStore.saveSession(
            cn.noyapi.dingtu.storage.StoredDeviceSession(
                deviceId = "22222222-3333-4444-8555-666666666666",
                platform = "android",
                appVersion = DingtuConstants.APP_VERSION,
                status = "active",
                createdAt = "2026-11-23T00:00:00.000Z",
                accessToken = "nda_active_token_1234567890",
                accessExpiresAtMillis = System.currentTimeMillis() + 600_000L,
                refreshToken = "ndr_active_refresh_1234567890",
                refreshExpiresAt = "2026-12-23T00:00:00.000Z",
                scopes = listOf("tunnel.read"),
            )
        )

        val controller = DingtuAppController(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            sessionExecutor = executor,
            selfCheckRunner = BasicConnectivityCheckService(),
            tunnelStatusFlow = tunnelFlow,
            installedAppsLoader = { emptyList() },
            ioExecutor = Executor { it.run() },
        )
        assertTrue(controller.uiState.value.isLoggedIn)

        // Simulate background lease renewal receiving 401 SESSION_INVALID -> wiping store -> publishing FAILED_CLOSED
        sessionStore.clearAll()
        val failClosedSnap = TunnelStatusSnapshot(
            state = TunnelLifecycleState.FAILED_CLOSED,
            lastErrorCode = "SESSION_INVALID",
            userRecoveryMessage = "登录授权已失效或已在其他终端登录，请重新授权登录。",
        )
        tunnelFlow.value = failClosedSnap
        controller.onTunnelStatusChanged(failClosedSnap)

        assertFalse(controller.uiState.value.isLoggedIn)
        assertNull(controller.uiState.value.currentDeviceId)
        assertEquals("登录授权已失效或已在其他终端登录，请重新授权登录。", controller.uiState.value.errorBannerMessage)
    }
}

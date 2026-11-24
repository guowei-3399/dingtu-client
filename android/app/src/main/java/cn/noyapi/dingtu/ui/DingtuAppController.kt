// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui

import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.auth.LoopbackCallbackServer
import cn.noyapi.dingtu.auth.PkceAuthorizationRequest
import cn.noyapi.dingtu.auth.PkceAuthManager
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.diagnostics.ExitSelfCheckRunner
import cn.noyapi.dingtu.network.DiagnosticSnapshotPayload
import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.storage.DeviceSessionStore
import cn.noyapi.dingtu.telemetry.AndroidTelemetryReporter
import cn.noyapi.dingtu.telemetry.LatencySampleStatus
import cn.noyapi.dingtu.telemetry.LatencySampleTrigger
import cn.noyapi.dingtu.telemetry.TelemetryCategory
import cn.noyapi.dingtu.telemetry.TelemetryEventStatus
import cn.noyapi.dingtu.telemetry.TelemetryHealthSummary
import cn.noyapi.dingtu.telemetry.TelemetrySeverity
import cn.noyapi.dingtu.telemetry.TelemetryStage
import cn.noyapi.dingtu.vpn.ExitContextMetadata
import cn.noyapi.dingtu.vpn.RoutingPreferencesStore
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import cn.noyapi.dingtu.vpn.TunnelStatusSnapshot
import cn.noyapi.dingtu.vpn.VpnRoutingPolicy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executor
import java.util.concurrent.Executors

class DingtuAppController(
    private val sessionStore: DeviceSessionStore,
    private val routingStore: RoutingPreferencesStore,
    private val controlClient: DingtuControlClient,
    private val sessionExecutor: AuthenticatedSessionExecutor,
    private val selfCheckRunner: ExitSelfCheckRunner,
    val tunnelStatusFlow: StateFlow<TunnelStatusSnapshot>,
    private val installedAppsLoader: () -> List<InstalledAppDisplayItem>,
    private val onRequestReloadVpnRouting: () -> Unit = {},
    private val onRequestStopVpn: () -> Unit = {},
    private val onPublishBoundExitContext: (ExitContextMetadata?) -> Unit = {},
    private val telemetryReporter: AndroidTelemetryReporter? = null,
    private val ioExecutor: Executor = Executors.newCachedThreadPool { r ->
        Thread(r, "dingtu-ui-io").apply { isDaemon = true }
    },
) {
    private val pkceLock = Any()
    private var pendingPkceRequest: PkceAuthorizationRequest? = null
    private var activeLoopbackServer: LoopbackCallbackServer? = null

    private val controllerErrorCodes = ArrayDeque<String>(10)
    private val controllerRequestIds = ArrayDeque<String>(10)

    private val fallbackTelemetryFlow = MutableStateFlow(TelemetryHealthSummary())
    val telemetrySummaryFlow: StateFlow<TelemetryHealthSummary> =
        telemetryReporter?.summaryFlow ?: fallbackTelemetryFlow.asStateFlow()

    private val _uiState = MutableStateFlow(createInitialState())
    val uiState: StateFlow<DingtuUiState> = _uiState.asStateFlow()

    private fun createInitialState(): DingtuUiState {
        val existingSession = sessionStore.readSession()
        val mode = routingStore.getRoutingMode()
        val darkTheme = routingStore.getDarkThemeEnabled()
        return DingtuUiState(
            isDarkTheme = darkTheme,
            isLoggedIn = existingSession != null,
            currentDeviceId = existingSession?.deviceId,
            routingMode = mode,
        )
    }

    fun setDarkTheme(enabled: Boolean) {
        routingStore.setDarkThemeEnabled(enabled)
        _uiState.update { it.copy(isDarkTheme = enabled) }
    }

    fun toggleTheme() {
        setDarkTheme(!_uiState.value.isDarkTheme)
    }

    fun refreshInitialData() {
        ioExecutor.execute {
            val apps = runCatching { installedAppsLoader() }.getOrDefault(emptyList())
                .sortedWith(
                    compareByDescending<InstalledAppDisplayItem> { it.isRecommended }
                        .thenBy { it.displayName.lowercase() }
                )
            val installedSet = apps.map { it.packageName }.toSet()
            val selectedSet = if (routingStore.hasExplicitSelection()) {
                routingStore.getSelectedPackages().intersect(installedSet)
            } else {
                VpnRoutingPolicy.defaultPreselectedPackages(installedSet)
            }

            val existing = sessionStore.readSession()
            _uiState.update { state ->
                state.copy(
                    isLoggedIn = existing != null,
                    currentDeviceId = existing?.deviceId,
                    routingMode = routingStore.getRoutingMode(),
                    installedApps = apps,
                    selectedPackages = selectedSet,
                )
            }
            if (existing != null) {
                refreshAccountAndDevicesSync()
            }
        }
    }

    fun selectTab(tab: MainNavTab) {
        _uiState.update { it.copy(currentTab = tab, errorBannerMessage = null) }
        when (tab) {
            MainNavTab.USAGE_AND_TICKETS -> {
                if (_uiState.value.isLoggedIn) {
                    if (_uiState.value.usageSummary == null) {
                        loadUsageSummary(_uiState.value.selectedUsageDays)
                    }
                    if (_uiState.value.tickets.isEmpty()) {
                        loadTickets()
                    }
                }
            }
            MainNavTab.PROFILE -> {
                if (_uiState.value.isLoggedIn) {
                    refreshAccountBundle()
                }
            }
            else -> Unit
        }
    }

    fun dismissBanners() {
        _uiState.update { it.copy(statusBannerMessage = null, errorBannerMessage = null) }
    }

    fun reportErrorBanner(message: String) {
        _uiState.update { it.copy(errorBannerMessage = RedactedLogger.redact(message)) }
    }

    fun onTunnelStatusChanged(snapshot: TunnelStatusSnapshot) {
        if (snapshot.state != TunnelLifecycleState.FAILED_CLOSED) return
        val sessionStillExists = runCatching { sessionStore.readSession() != null }.getOrDefault(true)
        if (!sessionStillExists) {
            _uiState.update { state ->
                if (!state.isLoggedIn && state.errorBannerMessage != null) {
                    state
                } else {
                    state.copy(
                        currentTab = MainNavTab.CONNECT,
                        isLoggedIn = false,
                        currentDeviceId = null,
                        accountSummary = null,
                        authorizedDevices = emptyList(),
                        usageSummary = null,
                        tickets = emptyList(),
                        activeTicketDetail = null,
                        showCreateTicketForm = false,
                        lastSelfCheckReport = null,
                        errorBannerMessage = RedactedLogger.redact(
                            snapshot.userRecoveryMessage
                                ?: "设备会话已失效或已在其他终端登录，请重新授权。"
                        ),
                    )
                }
            }
        }
    }

    // 1. PKCE Browser Authorization (Deep Link primary + RFC 8252 Loopback fallback)

    fun prepareDeepLinkAuthorizeUrl(): String {
        val req = PkceAuthManager.createAuthorizationRequest(
            redirectUri = DingtuConstants.OAUTH_DEEP_LINK_REDIRECT_URI,
        )
        synchronized(pkceLock) {
            activeLoopbackServer?.close()
            activeLoopbackServer = null
            pendingPkceRequest = req
        }
        _uiState.update {
            it.copy(
                errorBannerMessage = null,
                statusBannerMessage = "请在浏览器确认授权，完成后将自动返回定途。",
            )
        }
        return req.authorizeUrl
    }

    fun handleIncomingAuthCallbackUri(rawUri: String, deviceName: String) {
        val expected = synchronized(pkceLock) {
            val current = pendingPkceRequest
            pendingPkceRequest = null
            current
        }
        if (expected == null) {
            _uiState.update {
                it.copy(errorBannerMessage = "未找到待处理的登录请求，请重新点击授权登录。")
            }
            return
        }

        _uiState.update { it.copy(authBusy = true, errorBannerMessage = null, statusBannerMessage = null) }
        ioExecutor.execute {
            try {
                val callback = PkceAuthManager.validateCallbackUri(rawUri, expected)
                val deviceJwk = sessionStore.getDevicePublicKeyJwk()
                val session = controlClient.exchangeAuthorizationCode(
                    authorizationCode = callback.authorizationCode,
                    codeVerifier = expected.codeVerifier,
                    redirectUri = callback.redirectUri,
                    deviceName = deviceName,
                    devicePublicKey = deviceJwk,
                )
                sessionStore.saveSession(session)
                _uiState.update {
                    it.copy(
                        isLoggedIn = true,
                        currentDeviceId = session.deviceId,
                        authBusy = false,
                        statusBannerMessage = "设备授权成功，已启用硬件级安全凭据保护。",
                    )
                }
                refreshAccountAndDevicesSync()
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                recordTelemetryError(
                    category = TelemetryCategory.AUTH,
                    stage = TelemetryStage.PKCE_LOGIN,
                    action = "pkce_deep_link_exchange_failed",
                    err = err,
                )
                val rawBanner = if (err is DingtuApiException) {
                    "${err.message}（${err.errorCode}）"
                } else {
                    err.message ?: "授权登录未完成，请重试。"
                }
                _uiState.update {
                    it.copy(
                        authBusy = false,
                        errorBannerMessage = RedactedLogger.redact(rawBanner),
                    )
                }
            }
        }
    }

    fun startLoopbackFallbackLogin(
        deviceName: String,
        openBrowserUrl: (String) -> Unit,
    ) {
        _uiState.update { it.copy(authBusy = true, errorBannerMessage = null, statusBannerMessage = null) }
        ioExecutor.execute {
            val server = try {
                LoopbackCallbackServer.bindEphemeral()
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                recordTelemetryError(
                    category = TelemetryCategory.AUTH,
                    stage = TelemetryStage.PKCE_LOGIN,
                    action = "pkce_loopback_exchange_failed",
                    err = err,
                )
                _uiState.update {
                    it.copy(authBusy = false, errorBannerMessage = "本地回调通道初始化失败，请使用主授权方式。")
                }
                return@execute
            }

            val req = PkceAuthManager.createAuthorizationRequest(redirectUri = server.redirectUri)
            synchronized(pkceLock) {
                activeLoopbackServer?.close()
                activeLoopbackServer = server
                pendingPkceRequest = null
            }

            try {
                openBrowserUrl(req.authorizeUrl)
                val callbackUri = server.awaitCallbackUri(timeoutMillis = 120_000)
                val verified = PkceAuthManager.validateCallbackUri(callbackUri, req)
                val deviceJwk = sessionStore.getDevicePublicKeyJwk()
                val session = controlClient.exchangeAuthorizationCode(
                    authorizationCode = verified.authorizationCode,
                    codeVerifier = req.codeVerifier,
                    redirectUri = verified.redirectUri,
                    deviceName = deviceName,
                    devicePublicKey = deviceJwk,
                )
                sessionStore.saveSession(session)
                _uiState.update {
                    it.copy(
                        isLoggedIn = true,
                        currentDeviceId = session.deviceId,
                        authBusy = false,
                        statusBannerMessage = "授权登录成功。",
                    )
                }
                refreshAccountAndDevicesSync()
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                recordTelemetryError(
                    category = TelemetryCategory.AUTH,
                    stage = TelemetryStage.PKCE_LOGIN,
                    action = "pkce_loopback_exchange_failed",
                    err = err,
                )
                _uiState.update {
                    it.copy(
                        authBusy = false,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "本地回环授权超时或已取消。"),
                    )
                }
            } finally {
                server.close()
                synchronized(pkceLock) {
                    if (activeLoopbackServer === server) {
                        activeLoopbackServer = null
                    }
                }
            }
        }
    }

    fun performLogout() {
        _uiState.update { it.copy(authBusy = true, errorBannerMessage = null) }
        ioExecutor.execute {
            runCatching { telemetryReporter?.flushNowBestEffort() }
            try {
                sessionExecutor.logoutReliably(stopTunnelAction = onRequestStopVpn)
            } catch (err: Exception) {
                recordTelemetryError(
                    category = TelemetryCategory.AUTH,
                    stage = TelemetryStage.LOGOUT,
                    action = "logout_failed",
                    err = err,
                )
                throw err
            } finally {
                telemetryReporter?.clearPendingOnLogout()
            }
            _uiState.update { state ->
                state.copy(
                    currentTab = MainNavTab.CONNECT,
                    isLoggedIn = false,
                    currentDeviceId = null,
                    authBusy = false,
                    accountSummary = null,
                    authorizedDevices = emptyList(),
                    usageSummary = null,
                    tickets = emptyList(),
                    activeTicketDetail = null,
                    showCreateTicketForm = false,
                    lastSelfCheckReport = null,
                    statusBannerMessage = "已安全退出登录并撤销本机设备会话。",
                )
            }
        }
    }

    // 2. Routing Mode & Per-App Allowlist Management

    fun setRoutingMode(mode: VpnRoutingMode) {
        if (mode == VpnRoutingMode.PER_APP_VPN && _uiState.value.selectedPackages.isEmpty()) {
            val defaults = VpnRoutingPolicy.defaultPreselectedPackages(
                _uiState.value.installedApps.map { it.packageName }.toSet()
            )
            if (defaults.isNotEmpty()) {
                routingStore.setSelectedPackages(defaults)
                _uiState.update { it.copy(selectedPackages = defaults) }
            }
        }
        routingStore.setRoutingMode(mode)
        _uiState.update { it.copy(routingMode = mode, errorBannerMessage = null) }
        onRequestReloadVpnRouting()
    }

    fun updateAppSearchQuery(query: String) {
        _uiState.update { it.copy(appSearchQuery = query) }
    }

    fun updateAppFilter(filter: AppListFilter) {
        _uiState.update { it.copy(appFilter = filter) }
    }

    fun toggleManagedPackage(packageName: String) {
        if (packageName == DingtuConstants.APPLICATION_ID) return
        val current = _uiState.value.selectedPackages
        val updated = if (packageName in current) {
            val candidate = current - packageName
            if (candidate.isEmpty() &&
                _uiState.value.routingMode == VpnRoutingMode.PER_APP_VPN &&
                tunnelStatusFlow.value.state == TunnelLifecycleState.CONNECTED
            ) {
                _uiState.update {
                    it.copy(errorBannerMessage = "按应用分流运行中至少需保留 1 款受管应用；如需全部停用请先断开隧道。")
                }
                return
            }
            candidate
        } else {
            current + packageName
        }

        routingStore.setSelectedPackages(updated)
        _uiState.update { it.copy(selectedPackages = updated, errorBannerMessage = null) }
        if (_uiState.value.routingMode == VpnRoutingMode.PER_APP_VPN) {
            onRequestReloadVpnRouting()
        }
    }

    fun filteredInstalledApps(state: DingtuUiState): List<InstalledAppDisplayItem> {
        val q = state.appSearchQuery.trim().lowercase()
        return state.installedApps.filter { item ->
            val matchesFilter = when (state.appFilter) {
                AppListFilter.RECOMMENDED -> item.isRecommended
                AppListFilter.SELECTED -> item.packageName in state.selectedPackages
                AppListFilter.ALL -> true
            }
            val matchesQuery = q.isEmpty() ||
                item.displayName.lowercase().contains(q) ||
                item.packageName.lowercase().contains(q)
            matchesFilter && matchesQuery
        }
    }

    // 3. Honest Network & Exit Self-Check

    fun runHonestSelfCheck() {
        val snapshot = tunnelStatusFlow.value
        val exitCtx = snapshot.exitContext ?: _uiState.value.accountSummary?.boundExitContext
        _uiState.update { it.copy(selfCheckBusy = true, errorBannerMessage = null) }
        ioExecutor.execute {
            val startNanos = System.nanoTime()
            val report = selfCheckRunner.runSelfCheck(
                tunnelState = snapshot.state,
                routingMode = _uiState.value.routingMode,
                exitContext = exitCtx,
            )
            val totalMs = ((System.nanoTime() - startNanos) / 1_000_000L).coerceAtLeast(1L)
            if (report.tunnelConnected) {
                val sampleStatus = if (report.probeReachable) {
                    LatencySampleStatus.OK
                } else {
                    LatencySampleStatus.DEGRADED
                }
                telemetryReporter?.recordLatencySample(
                    trigger = LatencySampleTrigger.SELF_CHECK,
                    status = sampleStatus,
                    dnsMs = null,
                    e2eTtfbMs = totalMs,
                    totalMs = totalMs,
                    errorCode = if (!report.probeReachable) "SELF_CHECK_PROBE_UNREACHABLE" else null,
                )
                if (!report.probeReachable) {
                    telemetryReporter?.recordEvent(
                        category = TelemetryCategory.DIAGNOSTIC,
                        stage = TelemetryStage.EXIT_PROBE,
                        action = "self_check_probe_unreachable",
                        status = TelemetryEventStatus.WARN,
                        severity = TelemetrySeverity.WARN,
                        errorCode = "SELF_CHECK_PROBE_UNREACHABLE",
                        durationMs = totalMs,
                        retryable = true,
                    )
                }
            }
            _uiState.update {
                it.copy(
                    selfCheckBusy = false,
                    lastSelfCheckReport = report,
                )
            }
        }
    }

    // 4. Account, Entitlement & Devices

    fun refreshAccountBundle() {
        if (!_uiState.value.isLoggedIn) return
        _uiState.update { it.copy(loadingAccount = true) }
        ioExecutor.execute {
            refreshAccountAndDevicesSync()
        }
    }

    private fun refreshAccountAndDevicesSync() {
        try {
            val (meJson, tenantJson, overviewJson, devicesJson) = sessionExecutor.execute { session ->
                val me = runCatching { controlClient.getMe(session.accessToken) }.getOrNull()
                val tenant = runCatching { controlClient.getTenantEntitlement(session.accessToken) }.getOrNull()
                val overview = runCatching { controlClient.getAssistantOverview(session.accessToken) }.getOrNull()
                val devices = runCatching { controlClient.getClientDevices(session.accessToken) }.getOrNull()
                Quad(me, tenant, overview, devices)
            }

            val currentSession = sessionStore.readSession()
            val summary = parseAccountSummary(meJson, tenantJson, overviewJson)
            val devicesList = parseAuthorizedDevices(devicesJson, currentSession?.deviceId)
            onPublishBoundExitContext(summary.boundExitContext)

            _uiState.update {
                it.copy(
                    loadingAccount = false,
                    isLoggedIn = currentSession != null,
                    currentDeviceId = currentSession?.deviceId,
                    accountSummary = summary,
                    authorizedDevices = devicesList,
                )
            }
        } catch (err: Exception) {
            recordExceptionDiagnostic(err)
            val stillLoggedIn = sessionStore.readSession() != null
            _uiState.update {
                it.copy(
                    loadingAccount = false,
                    isLoggedIn = stillLoggedIn,
                    currentDeviceId = if (stillLoggedIn) it.currentDeviceId else null,
                    errorBannerMessage = if (!stillLoggedIn) {
                        "设备会话已失效或已在其他终端登录，请重新授权。"
                    } else {
                        RedactedLogger.redact(err.message ?: "刷新账户信息失败")
                    },
                )
            }
        }
    }

    // 5. Read-Only AI Session Usage Summary (§16.3)

    fun selectUsageTicketsSubTab(subTab: UsageTicketsSubTab) {
        _uiState.update { it.copy(usageTicketsSubTab = subTab) }
    }

    fun loadUsageSummary(days: Int) {
        if (!_uiState.value.isLoggedIn) return
        _uiState.update { it.copy(selectedUsageDays = days, loadingUsage = true, errorBannerMessage = null) }
        ioExecutor.execute {
            try {
                val json = sessionExecutor.execute { session ->
                    controlClient.getUsageSummary(session.accessToken, days = days)
                }
                val parsed = parseUsageSummary(json, days)
                _uiState.update { it.copy(loadingUsage = false, usageSummary = parsed) }
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                _uiState.update {
                    it.copy(
                        loadingUsage = false,
                        isLoggedIn = sessionStore.readSession() != null,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "读取用量汇总失败"),
                    )
                }
            }
        }
    }

    // 6. Closed-Loop Support Tickets (§17.2)

    fun loadTickets() {
        if (!_uiState.value.isLoggedIn) return
        _uiState.update { it.copy(loadingTickets = true, errorBannerMessage = null) }
        ioExecutor.execute {
            try {
                val json = sessionExecutor.execute { session ->
                    controlClient.getTickets(session.accessToken, limit = 50)
                }
                val arr = json.optJSONArray("tickets") ?: JSONArray()
                val items = (0 until arr.length()).mapNotNull { idx ->
                    arr.optJSONObject(idx)?.let(::parseTicketSummary)
                }
                _uiState.update { it.copy(loadingTickets = false, tickets = items) }
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                _uiState.update {
                    it.copy(
                        loadingTickets = false,
                        isLoggedIn = sessionStore.readSession() != null,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "加载工单列表失败"),
                    )
                }
            }
        }
    }

    fun setShowCreateTicketForm(show: Boolean) {
        _uiState.update { it.copy(showCreateTicketForm = show, errorBannerMessage = null) }
    }

    fun closeActiveTicketDetail() {
        _uiState.update { it.copy(activeTicketDetail = null) }
    }

    fun openTicketDetail(ticketId: String) {
        _uiState.update { it.copy(loadingTickets = true, errorBannerMessage = null) }
        ioExecutor.execute {
            try {
                val json = sessionExecutor.execute { session ->
                    controlClient.getTicketDetail(session.accessToken, ticketId)
                }
                val detail = parseTicketDetail(json)
                _uiState.update {
                    it.copy(loadingTickets = false, activeTicketDetail = detail)
                }
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                _uiState.update {
                    it.copy(
                        loadingTickets = false,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "读取工单详情失败"),
                    )
                }
            }
        }
    }

    fun submitNewTicket(subject: String, category: String, body: String) {
        _uiState.update { it.copy(ticketSubmitting = true, errorBannerMessage = null) }
        ioExecutor.execute {
            try {
                val snapshot = buildSanitizedDiagnosticSnapshot()
                sessionExecutor.execute { session ->
                    controlClient.createTicket(
                        accessToken = session.accessToken,
                        subject = subject,
                        category = category,
                        body = body,
                        diagnosticSnapshot = snapshot,
                    )
                }
                _uiState.update {
                    it.copy(
                        ticketSubmitting = false,
                        showCreateTicketForm = false,
                        statusBannerMessage = "工单已提交，支持团队将尽快跟进。",
                    )
                }
                loadTickets()
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                _uiState.update {
                    it.copy(
                        ticketSubmitting = false,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "提交工单失败"),
                    )
                }
            }
        }
    }

    fun submitTicketMessageOrAction(ticketId: String, body: String?, action: String) {
        _uiState.update { it.copy(ticketSubmitting = true, errorBannerMessage = null) }
        ioExecutor.execute {
            try {
                sessionExecutor.execute { session ->
                    controlClient.postTicketMessage(
                        accessToken = session.accessToken,
                        ticketId = ticketId,
                        body = body,
                        action = action,
                    )
                }
                _uiState.update { it.copy(ticketSubmitting = false) }
                openTicketDetail(ticketId)
                loadTickets()
            } catch (err: Exception) {
                recordExceptionDiagnostic(err)
                _uiState.update {
                    it.copy(
                        ticketSubmitting = false,
                        errorBannerMessage = RedactedLogger.redact(err.message ?: "工单操作失败"),
                    )
                }
            }
        }
    }

    internal fun buildSanitizedDiagnosticSnapshot(): DiagnosticSnapshotPayload {
        val tunnelSnap = tunnelStatusFlow.value
        val mergedErrors: List<String>
        val mergedRequests: List<String>
        synchronized(pkceLock) {
            mergedErrors = (tunnelSnap.recentErrorCodes + controllerErrorCodes).distinct().takeLast(15)
            mergedRequests = (tunnelSnap.recentRequestIds + controllerRequestIds).distinct().takeLast(15)
        }
        return DiagnosticSnapshotPayload.fromRawDiagnostics(
            proxyState = tunnelSnap.state.proxyStateWire,
            rawErrorCodes = mergedErrors,
            rawRequestIds = mergedRequests,
        )
    }

    private fun recordExceptionDiagnostic(err: Exception) {
        synchronized(pkceLock) {
            if (err is DingtuApiException) {
                if (controllerErrorCodes.size >= 10) controllerErrorCodes.removeFirst()
                controllerErrorCodes.addLast(err.errorCode)
                err.requestId?.takeIf { it.isNotBlank() }?.let { reqId ->
                    if (controllerRequestIds.size >= 10) controllerRequestIds.removeFirst()
                    controllerRequestIds.addLast(reqId)
                }
            }
        }
    }

    private fun recordTelemetryError(
        category: TelemetryCategory,
        stage: TelemetryStage,
        action: String,
        err: Exception,
    ) {
        val apiErr = err as? DingtuApiException
        telemetryReporter?.recordEvent(
            category = category,
            stage = stage,
            action = action,
            status = TelemetryEventStatus.ERROR,
            severity = TelemetrySeverity.ERROR,
            errorCode = apiErr?.errorCode ?: err.javaClass.simpleName.uppercase(),
            requestId = apiErr?.requestId,
            httpStatus = apiErr?.statusCode,
            retryable = apiErr == null || apiErr.statusCode >= 500 || apiErr.statusCode == 429,
        )
    }

    private data class Quad(
        val me: JSONObject?,
        val tenant: JSONObject?,
        val overview: JSONObject?,
        val devices: JSONObject?,
    )

    private fun parseAccountSummary(
        meJson: JSONObject?,
        tenantJson: JSONObject?,
        overviewJson: JSONObject?,
    ): AccountSummaryUi {
        val userObj = meJson?.optJSONObject("user")
        val rawEmail = userObj?.optString("email", "")
            ?.takeIf { it.isNotBlank() }
            ?: meJson?.optString("email", "")
            ?: ""
        val maskedEmail = if (rawEmail.isNotBlank()) RedactedLogger.redact(rawEmail) else "已授权客户账号"

        val customerObj = tenantJson?.optJSONObject("customer")
            ?: overviewJson?.optJSONObject("customer")
            ?: meJson?.optJSONObject("customer")
        val customerType = customerObj?.optString("type", "personal") ?: "personal"
        val level = customerObj?.optString("level", "") ?: ""
        val memberRole = customerObj?.optString("memberRole", customerObj.optString("role", "")) ?: ""

        val typeLabel = if (customerType == "enterprise") "企业版" else "个人版"
        val levelLabel = when (level) {
            "silver" -> "标准版"
            "gold" -> "专业版"
            else -> if (customerType == "enterprise") "企业席位" else "标准权益"
        }
        val roleLabel = when (memberRole) {
            "owner" -> "所有者"
            "admin" -> "管理员"
            "member" -> "成员"
            else -> "个人主账号"
        }

        val entObj = tenantJson?.optJSONObject("entitlement")
        val subObj = overviewJson?.optJSONObject("subscription")
        val effectiveBytes = if (entObj != null && !entObj.isNull("effectiveTrafficQuotaBytes")) {
            entObj.optLong("effectiveTrafficQuotaBytes", -1L)
        } else {
            -1L
        }
        val quotaSummary = if (effectiveBytes > 0L) {
            val gb = effectiveBytes.toDouble() / (1024.0 * 1024.0 * 1024.0)
            String.format(java.util.Locale.US, "%.1f GiB 周期额度", gb)
        } else {
            "用量待接入"
        }

        val rawExpires = entObj?.optString("expiresAt", "")?.takeIf { it.isNotBlank() && it != "null" }
            ?: subObj?.optString("expiresAt", "")?.takeIf { it.isNotBlank() && it != "null" }
        val expiresDisplay = rawExpires?.take(10) ?: "待配置"

        val exitObj = overviewJson?.optJSONObject("exitContext")
        val boundExit = if (exitObj != null) {
            val cc = exitObj.optString("countryCode", "").trim()
            val label = exitObj.optString("regionLabel", "").trim()
            if (cc.isNotEmpty() && label.isNotEmpty()) {
                ExitContextMetadata(
                    countryCode = cc,
                    timezone = exitObj.optString("timezone", "").trim(),
                    locale = exitObj.optString("locale", "").trim(),
                    regionLabel = label,
                )
            } else {
                null
            }
        } else {
            null
        }

        return AccountSummaryUi(
            maskedEmail = maskedEmail,
            customerTypeLabel = typeLabel,
            planLevelLabel = levelLabel,
            memberRoleLabel = roleLabel,
            quotaSummary = quotaSummary,
            expiresAtDisplay = expiresDisplay,
            boundExitContext = boundExit,
        )
    }

    private fun parseAuthorizedDevices(
        devicesJson: JSONObject?,
        currentDeviceId: String?,
    ): List<AuthorizedDeviceItemUi> {
        val arr = devicesJson?.optJSONArray("devices") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { idx ->
            val obj = arr.optJSONObject(idx) ?: return@mapNotNull null
            val id = obj.optString("id", obj.optString("deviceId", "")).trim()
            if (id.isEmpty()) return@mapNotNull null
            val name = obj.optString("deviceName", obj.optString("name", "授权终端")).ifBlank { "授权终端" }
            AuthorizedDeviceItemUi(
                deviceId = id,
                displayName = name,
                platform = obj.optString("platform", "unknown"),
                appVersion = obj.optString("appVersion", "-"),
                status = obj.optString("status", "active"),
                createdAt = obj.optString("createdAt", "").take(16).replace('T', ' '),
                isCurrentDevice = currentDeviceId != null && id.equals(currentDeviceId, ignoreCase = true),
            )
        }
    }

    private fun parseUsageSummary(json: JSONObject, fallbackDays: Int): UsageSummaryUi {
        val totals = json.optJSONObject("totals")
        val totalTokens = totals?.optLong("totalTokens", 0L) ?: 0L
        val inputTokens = totals?.optLong("inputTokens", 0L) ?: 0L
        val thinkingTokens = totals?.optLong("thinkingTokens", 0L) ?: 0L
        val outputTokens = totals?.optLong("outputTokens", 0L) ?: 0L
        val cacheTokens = totals?.optLong("cacheTokens", 0L) ?: 0L
        val sessions = totals?.optLong("sessions", 0L) ?: 0L
        val turns = totals?.optLong("turns", 0L) ?: 0L
        val activeDevices = totals?.optInt("activeDevices", 0) ?: 0

        val byAppArr = json.optJSONArray("byApp") ?: JSONArray()
        val byApp = (0 until byAppArr.length()).mapNotNull { idx ->
            val item = byAppArr.optJSONObject(idx) ?: return@mapNotNull null
            val appId = item.optString("appId", "").trim()
            if (appId.isEmpty()) return@mapNotNull null
            AppUsageRowUi(
                appId = appId,
                totalTokens = item.optLong("totalTokens", 0L),
                sessions = item.optLong("sessions", 0L),
                turns = item.optLong("turns", 0L),
            )
        }

        return UsageSummaryUi(
            windowDays = json.optInt("windowDays", fallbackDays),
            hasData = totalTokens > 0L || sessions > 0L || byApp.isNotEmpty(),
            totalTokens = totalTokens,
            inputTokens = inputTokens,
            thinkingTokens = thinkingTokens,
            outputTokens = outputTokens,
            cacheTokens = cacheTokens,
            sessions = sessions,
            turns = turns,
            activeDevices = activeDevices,
            byApp = byApp,
        )
    }

    private fun parseTicketSummary(obj: JSONObject): TicketSummaryUi? {
        val id = obj.optString("ticketId", "").trim()
        if (id.isEmpty()) return null
        val cat = obj.optString("category", "other")
        val status = obj.optString("status", "submitted")
        val updated = obj.optString("lastMessageAt", obj.optString("updatedAt", obj.optString("createdAt", "")))
            .take(16).replace('T', ' ')
        return TicketSummaryUi(
            ticketId = id,
            subject = obj.optString("subject", "未命名工单"),
            category = cat,
            categoryLabel = formatTicketCategory(cat),
            status = status,
            statusLabel = formatTicketStatus(status),
            unreadByCustomer = obj.optBoolean("unreadByCustomer", false),
            updatedAt = updated,
        )
    }

    private fun parseTicketDetail(json: JSONObject): TicketDetailUi {
        val ticketObj = json.optJSONObject("ticket") ?: json
        val summary = parseTicketSummary(ticketObj)
            ?: TicketSummaryUi(
                ticketId = ticketObj.optString("ticketId", ""),
                subject = ticketObj.optString("subject", "工单详情"),
                category = "other",
                categoryLabel = "其他",
                status = ticketObj.optString("status", "submitted"),
                statusLabel = formatTicketStatus(ticketObj.optString("status", "submitted")),
                unreadByCustomer = false,
                updatedAt = "",
            )
        val msgArr = json.optJSONArray("messages") ?: JSONArray()
        val messages = (0 until msgArr.length()).mapNotNull { idx ->
            val m = msgArr.optJSONObject(idx) ?: return@mapNotNull null
            val role = m.optString("authorRole", "system")
            val roleLabel = when (role) {
                "customer" -> "我"
                "ops" -> "定途支持"
                else -> "系统通知"
            }
            TicketMessageUi(
                messageId = m.optString("messageId", "msg_$idx"),
                authorRole = role,
                authorLabel = roleLabel,
                body = RedactedLogger.redact(m.optString("body", "")),
                createdAt = m.optString("createdAt", "").take(16).replace('T', ' '),
            )
        }
        return TicketDetailUi(summary = summary, messages = messages)
    }

    companion object {
        fun formatTicketCategory(category: String): String = when (category) {
            "connection" -> "连接异常"
            "exit_ip" -> "出口质量"
            "workbench_app" -> "应用兼容"
            "account_billing" -> "账户与套餐"
            else -> "其他咨询"
        }

        fun formatTicketStatus(status: String): String = when (status) {
            "submitted" -> "已提交"
            "acknowledged" -> "已受理"
            "investigating" -> "排查中"
            "waiting_user" -> "待您补充"
            "awaiting_ops" -> "运维跟进中"
            "awaiting_production" -> "网络侧核查中"
            "resolved" -> "已解决"
            "closed" -> "已关闭"
            "reopened" -> "已重开"
            else -> status
        }
    }
}

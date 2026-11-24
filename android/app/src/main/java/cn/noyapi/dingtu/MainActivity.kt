// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.trust.ProductionTrustAnchor
import cn.noyapi.dingtu.ui.DingtuAppController
import cn.noyapi.dingtu.ui.MainNavTab
import cn.noyapi.dingtu.ui.components.DingtuCanvasBackground
import cn.noyapi.dingtu.ui.components.DingtuFloatingPhoneDock
import cn.noyapi.dingtu.ui.components.DingtuLayoutTier
import cn.noyapi.dingtu.ui.components.DingtuTabletBottomCapsule
import cn.noyapi.dingtu.ui.components.DingtuTabletSidebarRail
import cn.noyapi.dingtu.ui.screens.ConnectTabScreen
import cn.noyapi.dingtu.ui.screens.ProfileTabScreen
import cn.noyapi.dingtu.ui.screens.RoutingAppsTabScreen
import cn.noyapi.dingtu.ui.screens.UsageAndTicketsTabScreen
import cn.noyapi.dingtu.ui.theme.DingtuTheme
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette
import cn.noyapi.dingtu.vpn.DingtuVpnService
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SystemProxyStatus

data class BaselineStatusUiModel(
    val appVersion: String,
    val libboxVersion: String,
    val libboxGoInfo: String,
    val vpnEngineBinding: String,
    val trustVerified: Boolean,
    val trustOrigin: String,
    val trustKeyPrefix: String,
    val trustShaPrefix: String,
    val defaultModeLabel: String,
    val errorSummary: String?,
)

class MainActivity : ComponentActivity() {

    private lateinit var appController: DingtuAppController
    private var notificationPromptedThisSession: Boolean = false

    private val vpnPrepareLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            proceedToConnectAfterVpnConsent()
        } else {
            appController.reportErrorBanner("未获得系统 VPN 授权，定途保持断开保护状态。")
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        // Start foreground VPN regardless of notification grant; Android allows VPN FGS.
        startVpnServiceNow()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val dingtuApp = application as DingtuApplication
        appController = dingtuApp.appController
        appController.refreshInitialData()
        handlePotentialAuthCallbackIntent(intent)

        setContent {
            val baseline = remember { collectBaselineStatus() }
            val uiState by appController.uiState.collectAsState()
            val view = LocalView.current

            if (!view.isInEditMode) {
                SideEffect {
                    val window = (view.context as? Activity)?.window ?: return@SideEffect
                    val controller = WindowCompat.getInsetsController(window, view)
                    controller.isAppearanceLightStatusBars = !uiState.isDarkTheme
                    controller.isAppearanceLightNavigationBars = !uiState.isDarkTheme
                }
            }

            DingtuTheme(darkTheme = uiState.isDarkTheme) {
                DingtuMainShell(
                    controller = appController,
                    baseline = baseline,
                    onPrimaryBrowserLogin = ::launchDeepLinkBrowserLogin,
                    onLoopbackFallbackLogin = ::launchLoopbackFallbackLogin,
                    onToggleTunnelConnection = ::handleToggleTunnelConnection,
                    onOpenBrowserExitVerify = { openExternalOrCustomTabUrl(EXIT_VERIFY_TRACE_URL) },
                    onOpenFullEditionDownload = { openExternalOrCustomTabUrl(DOWNLOAD_FULL_EDITION_URL) },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePotentialAuthCallbackIntent(intent)
    }

    private fun handlePotentialAuthCallbackIntent(incomingIntent: Intent?) {
        val dataUri = incomingIntent?.data ?: return
        if (dataUri.scheme == "noya" && dataUri.host == "auth" && dataUri.path == "/callback") {
            appController.handleIncomingAuthCallbackUri(
                rawUri = dataUri.toString(),
                deviceName = buildDeviceDisplayName(),
            )
            // Clear consumed callback data so configuration changes do not replay the one-time code.
            incomingIntent.data = null
        }
    }

    private fun launchDeepLinkBrowserLogin() {
        val authorizeUrl = appController.prepareDeepLinkAuthorizeUrl()
        openExternalOrCustomTabUrl(authorizeUrl)
    }

    private fun launchLoopbackFallbackLogin() {
        appController.startLoopbackFallbackLogin(
            deviceName = buildDeviceDisplayName(),
            openBrowserUrl = { url ->
                runOnUiThread { openExternalOrCustomTabUrl(url) }
            },
        )
    }

    private fun openExternalOrCustomTabUrl(url: String) {
        val uri = Uri.parse(url)
        val launchedCustomTab = runCatching {
            val customTabsIntent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            customTabsIntent.launchUrl(this, uri)
            true
        }.getOrDefault(false)

        if (!launchedCustomTab) {
            runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            }.onFailure { err ->
                RedactedLogger.error("Failed to open browser URL", err)
                appController.reportErrorBanner("未检测到可用的系统浏览器，请安装 Chrome 或系统浏览器后重试。")
            }
        }
    }

    private fun handleToggleTunnelConnection() {
        val currentState = appController.tunnelStatusFlow.value.state
        if (currentState == TunnelLifecycleState.CONNECTED || currentState == TunnelLifecycleState.RELOADING) {
            DingtuVpnService.startDisconnect(this)
            return
        }

        val prepareIntent = VpnService.prepare(this)
        if (prepareIntent != null) {
            vpnPrepareLauncher.launch(prepareIntent)
        } else {
            proceedToConnectAfterVpnConsent()
        }
    }

    private fun proceedToConnectAfterVpnConsent() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !notificationPromptedThisSession
        ) {
            notificationPromptedThisSession = true
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        startVpnServiceNow()
    }

    private fun startVpnServiceNow() {
        DingtuVpnService.startConnect(this)
    }

    private fun buildDeviceDisplayName(): String {
        val manufacturer = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        val combined = if (model.startsWith(manufacturer, ignoreCase = true)) {
            model
        } else {
            "$manufacturer $model".trim()
        }
        return combined.ifBlank { "Android Device" }.take(64)
    }

    private fun collectBaselineStatus(): BaselineStatusUiModel {
        val libboxVer = runCatching { Libbox.version() }.getOrElse { "unavailable" }
        val goInfo = runCatching { Libbox.goVersion() }.getOrElse { "unavailable" }
        val vpnBindingState = runCatching {
            val overrideOpts = OverrideOptions().apply { autoRedirect = false }
            val proxyStatus = SystemProxyStatus().apply {
                available = false
                enabled = false
            }
            check(!overrideOpts.autoRedirect && !proxyStatus.enabled)
            check(DingtuVpnService::class.java.name.isNotEmpty())
            check(CommandServer::class.java.name.isNotEmpty())
            "已就绪 (CommandServer + VpnService)"
        }.getOrElse { "绑定异常: ${it.javaClass.simpleName}" }

        return try {
            val anchor = ProductionTrustAnchor.loadFromContext(applicationContext)
            BaselineStatusUiModel(
                appVersion = DingtuConstants.APP_VERSION,
                libboxVersion = libboxVer,
                libboxGoInfo = goInfo,
                vpnEngineBinding = vpnBindingState,
                trustVerified = true,
                trustOrigin = anchor.origin,
                trustKeyPrefix = anchor.keyId.take(24) + "…",
                trustShaPrefix = anchor.sha256Hex.take(16) + "…",
                defaultModeLabel = VpnRoutingMode.PER_APP_VPN.displayLabel,
                errorSummary = null,
            )
        } catch (err: Exception) {
            BaselineStatusUiModel(
                appVersion = DingtuConstants.APP_VERSION,
                libboxVersion = libboxVer,
                libboxGoInfo = goInfo,
                vpnEngineBinding = vpnBindingState,
                trustVerified = false,
                trustOrigin = DingtuConstants.CONTROL_ORIGIN,
                trustKeyPrefix = "unverified",
                trustShaPrefix = "unverified",
                defaultModeLabel = VpnRoutingMode.PER_APP_VPN.displayLabel,
                errorSummary = err.message ?: "信任锚校验失败",
            )
        }
    }

    companion object {
        private const val EXIT_VERIFY_TRACE_URL = "https://1.1.1.1/cdn-cgi/trace"
        private const val DOWNLOAD_FULL_EDITION_URL = "https://dingtu.noyapi.cn/download"
    }
}

@Composable
fun DingtuMainShell(
    controller: DingtuAppController,
    baseline: BaselineStatusUiModel,
    onPrimaryBrowserLogin: () -> Unit,
    onLoopbackFallbackLogin: () -> Unit,
    onToggleTunnelConnection: () -> Unit,
    onOpenBrowserExitVerify: () -> Unit,
    onOpenFullEditionDownload: () -> Unit,
) {
    val uiState by controller.uiState.collectAsState()
    val tunnelStatus by controller.tunnelStatusFlow.collectAsState()
    val telemetrySummary by controller.telemetrySummaryFlow.collectAsState()

    val hasInternalBackTarget = uiState.activeTicketDetail != null ||
        uiState.showCreateTicketForm ||
        uiState.currentTab != MainNavTab.CONNECT

    BackHandler(enabled = hasInternalBackTarget) {
        when {
            uiState.activeTicketDetail != null -> controller.closeActiveTicketDetail()
            uiState.showCreateTicketForm -> controller.setShowCreateTicketForm(false)
            uiState.currentTab != MainNavTab.CONNECT -> controller.selectTab(MainNavTab.CONNECT)
        }
    }

    val handleCenterPowerOrLoginAction: () -> Unit = {
        if (!uiState.isLoggedIn) {
            controller.selectTab(MainNavTab.CONNECT)
            onPrimaryBrowserLogin()
        } else {
            onToggleTunnelConnection()
        }
    }

    val boundRegion = tunnelStatus.exitContext?.regionLabel
        ?: uiState.accountSummary?.boundExitContext?.regionLabel

    DingtuCanvasBackground {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val tier = DingtuLayoutTier.fromWidth(maxWidth)
            val contentMaxWidth = when {
                tier != DingtuLayoutTier.LARGE_TABLET -> 640.dp
                uiState.currentTab == MainNavTab.CONNECT -> 850.dp
                else -> 948.dp
            }
            val bottomSafePadding = if (tier.isTabletRail) 104.dp else 132.dp

            if (tier.isTabletRail) {
                Row(modifier = Modifier.fillMaxSize()) {
                    DingtuTabletSidebarRail(
                        appVersion = baseline.appVersion,
                        currentTab = uiState.currentTab,
                        isLoggedIn = uiState.isLoggedIn,
                        isDarkTheme = uiState.isDarkTheme,
                        accountSummary = uiState.accountSummary,
                        tunnelStatus = tunnelStatus,
                        onSelectTab = controller::selectTab,
                        onToggleTheme = controller::toggleTheme,
                    )

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .statusBarsPadding(),
                        contentAlignment = Alignment.TopCenter,
                    ) {
                        Column(
                            modifier = Modifier
                                .widthIn(max = contentMaxWidth)
                                .fillMaxSize(),
                        ) {
                            ShellBannerStrip(
                                errorBannerMessage = uiState.errorBannerMessage,
                                statusBannerMessage = uiState.statusBannerMessage,
                                onDismiss = controller::dismissBanners,
                            )
                            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                ActiveTabContent(
                                    controller = controller,
                                    uiState = uiState,
                                    tunnelStatus = tunnelStatus,
                                    telemetrySummary = telemetrySummary,
                                    baseline = baseline,
                                    tier = tier,
                                    bottomSafePadding = bottomSafePadding,
                                    onPrimaryBrowserLogin = onPrimaryBrowserLogin,
                                    onLoopbackFallbackLogin = onLoopbackFallbackLogin,
                                    onToggleTunnelConnection = onToggleTunnelConnection,
                                    onOpenBrowserExitVerify = onOpenBrowserExitVerify,
                                    onOpenFullEditionDownload = onOpenFullEditionDownload,
                                )
                            }
                        }

                        DingtuTabletBottomCapsule(
                            isLoggedIn = uiState.isLoggedIn,
                            tunnelStatus = tunnelStatus,
                            regionLabel = boundRegion,
                            onActionClick = handleCenterPowerOrLoginAction,
                            modifier = Modifier.align(Alignment.BottomCenter),
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .statusBarsPadding(),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    Column(
                        modifier = Modifier
                            .widthIn(max = contentMaxWidth)
                            .fillMaxSize(),
                    ) {
                        ShellBannerStrip(
                            errorBannerMessage = uiState.errorBannerMessage,
                            statusBannerMessage = uiState.statusBannerMessage,
                            onDismiss = controller::dismissBanners,
                        )
                        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                            ActiveTabContent(
                                controller = controller,
                                uiState = uiState,
                                tunnelStatus = tunnelStatus,
                                telemetrySummary = telemetrySummary,
                                baseline = baseline,
                                tier = tier,
                                bottomSafePadding = bottomSafePadding,
                                onPrimaryBrowserLogin = onPrimaryBrowserLogin,
                                onLoopbackFallbackLogin = onLoopbackFallbackLogin,
                                onToggleTunnelConnection = onToggleTunnelConnection,
                                onOpenBrowserExitVerify = onOpenBrowserExitVerify,
                                onOpenFullEditionDownload = onOpenFullEditionDownload,
                            )
                        }
                    }

                    DingtuFloatingPhoneDock(
                        currentTab = uiState.currentTab,
                        isLoggedIn = uiState.isLoggedIn,
                        tunnelStatus = tunnelStatus,
                        onSelectTab = controller::selectTab,
                        onCenterActionClick = handleCenterPowerOrLoginAction,
                        modifier = Modifier.align(Alignment.BottomCenter),
                    )
                }
            }
        }
    }
}

@Composable
private fun ActiveTabContent(
    controller: DingtuAppController,
    uiState: cn.noyapi.dingtu.ui.DingtuUiState,
    tunnelStatus: cn.noyapi.dingtu.vpn.TunnelStatusSnapshot,
    telemetrySummary: cn.noyapi.dingtu.telemetry.TelemetryHealthSummary,
    baseline: BaselineStatusUiModel,
    tier: DingtuLayoutTier,
    bottomSafePadding: androidx.compose.ui.unit.Dp,
    onPrimaryBrowserLogin: () -> Unit,
    onLoopbackFallbackLogin: () -> Unit,
    onToggleTunnelConnection: () -> Unit,
    onOpenBrowserExitVerify: () -> Unit,
    onOpenFullEditionDownload: () -> Unit,
) {
    when (uiState.currentTab) {
        MainNavTab.CONNECT -> ConnectTabScreen(
            uiState = uiState,
            tunnelStatus = tunnelStatus,
            tier = tier,
            bottomContentPadding = bottomSafePadding,
            onPrimaryBrowserLogin = onPrimaryBrowserLogin,
            onLoopbackFallbackLogin = onLoopbackFallbackLogin,
            onToggleTunnelConnection = onToggleTunnelConnection,
            onSelectRoutingMode = controller::setRoutingMode,
            onToggleManagedPackage = controller::toggleManagedPackage,
            onNavigateToAppPicker = { controller.selectTab(MainNavTab.ROUTING_APPS) },
            onRunSelfCheck = controller::runHonestSelfCheck,
            onOpenBrowserExitVerify = onOpenBrowserExitVerify,
            onOpenFullEditionDownload = onOpenFullEditionDownload,
            onToggleTheme = controller::toggleTheme,
        )

        MainNavTab.ROUTING_APPS -> RoutingAppsTabScreen(
            uiState = uiState,
            filteredApps = controller.filteredInstalledApps(uiState),
            tier = tier,
            bottomContentPadding = bottomSafePadding,
            onBackToConnect = { controller.selectTab(MainNavTab.CONNECT) },
            onSearchQueryChange = controller::updateAppSearchQuery,
            onFilterChange = controller::updateAppFilter,
            onTogglePackage = controller::toggleManagedPackage,
            onSwitchToPerAppMode = { controller.setRoutingMode(VpnRoutingMode.PER_APP_VPN) },
        )

        MainNavTab.USAGE_AND_TICKETS -> UsageAndTicketsTabScreen(
            uiState = uiState,
            tier = tier,
            bottomContentPadding = bottomSafePadding,
            onBackToConnect = { controller.selectTab(MainNavTab.CONNECT) },
            onSelectSubTab = controller::selectUsageTicketsSubTab,
            onSelectUsageWindowDays = controller::loadUsageSummary,
            onRefreshTickets = controller::loadTickets,
            onOpenTicketDetail = controller::openTicketDetail,
            onCloseTicketDetail = controller::closeActiveTicketDetail,
            onShowCreateTicket = controller::setShowCreateTicketForm,
            onSubmitNewTicket = controller::submitNewTicket,
            onSubmitTicketReplyOrAction = controller::submitTicketMessageOrAction,
            onGoLoginTab = { controller.selectTab(MainNavTab.CONNECT) },
        )

        MainNavTab.PROFILE -> ProfileTabScreen(
            uiState = uiState,
            baseline = baseline,
            telemetrySummary = telemetrySummary,
            tier = tier,
            bottomContentPadding = bottomSafePadding,
            onBackToConnect = { controller.selectTab(MainNavTab.CONNECT) },
            onSetDarkTheme = controller::setDarkTheme,
            onRefreshProfile = controller::refreshAccountBundle,
            onConfirmLogout = controller::performLogout,
            onGoLoginTab = { controller.selectTab(MainNavTab.CONNECT) },
        )
    }
}

@Composable
private fun ShellBannerStrip(
    errorBannerMessage: String?,
    statusBannerMessage: String?,
    onDismiss: () -> Unit,
) {
    if (!errorBannerMessage.isNullOrBlank()) {
        FeedbackBanner(
            text = errorBannerMessage,
            isError = true,
            onDismiss = onDismiss,
        )
    } else if (!statusBannerMessage.isNullOrBlank()) {
        FeedbackBanner(
            text = statusBannerMessage,
            isError = false,
            onDismiss = onDismiss,
        )
    }
}

@Composable
private fun FeedbackBanner(
    text: String,
    isError: Boolean,
    onDismiss: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val bg = if (isError) palette.dangerSoft else palette.accentSoft
    val fg = if (isError) palette.danger else palette.accentInk
    val border = if (isError) palette.danger.copy(alpha = 0.45f) else palette.accent.copy(alpha = 0.35f)

    Surface(
        color = bg,
        border = BorderStroke(1.dp, border),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = text,
                modifier = Modifier.weight(1f),
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = palette.ink,
                fontWeight = FontWeight.Medium,
            )
            TextButton(onClick = onDismiss) {
                Text(
                    text = "关闭",
                    color = fg,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

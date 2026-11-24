// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.noyapi.dingtu.R
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.ui.DingtuUiState
import cn.noyapi.dingtu.ui.InstalledAppDisplayItem
import cn.noyapi.dingtu.ui.components.DimensionalTone
import cn.noyapi.dingtu.ui.components.DingtuAppBrandTileIcon
import cn.noyapi.dingtu.ui.components.DingtuDimensionalIcon
import cn.noyapi.dingtu.ui.components.DingtuGradientAvatar
import cn.noyapi.dingtu.ui.components.DingtuLayoutTier
import cn.noyapi.dingtu.ui.components.DingtuPanelCard
import cn.noyapi.dingtu.ui.components.DingtuThemeToggleButton
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import cn.noyapi.dingtu.vpn.TunnelStatusSnapshot

@Composable
fun ConnectTabScreen(
    uiState: DingtuUiState,
    tunnelStatus: TunnelStatusSnapshot,
    tier: DingtuLayoutTier,
    bottomContentPadding: Dp,
    onPrimaryBrowserLogin: () -> Unit,
    onLoopbackFallbackLogin: () -> Unit,
    onToggleTunnelConnection: () -> Unit,
    onSelectRoutingMode: (VpnRoutingMode) -> Unit,
    onToggleManagedPackage: (String) -> Unit,
    onNavigateToAppPicker: () -> Unit,
    onRunSelfCheck: () -> Unit,
    onOpenBrowserExitVerify: () -> Unit,
    onOpenFullEditionDownload: () -> Unit,
    onToggleTheme: () -> Unit,
) {
    val horizontalPad = if (tier == DingtuLayoutTier.PHONE) 16.dp else 22.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = horizontalPad,
                end = horizontalPad,
                top = 12.dp,
                bottom = bottomContentPadding,
            ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GreetingHeader(
            uiState = uiState,
            tunnelStatus = tunnelStatus,
            tier = tier,
            onToggleTheme = onToggleTheme,
        )

        ConnectionHeroCard(
            uiState = uiState,
            tunnelStatus = tunnelStatus,
            tier = tier,
        )

        OpenSourceEditionNoticeCard(
            onOpenFullEditionDownload = onOpenFullEditionDownload,
        )

        if (tunnelStatus.state == TunnelLifecycleState.FAILED_CLOSED ||
            !tunnelStatus.userRecoveryMessage.isNullOrBlank()
        ) {
            FailClosedRecoveryCard(
                errorCode = tunnelStatus.lastErrorCode,
                recoveryMessage = tunnelStatus.userRecoveryMessage
                    ?: "连接已保护性自动断开，请检查网络或重新授权后再次开启。",
                isLoggedIn = uiState.isLoggedIn,
                onRetryConnect = onToggleTunnelConnection,
            )
        }

        if (!uiState.isLoggedIn) {
            LoggedOutAuthCard(
                authBusy = uiState.authBusy,
                onPrimaryBrowserLogin = onPrimaryBrowserLogin,
                onLoopbackFallbackLogin = onLoopbackFallbackLogin,
            )
        } else {
            QuickManagedAppsPanel(
                uiState = uiState,
                tier = tier,
                onTogglePackage = onToggleManagedPackage,
                onNavigateToAppPicker = onNavigateToAppPicker,
            )

            if (tier == DingtuLayoutTier.LARGE_TABLET) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        RoutingModeSelectorCard(
                            selectedMode = uiState.routingMode,
                            selectedAppCount = uiState.selectedPackages.size,
                            onSelectMode = onSelectRoutingMode,
                            onNavigateToAppPicker = onNavigateToAppPicker,
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        BasicConnectivityCard(
                            uiState = uiState,
                            tunnelStatus = tunnelStatus,
                            onRunSelfCheck = onRunSelfCheck,
                            onOpenBrowserExitVerify = onOpenBrowserExitVerify,
                        )
                    }
                }
            } else {
                RoutingModeSelectorCard(
                    selectedMode = uiState.routingMode,
                    selectedAppCount = uiState.selectedPackages.size,
                    onSelectMode = onSelectRoutingMode,
                    onNavigateToAppPicker = onNavigateToAppPicker,
                )
                BasicConnectivityCard(
                    uiState = uiState,
                    tunnelStatus = tunnelStatus,
                    onRunSelfCheck = onRunSelfCheck,
                    onOpenBrowserExitVerify = onOpenBrowserExitVerify,
                )
            }
        }
    }
}

@Composable
private fun GreetingHeader(
    uiState: DingtuUiState,
    tunnelStatus: TunnelStatusSnapshot,
    tier: DingtuLayoutTier,
    onToggleTheme: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val acct = uiState.accountSummary
    val boundRegion = tunnelStatus.exitContext?.regionLabel
        ?: acct?.boundExitContext?.regionLabel
        ?: "服务端受控独享出口"

    val greetingName = if (uiState.isLoggedIn) {
        val raw = acct?.maskedEmail?.substringBefore('@')?.takeIf { it.isNotBlank() }
        if (raw != null) "你好，$raw" else "你好，定途用户"
    } else {
        "欢迎使用定途"
    }

    val subLine = if (uiState.isLoggedIn) {
        "${acct?.customerTypeLabel ?: "个人版"} · $boundRegion"
    } else {
        "受控独享安全隧道 · v${DingtuConstants.APP_VERSION}"
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.weight(1f),
        ) {
            DingtuGradientAvatar(
                maskedLabel = if (uiState.isLoggedIn) acct?.maskedEmail else "定",
                size = if (tier == DingtuLayoutTier.PHONE) 46.dp else 49.dp,
            )
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = greetingName,
                    color = palette.ink,
                    fontSize = if (tier == DingtuLayoutTier.PHONE) 21.sp else 24.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subLine,
                    color = palette.muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (!tier.isTabletRail) {
            DingtuThemeToggleButton(
                isDarkTheme = uiState.isDarkTheme,
                onToggle = onToggleTheme,
            )
        }
    }
}

@Composable
private fun ConnectionHeroCard(
    uiState: DingtuUiState,
    tunnelStatus: TunnelStatusSnapshot,
    tier: DingtuLayoutTier,
) {
    val palette = LocalDingtuPalette.current
    val isConnected = tunnelStatus.state == TunnelLifecycleState.CONNECTED ||
        tunnelStatus.state == TunnelLifecycleState.RELOADING
    val isBusy = tunnelStatus.state == TunnelLifecycleState.CONNECTING ||
        tunnelStatus.state == TunnelLifecycleState.DISCONNECTING
    val isFailedClosed = tunnelStatus.state == TunnelLifecycleState.FAILED_CLOSED

    val heroHeight = when (tier) {
        DingtuLayoutTier.PHONE -> 182.dp
        DingtuLayoutTier.MEDIUM_TABLET -> 210.dp
        DingtuLayoutTier.LARGE_TABLET -> 226.dp
    }
    val heroRadius = when (tier) {
        DingtuLayoutTier.PHONE -> 24.dp
        DingtuLayoutTier.MEDIUM_TABLET -> 26.dp
        DingtuLayoutTier.LARGE_TABLET -> 28.dp
    }

    val boundRegion = tunnelStatus.exitContext?.regionLabel
        ?: uiState.accountSummary?.boundExitContext?.regionLabel
        ?: "受控独享出口"

    val pillText = when {
        !uiState.isLoggedIn -> "待授权登录"
        tunnelStatus.state == TunnelLifecycleState.CONNECTED -> "独享隧道保护中"
        tunnelStatus.state == TunnelLifecycleState.RELOADING -> "正在平滑重载策略…"
        tunnelStatus.state == TunnelLifecycleState.CONNECTING -> "正在验签并建立隧道…"
        tunnelStatus.state == TunnelLifecycleState.DISCONNECTING -> "正在释放虚拟网卡…"
        isFailedClosed -> "保护性自动断开"
        else -> "独享出口待命"
    }

    val pillDotColor = when {
        !uiState.isLoggedIn -> palette.accent
        isConnected -> palette.good
        isFailedClosed -> palette.danger
        isBusy -> palette.accent
        else -> palette.accent
    }

    val pillBgColor = when {
        !uiState.isLoggedIn -> palette.accentSoft.copy(alpha = 0.90f)
        isConnected -> palette.goodSoft.copy(alpha = 0.92f)
        isFailedClosed -> palette.dangerSoft.copy(alpha = 0.94f)
        else -> palette.accentSoft.copy(alpha = 0.90f)
    }

    val headline = when {
        !uiState.isLoggedIn -> "受控独享安全隧道"
        isConnected -> "已连接，可以开始了"
        isFailedClosed -> "已保护性自动断开"
        isBusy -> "正在建立专属安全隧道"
        else -> "专属连接，准备就绪"
    }

    val subtitle = when {
        !uiState.isLoggedIn -> "服务端统一签名并校验独享出口配置，系统级虚拟网卡全程加密保护。"
        isConnected -> "$boundRegion · ${uiState.routingMode.displayLabel} · ${uiState.selectedPackages.size} 款已选"
        isFailedClosed -> "为防止受管应用回退未加密网络，隧道已按安全策略自动阻断。"
        else -> {
            val acct = uiState.accountSummary
            if (acct != null) {
                "$boundRegion · 到期 ${acct.expiresAtDisplay} · ${acct.quotaSummary}"
            } else {
                "$boundRegion · 点击下方电源键即可一键开启"
            }
        }
    }

    val scrimColors = if (palette.isDark) {
        listOf(
            Color(0xF2182137),
            Color(0xDE182137),
            Color(0x99182137),
            Color(0x38182137),
        )
    } else {
        listOf(
            Color(0xF7F1F5FF),
            Color(0xE8F1F5FF),
            Color(0xA0F1F5FF),
            Color(0x28F1F5FF),
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(heroHeight)
            .clip(RoundedCornerShape(heroRadius))
            .border(1.dp, palette.lineStrong.copy(alpha = 0.55f), RoundedCornerShape(heroRadius)),
    ) {
        Image(
            painter = painterResource(id = R.drawable.bg_connection_hero),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.horizontalGradient(scrimColors)),
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    horizontal = if (tier == DingtuLayoutTier.PHONE) 20.dp else 26.dp,
                    vertical = if (tier == DingtuLayoutTier.PHONE) 18.dp else 22.dp,
                ),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = pillBgColor,
                border = BorderStroke(1.dp, pillDotColor.copy(alpha = 0.35f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(pillDotColor),
                    )
                    Text(
                        text = pillText,
                        color = pillDotColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Column(
                modifier = Modifier.fillMaxWidth(if (tier == DingtuLayoutTier.LARGE_TABLET) 0.72f else 0.92f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = headline,
                    color = palette.heroTitle,
                    fontSize = if (tier == DingtuLayoutTier.PHONE) 24.sp else 28.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    color = palette.heroSubtitle,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun FailClosedRecoveryCard(
    errorCode: String?,
    recoveryMessage: String,
    isLoggedIn: Boolean,
    onRetryConnect: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = palette.dangerSoft,
        border = BorderStroke(1.dp, palette.danger.copy(alpha = 0.50f)),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(palette.danger),
                )
                Text(
                    text = if (!errorCode.isNullOrBlank()) {
                        "保护性阻断 · $errorCode"
                    } else {
                        "保护性阻断 (Fail-Closed)"
                    },
                    color = palette.danger,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                text = recoveryMessage,
                color = palette.ink,
                fontSize = 13.sp,
                lineHeight = 19.sp,
            )
            if (isLoggedIn) {
                Button(
                    onClick = onRetryConnect,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.danger,
                        contentColor = Color.White,
                    ),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "重新建立独享隧道",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun LoggedOutAuthCard(
    authBusy: Boolean,
    onPrimaryBrowserLogin: () -> Unit,
    onLoopbackFallbackLogin: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 20.dp) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                color = Color(0xFF242425),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.size(46.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_notification_dingtu),
                        contentDescription = "定途品牌波纹图标",
                        tint = Color.White,
                        modifier = Modifier.size(30.dp),
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "授权当前设备",
                    color = palette.ink,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "PKCE 安全授权 · Android Keystore 硬件加密存储",
                    color = palette.muted,
                    fontSize = 12.sp,
                )
            }
        }

        Text(
            text = "登录后定途将向权威服务端获取您的独享出口绑定与 Ed25519 签名配置，并通过系统级虚拟网卡透明接管指定 AI 应用与浏览器。",
            color = palette.muted,
            fontSize = 13.sp,
            lineHeight = 20.sp,
        )

        Button(
            onClick = onPrimaryBrowserLogin,
            enabled = !authBusy,
            colors = ButtonDefaults.buttonColors(
                containerColor = palette.accent,
                contentColor = palette.btnPrimaryText,
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .semantics { contentDescription = "使用浏览器授权登录" },
        ) {
            if (authBusy) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    color = palette.btnPrimaryText,
                    modifier = Modifier
                        .size(18.dp)
                        .padding(end = 8.dp),
                )
            }
            Text(
                text = if (authBusy) "正在等待浏览器授权…" else "使用浏览器授权登录",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        OutlinedButton(
            onClick = onLoopbackFallbackLogin,
            enabled = !authBusy,
            border = BorderStroke(1.dp, palette.lineStrong),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "使用本地回环兼容授权" },
        ) {
            Text(
                text = "浏览器未自动回跳？使用本地兼容回调",
                color = palette.ink,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun QuickManagedAppsPanel(
    uiState: DingtuUiState,
    tier: DingtuLayoutTier,
    onTogglePackage: (String) -> Unit,
    onNavigateToAppPicker: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val prioritizedApps: List<InstalledAppDisplayItem> = uiState.installedApps
        .sortedWith(
            compareByDescending<InstalledAppDisplayItem> { it.packageName in uiState.selectedPackages }
                .thenByDescending { it.isRecommended }
                .thenBy { it.displayName.lowercase() }
        )
        .take(8)

    val tileSize = if (tier == DingtuLayoutTier.PHONE) 51.dp else 58.dp
    val tileRadius = if (tier == DingtuLayoutTier.PHONE) 16.dp else 18.dp

    DingtuPanelCard(
        cornerRadius = if (tier == DingtuLayoutTier.PHONE) 24.dp else 26.dp,
        contentPadding = 18.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = "常用接管应用",
                    color = palette.ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (uiState.routingMode == VpnRoutingMode.GLOBAL_VPN) {
                        "全局独享模式生效中 · 预选名单 ${uiState.selectedPackages.size} 款"
                    } else {
                        "已选 ${uiState.selectedPackages.size} 款 · 点击图标即可切换接管状态"
                    },
                    color = palette.muted,
                    fontSize = 12.sp,
                )
            }
            Surface(
                onClick = onNavigateToAppPicker,
                shape = RoundedCornerShape(999.dp),
                color = palette.layer,
                border = BorderStroke(1.dp, palette.line),
            ) {
                Text(
                    text = "全部应用 →",
                    color = palette.accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }

        if (prioritizedApps.isEmpty()) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = palette.layer,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "正在扫描设备已安装应用，或前往「分流应用」手动勾选需要经独享出口接管的应用。",
                    color = palette.muted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(14.dp),
                )
            }
        } else {
            val rows = prioritizedApps.chunked(4)
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                rows.forEach { rowItems ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        rowItems.forEach { item ->
                            val isSelected = item.packageName in uiState.selectedPackages
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(16.dp))
                                    .clickable { onTogglePackage(item.packageName) }
                                    .padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                DingtuAppBrandTileIcon(
                                    packageName = item.packageName,
                                    displayName = item.displayName,
                                    recommendedCategory = item.recommendedCategory,
                                    selected = isSelected,
                                    tileSize = tileSize,
                                    cornerRadius = tileRadius,
                                )
                                Text(
                                    text = item.displayName,
                                    color = if (isSelected) palette.ink else palette.muted,
                                    fontSize = 12.sp,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    textAlign = TextAlign.Center,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    lineHeight = 15.sp,
                                )
                            }
                        }
                        repeat(4 - rowItems.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoutingModeSelectorCard(
    selectedMode: VpnRoutingMode,
    selectedAppCount: Int,
    onSelectMode: (VpnRoutingMode) -> Unit,
    onNavigateToAppPicker: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            DingtuDimensionalIcon(
                tone = DimensionalTone.BLUE,
                iconRes = R.drawable.ic_nav_connect,
                contentDescription = null,
            )
            Column {
                Text(
                    text = "分流接管模式",
                    color = palette.ink,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "按需保护指定应用或整机加密",
                    color = palette.muted,
                    fontSize = 12.sp,
                )
            }
        }

        ModeOptionItem(
            title = "按应用分流（默认推荐）",
            subtitle = "仅将已勾选的 $selectedAppCount 款 AI 应用与浏览器送入独享出口，国内日常应用保持系统常规联网。",
            selected = selectedMode == VpnRoutingMode.PER_APP_VPN,
            onClick = { onSelectMode(VpnRoutingMode.PER_APP_VPN) },
        )

        ModeOptionItem(
            title = "全局独享隧道",
            subtitle = "除定途自身防回环控制流外，整机所有应用流量均经加密独享隧道转发。",
            selected = selectedMode == VpnRoutingMode.GLOBAL_VPN,
            onClick = { onSelectMode(VpnRoutingMode.GLOBAL_VPN) },
        )

        if (selectedMode == VpnRoutingMode.PER_APP_VPN) {
            OutlinedButton(
                onClick = onNavigateToAppPicker,
                border = BorderStroke(1.dp, palette.lineStrong),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "管理受管分流应用（已选 $selectedAppCount 款）",
                    color = palette.ink,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun ModeOptionItem(
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) palette.accent else palette.line,
        ),
        color = if (selected) palette.accentSoft.copy(alpha = 0.55f) else palette.layer,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            RadioButton(
                selected = selected,
                onClick = onClick,
                colors = RadioButtonDefaults.colors(
                    selectedColor = palette.accent,
                    unselectedColor = palette.subtle,
                ),
            )
            Column(
                modifier = Modifier.padding(start = 4.dp, top = 2.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = title,
                    color = palette.ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = subtitle,
                    color = palette.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                )
            }
        }
    }
}

@Composable
private fun OpenSourceEditionNoticeCard(
    onOpenFullEditionDownload: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    DingtuPanelCard(cornerRadius = 20.dp, contentPadding = 16.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "开源学习交流版 · 基础联通环境",
                color = palette.ink,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "本版本仅供开源学习交流，已剥离严格路由防泄露与环境自检增强模块，仅保留基础隧道联通；完整版请前往官网下载。",
                color = palette.muted,
                fontSize = 12.sp,
                lineHeight = 17.sp,
            )
            OutlinedButton(
                onClick = onOpenFullEditionDownload,
                border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.5f)),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    text = "前往官网下载完整版 (dingtu.noyapi.cn)",
                    color = palette.accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun BasicConnectivityCard(
    uiState: DingtuUiState,
    tunnelStatus: TunnelStatusSnapshot,
    onRunSelfCheck: () -> Unit,
    onOpenBrowserExitVerify: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val report = uiState.lastSelfCheckReport

    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            DingtuDimensionalIcon(
                tone = DimensionalTone.GREEN,
                iconRes = R.drawable.ic_shield_lock,
                contentDescription = null,
            )
            Column {
                Text(
                    text = "基础联通检测",
                    color = palette.ink,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "检测基础隧道转发与外网可达性",
                    color = palette.muted,
                    fontSize = 12.sp,
                )
            }
        }

        if (report != null) {
            Surface(
                color = palette.layer,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, palette.line),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = report.connectivitySummary,
                        color = palette.ink,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    if (report.observedMaskedIp != null) {
                        Text(
                            text = "出口观测：${report.observedMaskedIp} (${report.observedCountryOrTrace ?: "-"})",
                            color = palette.ink,
                            fontSize = 12.sp,
                        )
                    }
                    Text(
                        text = report.routingScopeNote,
                        color = palette.muted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(
                onClick = onRunSelfCheck,
                enabled = !uiState.selfCheckBusy,
                border = BorderStroke(1.dp, palette.lineStrong),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = if (uiState.selfCheckBusy) "检测中…" else "运行联通检测",
                    color = palette.ink,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }

            if (tunnelStatus.state == TunnelLifecycleState.CONNECTED) {
                Button(
                    onClick = onOpenBrowserExitVerify,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = palette.btnPrimaryText,
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        text = "在浏览器核验出口",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

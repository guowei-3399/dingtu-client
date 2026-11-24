// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.noyapi.dingtu.R
import cn.noyapi.dingtu.ui.AccountSummaryUi
import cn.noyapi.dingtu.ui.MainNavTab
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import cn.noyapi.dingtu.vpn.TunnelStatusSnapshot
import kotlin.math.abs

enum class DingtuLayoutTier {
    PHONE,
    MEDIUM_TABLET,
    LARGE_TABLET,
    ;

    val isTabletRail: Boolean
        get() = this == LARGE_TABLET

    companion object {
        fun fromWidth(widthDp: Dp): DingtuLayoutTier = when {
            widthDp >= 800.dp -> LARGE_TABLET
            widthDp >= 600.dp -> MEDIUM_TABLET
            else -> PHONE
        }
    }
}

enum class DimensionalTone(
    val topColor: Color,
    val bottomColor: Color,
) {
    BLUE(Color(0xFF60A5FA), Color(0xFF2563EB)),
    GREEN(Color(0xFF4ADE80), Color(0xFF16A34A)),
    ORANGE(Color(0xFFFB923C), Color(0xFFEA580C)),
    PURPLE(Color(0xFFA78BFA), Color(0xFF7C3AED)),
    CYAN(Color(0xFF22D3EE), Color(0xFF0891B2)),
    PINK(Color(0xFFF472B6), Color(0xFFDB2777)),
    GRAY(Color(0xFF94A3B8), Color(0xFF475569)),
}

@Composable
fun DingtuCanvasBackground(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        palette.canvasGradStart,
                        palette.canvasGradMid,
                        palette.canvasGradEnd,
                    )
                )
            )
    ) {
        content()
    }
}

@Composable
fun DingtuPanelCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 24.dp,
    contentPadding: Dp = 18.dp,
    containerColor: Color? = null,
    borderColor: Color? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(cornerRadius),
        color = containerColor ?: palette.panel,
        border = BorderStroke(1.dp, borderColor ?: palette.line),
        shadowElevation = if (palette.isDark) 6.dp else 3.dp,
    ) {
        Column(
            modifier = Modifier.padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

@Composable
fun DingtuGradientAvatar(
    maskedLabel: String?,
    size: Dp = 46.dp,
    modifier: Modifier = Modifier,
) {
    val initial = maskedLabel
        ?.trim()
        ?.firstOrNull { it.isLetterOrDigit() }
        ?.uppercaseChar()
        ?.toString()
        ?: "定"

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFF3B82F6), Color(0xFF06B6D4))
                )
            )
            .border(1.5.dp, Color.White.copy(alpha = 0.25f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initial,
            color = Color.White,
            fontSize = (size.value * 0.42f).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun DingtuDimensionalIcon(
    tone: DimensionalTone,
    @DrawableRes iconRes: Int,
    contentDescription: String?,
    size: Dp = 32.dp,
    cornerRadius: Dp = 10.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(
                Brush.verticalGradient(
                    colors = listOf(tone.topColor, tone.bottomColor)
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(2.dp)
                .clip(RoundedCornerShape((cornerRadius - 2.dp).coerceAtLeast(4.dp)))
                .background(Color.White.copy(alpha = 0.14f)),
        )
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(size * 0.56f),
        )
    }
}

@Composable
fun DingtuThemeToggleButton(
    isDarkTheme: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        onClick = onToggle,
        shape = RoundedCornerShape(14.dp),
        color = palette.layer,
        border = BorderStroke(1.dp, palette.line),
        modifier = modifier
            .size(40.dp)
            .semantics {
                contentDescription = if (isDarkTheme) "切换为浅色主题" else "切换为深色主题"
            },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                painter = painterResource(
                    id = if (isDarkTheme) R.drawable.ic_sun else R.drawable.ic_moon
                ),
                contentDescription = if (isDarkTheme) "切换浅色主题" else "切换深色主题",
                tint = palette.ink,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
fun DingtuAppBrandTileIcon(
    packageName: String,
    displayName: String,
    recommendedCategory: String?,
    selected: Boolean,
    tileSize: Dp = 52.dp,
    cornerRadius: Dp = 16.dp,
    showCheckBadge: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    val brandDrawable = brandDrawableForPackage(packageName)

    Box(
        modifier = modifier.size(tileSize + 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (brandDrawable != null) {
            Surface(
                modifier = Modifier.size(tileSize),
                shape = RoundedCornerShape(cornerRadius),
                color = Color.White,
                border = BorderStroke(
                    width = if (selected) 1.5.dp else 1.dp,
                    color = if (selected) palette.accent else palette.line,
                ),
                shadowElevation = 2.dp,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (brandDrawable == R.drawable.ic_logo_copilot) {
                        Icon(
                            painter = painterResource(id = brandDrawable),
                            contentDescription = displayName,
                            tint = Color(0xFF1D4ED8),
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Image(
                            painter = painterResource(id = brandDrawable),
                            contentDescription = displayName,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        } else {
            val tone = when {
                recommendedCategory == "浏览器" || packageName.contains("chrome") ||
                    packageName.contains("browser") || packageName.contains("firefox") ||
                    packageName.contains("emmx") || packageName.contains("brave") -> DimensionalTone.CYAN
                recommendedCategory == "AI 助手" -> DimensionalTone.PURPLE
                else -> {
                    val paletteTones = listOf(
                        DimensionalTone.BLUE,
                        DimensionalTone.GREEN,
                        DimensionalTone.ORANGE,
                        DimensionalTone.PURPLE,
                        DimensionalTone.CYAN,
                        DimensionalTone.PINK,
                    )
                    paletteTones[abs(packageName.hashCode()) % paletteTones.size]
                }
            }

            Box(
                modifier = Modifier
                    .size(tileSize)
                    .clip(RoundedCornerShape(cornerRadius))
                    .background(Brush.verticalGradient(listOf(tone.topColor, tone.bottomColor)))
                    .border(
                        width = if (selected) 1.5.dp else 0.5.dp,
                        color = if (selected) palette.accent else Color.White.copy(alpha = 0.2f),
                        shape = RoundedCornerShape(cornerRadius),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(2.dp)
                        .clip(RoundedCornerShape((cornerRadius - 2.dp).coerceAtLeast(8.dp)))
                        .background(Color.White.copy(alpha = 0.14f)),
                )
                if (recommendedCategory == "浏览器" || packageName.contains("chrome") || packageName.contains("browser")) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_globe_browser),
                        contentDescription = displayName,
                        tint = Color.White,
                        modifier = Modifier.size(tileSize * 0.50f),
                    )
                } else if (recommendedCategory == "AI 助手") {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_spark_ai),
                        contentDescription = displayName,
                        tint = Color.White,
                        modifier = Modifier.size(tileSize * 0.50f),
                    )
                } else {
                    Text(
                        text = displayName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "A",
                        color = Color.White,
                        fontSize = (tileSize.value * 0.40f).sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        if (showCheckBadge && selected) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(palette.accent)
                    .border(2.dp, palette.panel, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_check_small),
                    contentDescription = "已受管",
                    tint = Color.White,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
    }
}

@DrawableRes
fun brandDrawableForPackage(packageName: String): Int? = when (packageName) {
    "com.anthropic.claude" -> R.drawable.logo_app_claude
    "com.openai.chatgpt" -> R.drawable.logo_app_openai
    "com.google.android.apps.bard" -> R.drawable.logo_app_gemini
    "ai.x.grok" -> R.drawable.logo_app_grok
    "com.microsoft.copilot" -> R.drawable.ic_logo_copilot
    else -> null
}

@Composable
fun SecondaryPageHeader(
    title: String,
    subtitle: String,
    tier: DingtuLayoutTier,
    onBackToConnect: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) {
    val palette = LocalDingtuPalette.current
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!tier.isTabletRail) {
            Surface(
                onClick = onBackToConnect,
                shape = RoundedCornerShape(12.dp),
                color = palette.layer,
                border = BorderStroke(1.dp, palette.line),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_arrow_back),
                        contentDescription = "返回连接",
                        tint = palette.ink,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "返回连接",
                        color = palette.ink,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = title,
                    color = palette.ink,
                    fontSize = if (tier.isTabletRail) 28.sp else 26.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = subtitle,
                    color = palette.muted,
                    fontSize = 13.sp,
                )
            }
            if (trailing != null) {
                trailing()
            }
        }
    }
}

@Composable
fun DingtuFloatingPhoneDock(
    currentTab: MainNavTab,
    isLoggedIn: Boolean,
    tunnelStatus: TunnelStatusSnapshot,
    onSelectTab: (MainNavTab) -> Unit,
    onCenterActionClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    val isConnected = tunnelStatus.state == TunnelLifecycleState.CONNECTED ||
        tunnelStatus.state == TunnelLifecycleState.RELOADING
    val isBusy = tunnelStatus.state == TunnelLifecycleState.CONNECTING ||
        tunnelStatus.state == TunnelLifecycleState.DISCONNECTING
    val isFailedClosed = tunnelStatus.state == TunnelLifecycleState.FAILED_CLOSED

    val orbGradient = when {
        !isLoggedIn -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB))
        isConnected -> listOf(Color(0xFF34D399), Color(0xFF16A34A))
        isFailedClosed -> listOf(Color(0xFFFB7185), Color(0xFFE11D48))
        isBusy -> listOf(Color(0xFF60A5FA), Color(0xFF1D4ED8))
        else -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB))
    }

    val centerLabel = when {
        !isLoggedIn -> "去登录"
        isBusy -> if (tunnelStatus.state == TunnelLifecycleState.DISCONNECTING) "断开中" else "连接中"
        isConnected -> "断开连接"
        isFailedClosed -> "重新连接"
        else -> "一键连接"
    }

    val centerLabelColor = when {
        !isLoggedIn -> palette.accent
        isConnected -> palette.good
        isFailedClosed -> palette.danger
        else -> palette.accent
    }

    val centerSemantics = when {
        !isLoggedIn -> "前往授权登录"
        isConnected -> "断开独享隧道"
        else -> "开启独享隧道"
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .height(102.dp),
        ) {
            // Floating Dock Bar
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(76.dp),
                shape = RoundedCornerShape(27.dp),
                color = palette.panel.copy(alpha = 0.97f),
                border = BorderStroke(1.dp, palette.lineStrong.copy(alpha = 0.55f)),
                shadowElevation = 14.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PhoneDockNavSlot(
                        tab = MainNavTab.CONNECT,
                        shortLabel = "连接",
                        iconRes = R.drawable.ic_nav_connect,
                        selected = currentTab == MainNavTab.CONNECT,
                        onClick = { onSelectTab(MainNavTab.CONNECT) },
                        modifier = Modifier.weight(1f),
                    )
                    PhoneDockNavSlot(
                        tab = MainNavTab.ROUTING_APPS,
                        shortLabel = "应用",
                        iconRes = R.drawable.ic_nav_apps,
                        selected = currentTab == MainNavTab.ROUTING_APPS,
                        onClick = { onSelectTab(MainNavTab.ROUTING_APPS) },
                        modifier = Modifier.weight(1f),
                    )
                    // Center power orb text label slot
                    Box(
                        modifier = Modifier
                            .width(82.dp)
                            .fillMaxHeight()
                            .clickable(enabled = !isBusy, onClick = onCenterActionClick),
                        contentAlignment = Alignment.BottomCenter,
                    ) {
                        Text(
                            text = centerLabel,
                            color = centerLabelColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    PhoneDockNavSlot(
                        tab = MainNavTab.USAGE_AND_TICKETS,
                        shortLabel = "用量",
                        iconRes = R.drawable.ic_nav_usage,
                        selected = currentTab == MainNavTab.USAGE_AND_TICKETS,
                        onClick = { onSelectTab(MainNavTab.USAGE_AND_TICKETS) },
                        modifier = Modifier.weight(1f),
                    )
                    PhoneDockNavSlot(
                        tab = MainNavTab.PROFILE,
                        shortLabel = "我的",
                        iconRes = R.drawable.ic_nav_profile,
                        selected = currentTab == MainNavTab.PROFILE,
                        onClick = { onSelectTab(MainNavTab.PROFILE) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Elevated 66dp circular power orb overflowing top by 25dp
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = 1.dp)
                    .size(74.dp)
                    .clip(CircleShape)
                    .background(palette.canvas)
                    .padding(5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .shadow(10.dp, CircleShape)
                        .clip(CircleShape)
                        .background(Brush.verticalGradient(orbGradient))
                        .clickable(enabled = !isBusy, onClick = onCenterActionClick)
                        .semantics { contentDescription = centerSemantics },
                    contentAlignment = Alignment.Center,
                ) {
                    if (isBusy) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.6.dp,
                            modifier = Modifier.size(26.dp),
                        )
                    } else {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_power),
                            contentDescription = centerSemantics,
                            tint = Color.White,
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PhoneDockNavSlot(
    tab: MainNavTab,
    shortLabel: String,
    @DrawableRes iconRes: Int,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    val fgColor = if (selected) palette.accent else palette.subtle
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .semantics { contentDescription = "导航-${tab.title}" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            painter = painterResource(id = iconRes),
            contentDescription = tab.title,
            tint = fgColor,
            modifier = Modifier.size(22.dp),
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = shortLabel,
            color = fgColor,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun DingtuTabletSidebarRail(
    appVersion: String,
    currentTab: MainNavTab,
    isLoggedIn: Boolean,
    isDarkTheme: Boolean,
    accountSummary: AccountSummaryUi?,
    tunnelStatus: TunnelStatusSnapshot,
    onSelectTab: (MainNavTab) -> Unit,
    onToggleTheme: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    val isConnected = tunnelStatus.state == TunnelLifecycleState.CONNECTED ||
        tunnelStatus.state == TunnelLifecycleState.RELOADING
    val isFailedClosed = tunnelStatus.state == TunnelLifecycleState.FAILED_CLOSED

    Row(
        modifier = modifier
            .width(192.dp)
            .fillMaxHeight()
            .background(palette.rail),
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                // Brand Mark
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(horizontal = 4.dp),
                ) {
                    Surface(
                        color = Color(0xFF242425),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.size(34.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_notification_dingtu),
                                contentDescription = "定途品牌标识",
                                tint = Color.White,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }
                    Column {
                        Text(
                            text = "定途",
                            color = palette.ink,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "v$appVersion",
                            color = palette.subtle,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }

                // Compact Account Status Card
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = palette.layer,
                    border = BorderStroke(1.dp, palette.line),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        DingtuGradientAvatar(
                            maskedLabel = if (isLoggedIn) accountSummary?.maskedEmail else "定",
                            size = 34.dp,
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = if (isLoggedIn) {
                                    accountSummary?.maskedEmail?.substringBefore('@') ?: "已授权用户"
                                } else {
                                    "未登录"
                                },
                                color = palette.ink,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(
                                            when {
                                                isConnected -> palette.good
                                                isFailedClosed -> palette.danger
                                                else -> palette.subtle
                                            }
                                        )
                                )
                                Text(
                                    text = when {
                                        !isLoggedIn -> "等待授权"
                                        isConnected -> "隧道已保护"
                                        isFailedClosed -> "保护性断开"
                                        else -> "安全待命"
                                    },
                                    color = palette.muted,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }

                // 4 Vertical Nav Items
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    MainNavTab.entries.forEach { tab ->
                        val selected = currentTab == tab
                        val iconRes = when (tab) {
                            MainNavTab.CONNECT -> R.drawable.ic_nav_connect
                            MainNavTab.ROUTING_APPS -> R.drawable.ic_nav_apps
                            MainNavTab.USAGE_AND_TICKETS -> R.drawable.ic_nav_usage
                            MainNavTab.PROFILE -> R.drawable.ic_nav_profile
                        }
                        Surface(
                            onClick = { onSelectTab(tab) },
                            shape = RoundedCornerShape(14.dp),
                            color = if (selected) palette.accentSoft else Color.Transparent,
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics { contentDescription = "导航-${tab.title}" },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(
                                    painter = painterResource(id = iconRes),
                                    contentDescription = tab.title,
                                    tint = if (selected) palette.accentInk else palette.muted,
                                    modifier = Modifier.size(20.dp),
                                )
                                Text(
                                    text = tab.title,
                                    color = if (selected) palette.accentInk else palette.ink,
                                    fontSize = 14.sp,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }

            // Bottom Theme Switcher
            Surface(
                onClick = onToggleTheme,
                shape = RoundedCornerShape(14.dp),
                color = palette.layer,
                border = BorderStroke(1.dp, palette.line),
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = if (isDarkTheme) "切换为浅色主题" else "切换为深色主题"
                    },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Icon(
                        painter = painterResource(
                            id = if (isDarkTheme) R.drawable.ic_sun else R.drawable.ic_moon
                        ),
                        contentDescription = null,
                        tint = palette.accent,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = if (isDarkTheme) "切换浅色外观" else "切换深色外观",
                        color = palette.ink,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        // Right 1dp Hairline Divider
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(palette.line),
        )
    }
}

@Composable
fun DingtuTabletBottomCapsule(
    isLoggedIn: Boolean,
    tunnelStatus: TunnelStatusSnapshot,
    regionLabel: String?,
    onActionClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    val isConnected = tunnelStatus.state == TunnelLifecycleState.CONNECTED ||
        tunnelStatus.state == TunnelLifecycleState.RELOADING
    val isBusy = tunnelStatus.state == TunnelLifecycleState.CONNECTING ||
        tunnelStatus.state == TunnelLifecycleState.DISCONNECTING
    val isFailedClosed = tunnelStatus.state == TunnelLifecycleState.FAILED_CLOSED

    val medallionGradient = when {
        !isLoggedIn -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB))
        isConnected -> listOf(Color(0xFF34D399), Color(0xFF16A34A))
        isFailedClosed -> listOf(Color(0xFFFB7185), Color(0xFFE11D48))
        else -> listOf(Color(0xFF60A5FA), Color(0xFF2563EB))
    }

    val actionLabel = when {
        !isLoggedIn -> "浏览器登录"
        isBusy -> if (tunnelStatus.state == TunnelLifecycleState.DISCONNECTING) "正在断开…" else "正在连接…"
        isConnected -> "断开连接"
        isFailedClosed -> "重新连接"
        else -> "一键连接"
    }

    val subLabel = when {
        !isLoggedIn -> "点击授权设备"
        isConnected -> regionLabel ?: "独享隧道保护中"
        isFailedClosed -> "已安全阻断"
        else -> regionLabel ?: "独享出口待命"
    }

    val semanticsLabel = when {
        !isLoggedIn -> "前往授权登录"
        isConnected -> "断开独享隧道"
        else -> "开启独享隧道"
    }

    Surface(
        onClick = { if (!isBusy) onActionClick() },
        shape = RoundedCornerShape(24.dp),
        color = palette.panel.copy(alpha = 0.97f),
        border = BorderStroke(
            width = 1.dp,
            color = when {
                isConnected -> palette.good.copy(alpha = 0.45f)
                isFailedClosed -> palette.danger.copy(alpha = 0.55f)
                else -> palette.lineStrong.copy(alpha = 0.65f)
            },
        ),
        shadowElevation = 14.dp,
        modifier = modifier
            .navigationBarsPadding()
            .padding(bottom = 16.dp)
            .widthIn(min = 188.dp, max = 232.dp)
            .height(64.dp)
            .semantics { contentDescription = semanticsLabel },
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Brush.verticalGradient(medallionGradient)),
                contentAlignment = Alignment.Center,
            ) {
                if (isBusy) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.4.dp,
                        modifier = Modifier.size(20.dp),
                    )
                } else {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_power),
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                Text(
                    text = actionLabel,
                    color = palette.ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Text(
                    text = subLabel,
                    color = palette.muted,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

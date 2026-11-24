// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.noyapi.dingtu.BaselineStatusUiModel
import cn.noyapi.dingtu.R
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.telemetry.TelemetryHealthSummary
import cn.noyapi.dingtu.ui.DingtuUiState
import cn.noyapi.dingtu.ui.components.DimensionalTone
import cn.noyapi.dingtu.ui.components.DingtuDimensionalIcon
import cn.noyapi.dingtu.ui.components.DingtuGradientAvatar
import cn.noyapi.dingtu.ui.components.DingtuLayoutTier
import cn.noyapi.dingtu.ui.components.DingtuPanelCard
import cn.noyapi.dingtu.ui.components.SecondaryPageHeader
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette

@Composable
fun ProfileTabScreen(
    uiState: DingtuUiState,
    baseline: BaselineStatusUiModel,
    telemetrySummary: TelemetryHealthSummary,
    tier: DingtuLayoutTier,
    bottomContentPadding: Dp,
    onBackToConnect: () -> Unit,
    onSetDarkTheme: (Boolean) -> Unit,
    onRefreshProfile: () -> Unit,
    onConfirmLogout: () -> Unit,
    onGoLoginTab: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val horizontalPad = if (tier == DingtuLayoutTier.PHONE) 16.dp else 22.dp
    var showLogoutDialog by rememberSaveable { mutableStateOf(false) }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            containerColor = palette.panel,
            titleContentColor = palette.ink,
            textContentColor = palette.muted,
            title = { Text("确认退出登录", fontWeight = FontWeight.Bold) },
            text = {
                Text("退出登录将立即停止当前独享隧道、撤销服务端设备会话并清空本机硬件安全存储凭据。")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        onConfirmLogout()
                    }
                ) {
                    Text("确认退出", color = palette.danger, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("取消", color = palette.muted)
                }
            },
        )
    }

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
        SecondaryPageHeader(
            title = "我的与设置",
            subtitle = "管理账户权益、外观主题、已授权终端与安全基线",
            tier = tier,
            onBackToConnect = onBackToConnect,
            trailing = if (uiState.isLoggedIn) {
                {
                    OutlinedButton(
                        onClick = onRefreshProfile,
                        enabled = !uiState.loadingAccount,
                        border = BorderStroke(1.dp, palette.lineStrong),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            text = if (uiState.loadingAccount) "同步中…" else "刷新",
                            color = palette.ink,
                            fontSize = 12.sp,
                        )
                    }
                }
            } else {
                null
            },
        )

        // 1. Account & Entitlement Overview Card (aligned to v4-mobile-settings)
        if (!uiState.isLoggedIn) {
            DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 20.dp) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DingtuGradientAvatar(maskedLabel = "定", size = 48.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "尚未登录定途账户",
                            color = palette.ink,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "授权登录后查看套餐权益与独享出口区域",
                            color = palette.muted,
                            fontSize = 12.sp,
                        )
                    }
                }
                Button(
                    onClick = onGoLoginTab,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = palette.btnPrimaryText,
                    ),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("前往连接页登录", fontWeight = FontWeight.Bold)
                }
            }
        } else {
            val acct = uiState.accountSummary
            DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DingtuGradientAvatar(
                        maskedLabel = acct?.maskedEmail,
                        size = 50.dp,
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(
                            text = acct?.maskedEmail ?: "读取中…",
                            color = palette.ink,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${acct?.customerTypeLabel ?: "-"} · ${acct?.planLevelLabel ?: "-"} · ${acct?.memberRoleLabel ?: "-"}",
                            color = palette.muted,
                            fontSize = 12.sp,
                        )
                    }
                }

                // Entitlement Summary Stat Tiles (3-col on large tablet, 2-col on phone)
                val statTiles = listOf(
                    "独享出口" to (acct?.boundExitContext?.regionLabel ?: "服务端受控分配"),
                    "权益到期" to (acct?.expiresAtDisplay ?: "待配置"),
                    "周期流量" to (acct?.quotaSummary ?: "用量待接入"),
                )
                if (tier == DingtuLayoutTier.LARGE_TABLET) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        statTiles.forEach { (label, value) ->
                            EntitlementMiniCard(
                                label = label,
                                value = value,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            EntitlementMiniCard(
                                label = statTiles[0].first,
                                value = statTiles[0].second,
                                modifier = Modifier.weight(1f),
                            )
                            EntitlementMiniCard(
                                label = statTiles[1].first,
                                value = statTiles[1].second,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        EntitlementMiniCard(
                            label = statTiles[2].first,
                            value = statTiles[2].second,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        // 2. Appearance Theme Section (aligned with v4-mobile-settings)
        DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                DingtuDimensionalIcon(
                    tone = DimensionalTone.ORANGE,
                    iconRes = if (uiState.isDarkTheme) R.drawable.ic_moon else R.drawable.ic_sun,
                    contentDescription = null,
                )
                Column {
                    Text(
                        text = "外观主题",
                        color = palette.ink,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "移动端默认深色护眼，支持一键切换并持久保存",
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
            }

            Surface(
                shape = RoundedCornerShape(16.dp),
                color = palette.layer,
                border = BorderStroke(1.dp, palette.line),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ThemeOptionPill(
                        label = "深色模式",
                        iconRes = R.drawable.ic_moon,
                        selected = uiState.isDarkTheme,
                        onClick = { onSetDarkTheme(true) },
                        modifier = Modifier.weight(1f),
                    )
                    ThemeOptionPill(
                        label = "浅色模式",
                        iconRes = R.drawable.ic_sun,
                        selected = !uiState.isDarkTheme,
                        onClick = { onSetDarkTheme(false) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        // 3. Authorized Devices Card
        if (uiState.isLoggedIn) {
            DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DingtuDimensionalIcon(
                        tone = DimensionalTone.BLUE,
                        iconRes = R.drawable.ic_nav_profile,
                        contentDescription = null,
                    )
                    Column {
                        Text(
                            text = "已授权终端设备",
                            color = palette.ink,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "支持多端会话审计与单机撤销",
                            color = palette.muted,
                            fontSize = 12.sp,
                        )
                    }
                }

                if (uiState.authorizedDevices.isEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = palette.layer,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "当前设备在线（${uiState.currentDeviceId?.take(8) ?: "-"}…）",
                            color = palette.ink,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        uiState.authorizedDevices.forEach { dev ->
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = palette.layer,
                                border = BorderStroke(1.dp, palette.line),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            Text(
                                                text = dev.displayName,
                                                color = palette.ink,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            if (dev.isCurrentDevice) {
                                                Surface(
                                                    color = palette.accentSoft,
                                                    shape = RoundedCornerShape(6.dp),
                                                ) {
                                                    Text(
                                                        text = "本机",
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = palette.accentInk,
                                                    )
                                                }
                                            }
                                        }
                                        Text(
                                            text = "${dev.platform} · v${dev.appVersion} · ${dev.createdAt}",
                                            color = palette.muted,
                                            fontSize = 11.sp,
                                        )
                                    }
                                    Text(
                                        text = dev.status,
                                        color = if (dev.status == "active") palette.good else palette.muted,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Controlled Security & Telemetry Baseline Card
        DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                DingtuDimensionalIcon(
                    tone = DimensionalTone.CYAN,
                    iconRes = R.drawable.ic_shield_lock,
                    contentDescription = null,
                )
                Column {
                    Text(
                        text = "受控安全基线",
                        color = palette.ink,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "信任锚固定 · 脱敏遥测与延迟采样已启用",
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
            }

            ProfileInfoRow("客户端标识", "${DingtuConstants.APPLICATION_ID} (${DingtuConstants.HEADER_CLIENT_VALUE})")
            ProfileInfoRow("锁定版本号", "v${baseline.appVersion}")
            ProfileInfoRow("libbox 内核", "sing-box ${baseline.libboxVersion}")
            ProfileInfoRow("运行环境", baseline.libboxGoInfo)
            ProfileInfoRow("隧道引擎绑定", baseline.vpnEngineBinding)
            ProfileInfoRow("信任锚校验", if (baseline.trustVerified) "已通过 (Ed25519 + SHA-256)" else "异常")
            ProfileInfoRow("权威控制面", baseline.trustOrigin)
            ProfileInfoRow("公钥指纹", baseline.trustKeyPrefix)
            ProfileInfoRow("信任锚摘要", baseline.trustShaPrefix)
            ProfileInfoRow(
                "诊断遥测同步",
                buildString {
                    append("已同步 ${telemetrySummary.totalAcceptedEvents} 事件 / ${telemetrySummary.totalAcceptedLatencySamples} 延迟")
                    if (telemetrySummary.queuedEvents > 0 || telemetrySummary.queuedLatencySamples > 0) {
                        append("（待发 ${telemetrySummary.queuedEvents + telemetrySummary.queuedLatencySamples}）")
                    }
                },
            )
        }

        // 5. Danger Logout Button
        if (uiState.isLoggedIn) {
            Button(
                onClick = { showLogoutDialog = true },
                enabled = !uiState.authBusy,
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.danger,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = if (uiState.authBusy) "正在注销会话…" else "退出登录并撤销本机授权",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun EntitlementMiniCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = palette.layer,
        border = BorderStroke(1.dp, palette.line),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = label,
                color = palette.subtle,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = value,
                color = palette.ink,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ThemeOptionPill(
    label: String,
    iconRes: Int,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) palette.panel else palette.layer,
        border = if (selected) BorderStroke(1.dp, palette.accent.copy(alpha = 0.7f)) else null,
        shadowElevation = if (selected) 2.dp else 0.dp,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                painter = painterResource(id = iconRes),
                contentDescription = label,
                tint = if (selected) palette.accent else palette.muted,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = label,
                color = if (selected) palette.ink else palette.muted,
                fontSize = 13.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String) {
    val palette = LocalDingtuPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            color = palette.muted,
            fontSize = 13.sp,
            modifier = Modifier.weight(0.40f),
        )
        Text(
            text = value,
            color = palette.ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(0.60f),
        )
    }
}

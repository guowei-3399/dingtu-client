// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.ui.AppListFilter
import cn.noyapi.dingtu.ui.DingtuUiState
import cn.noyapi.dingtu.ui.InstalledAppDisplayItem
import cn.noyapi.dingtu.ui.components.DingtuAppBrandTileIcon
import cn.noyapi.dingtu.ui.components.DingtuLayoutTier
import cn.noyapi.dingtu.ui.components.DingtuPanelCard
import cn.noyapi.dingtu.ui.components.SecondaryPageHeader
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette

@Composable
fun RoutingAppsTabScreen(
    uiState: DingtuUiState,
    filteredApps: List<InstalledAppDisplayItem>,
    tier: DingtuLayoutTier,
    bottomContentPadding: Dp,
    onBackToConnect: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onFilterChange: (AppListFilter) -> Unit,
    onTogglePackage: (String) -> Unit,
    onSwitchToPerAppMode: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val horizontalPad = if (tier == DingtuLayoutTier.PHONE) 16.dp else 22.dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = horizontalPad, end = horizontalPad, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SecondaryPageHeader(
            title = "分流应用",
            subtitle = "管理经由定途虚拟网卡接管的 AI 应用与浏览器（已选 ${uiState.selectedPackages.size} 款）",
            tier = tier,
            onBackToConnect = onBackToConnect,
        )

        if (uiState.routingMode == VpnRoutingMode.GLOBAL_VPN) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = palette.accentSoft,
                border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.45f)),
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "当前处于「全局独享隧道」模式",
                        color = palette.accentInk,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "整机应用流量已全部接管进独享出口；下方勾选名单将在切回「按应用分流」后立即生效。",
                        color = palette.ink.copy(alpha = 0.85f),
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                    OutlinedButton(
                        onClick = onSwitchToPerAppMode,
                        border = BorderStroke(1.dp, palette.accent),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            text = "切换为按应用分流",
                            color = palette.accentInk,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        OutlinedTextField(
            value = uiState.appSearchQuery,
            onValueChange = onSearchQueryChange,
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            placeholder = { Text("搜索已安装应用名称或包名", color = palette.subtle, fontSize = 14.sp) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = palette.panel,
                unfocusedContainerColor = palette.panel,
                focusedBorderColor = palette.accent,
                unfocusedBorderColor = palette.line,
                focusedTextColor = palette.ink,
                unfocusedTextColor = palette.ink,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppListFilter.entries.forEach { filter ->
                val selected = uiState.appFilter == filter
                val suffix = if (filter == AppListFilter.SELECTED) {
                    " (${uiState.selectedPackages.size})"
                } else {
                    ""
                }
                Surface(
                    onClick = { onFilterChange(filter) },
                    shape = RoundedCornerShape(999.dp),
                    color = if (selected) palette.accentSoft else palette.panel,
                    border = BorderStroke(
                        width = 1.dp,
                        color = if (selected) palette.accent else palette.line,
                    ),
                ) {
                    Text(
                        text = "${filter.label}$suffix",
                        color = if (selected) palette.accentInk else palette.muted,
                        fontSize = 13.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                    )
                }
            }
        }

        if (filteredApps.isEmpty()) {
            DingtuPanelCard(cornerRadius = 22.dp, contentPadding = 18.dp) {
                Text(
                    text = when (uiState.appFilter) {
                        AppListFilter.RECOMMENDED -> "当前设备尚未检测到推荐列表内的 AI 应用或浏览器，可切换至「全部」筛选手动勾选所需应用。"
                        AppListFilter.SELECTED -> "尚未勾选任何受管应用，请从「推荐」或「全部」列表中勾选。"
                        AppListFilter.ALL -> "未找到匹配搜索条件的应用。"
                    },
                    color = palette.muted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(bottom = bottomContentPadding),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(
                    items = filteredApps,
                    key = { it.packageName },
                ) { appItem ->
                    val checked = appItem.packageName in uiState.selectedPackages
                    ManagedAppRowCard(
                        item = appItem,
                        checked = checked,
                        onToggle = { onTogglePackage(appItem.packageName) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ManagedAppRowCard(
    item: InstalledAppDisplayItem,
    checked: Boolean,
    onToggle: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle),
        shape = RoundedCornerShape(20.dp),
        color = palette.panel,
        border = BorderStroke(
            width = if (checked) 1.5.dp else 1.dp,
            color = if (checked) palette.accent.copy(alpha = 0.6f) else palette.line,
        ),
        shadowElevation = if (palette.isDark) 4.dp else 2.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DingtuAppBrandTileIcon(
                packageName = item.packageName,
                displayName = item.displayName,
                recommendedCategory = item.recommendedCategory,
                selected = checked,
                tileSize = 42.dp,
                cornerRadius = 13.dp,
                showCheckBadge = false,
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = item.displayName,
                        color = palette.ink,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    item.recommendedCategory?.let { cat ->
                        Surface(
                            color = palette.accentSoft,
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text(
                                text = cat,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.accentInk,
                            )
                        }
                    }
                }
                Text(
                    text = item.packageName,
                    color = palette.subtle,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Checkbox(
                checked = checked,
                onCheckedChange = { onToggle() },
                colors = CheckboxDefaults.colors(
                    checkedColor = palette.accent,
                    uncheckedColor = palette.subtle,
                    checkmarkColor = palette.btnPrimaryText,
                ),
            )
        }
    }
}

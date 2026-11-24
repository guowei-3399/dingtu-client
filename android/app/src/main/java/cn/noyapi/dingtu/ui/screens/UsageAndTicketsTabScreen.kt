// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.noyapi.dingtu.R
import cn.noyapi.dingtu.ui.DingtuUiState
import cn.noyapi.dingtu.ui.TicketDetailUi
import cn.noyapi.dingtu.ui.UsageTicketsSubTab
import cn.noyapi.dingtu.ui.components.DimensionalTone
import cn.noyapi.dingtu.ui.components.DingtuDimensionalIcon
import cn.noyapi.dingtu.ui.components.DingtuLayoutTier
import cn.noyapi.dingtu.ui.components.DingtuPanelCard
import cn.noyapi.dingtu.ui.components.SecondaryPageHeader
import cn.noyapi.dingtu.ui.theme.LocalDingtuPalette
import java.text.NumberFormat
import java.util.Locale

@Composable
fun UsageAndTicketsTabScreen(
    uiState: DingtuUiState,
    tier: DingtuLayoutTier,
    bottomContentPadding: Dp,
    onBackToConnect: () -> Unit,
    onSelectSubTab: (UsageTicketsSubTab) -> Unit,
    onSelectUsageWindowDays: (Int) -> Unit,
    onRefreshTickets: () -> Unit,
    onOpenTicketDetail: (String) -> Unit,
    onCloseTicketDetail: () -> Unit,
    onShowCreateTicket: (Boolean) -> Unit,
    onSubmitNewTicket: (subject: String, category: String, body: String) -> Unit,
    onSubmitTicketReplyOrAction: (ticketId: String, body: String?, action: String) -> Unit,
    onGoLoginTab: () -> Unit,
) {
    val palette = LocalDingtuPalette.current
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
        SecondaryPageHeader(
            title = "用量与工单",
            subtitle = "随身查阅脱敏 AI 会话用量汇总与三端闭环服务工单",
            tier = tier,
            onBackToConnect = onBackToConnect,
        )

        if (!uiState.isLoggedIn) {
            DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 20.dp) {
                Text(
                    text = "登录以查看云端用量与支持工单",
                    color = palette.ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "完成授权登录后，可在此只读查阅您的 AI 会话 Token 用量汇总，并随时提交与跟进服务工单。",
                    color = palette.muted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
                Button(
                    onClick = onGoLoginTab,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = palette.btnPrimaryText,
                    ),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(text = "前往授权登录", fontWeight = FontWeight.SemiBold)
                }
            }
            return@Column
        }

        // Segmented Sub-Tab Switcher
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
                UsageTicketsSubTab.entries.forEach { tab ->
                    val selected = uiState.usageTicketsSubTab == tab
                    Surface(
                        onClick = { onSelectSubTab(tab) },
                        shape = RoundedCornerShape(12.dp),
                        color = if (selected) palette.panel else palette.layer,
                        border = if (selected) BorderStroke(1.dp, palette.lineStrong) else null,
                        shadowElevation = if (selected) 2.dp else 0.dp,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = tab.label,
                            color = if (selected) palette.ink else palette.muted,
                            fontSize = 14.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(vertical = 10.dp),
                        )
                    }
                }
            }
        }

        when (uiState.usageTicketsSubTab) {
            UsageTicketsSubTab.USAGE -> UsageSummarySection(
                uiState = uiState,
                onSelectDays = onSelectUsageWindowDays,
            )
            UsageTicketsSubTab.TICKETS -> TicketsSection(
                uiState = uiState,
                onRefreshTickets = onRefreshTickets,
                onOpenTicketDetail = onOpenTicketDetail,
                onCloseTicketDetail = onCloseTicketDetail,
                onShowCreateTicket = onShowCreateTicket,
                onSubmitNewTicket = onSubmitNewTicket,
                onSubmitTicketReplyOrAction = onSubmitTicketReplyOrAction,
            )
        }
    }
}

@Composable
private fun UsageSummarySection(
    uiState: DingtuUiState,
    onSelectDays: (Int) -> Unit,
) {
    val palette = LocalDingtuPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        listOf(7, 30, 90).forEach { days ->
            val selected = uiState.selectedUsageDays == days
            Surface(
                onClick = { onSelectDays(days) },
                shape = RoundedCornerShape(999.dp),
                color = if (selected) palette.accentSoft else palette.panel,
                border = BorderStroke(1.dp, if (selected) palette.accent else palette.line),
            ) {
                Text(
                    text = "近 $days 天",
                    color = if (selected) palette.accentInk else palette.muted,
                    fontSize = 13.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                )
            }
        }
    }

    val summary = uiState.usageSummary
    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            DingtuDimensionalIcon(
                tone = DimensionalTone.PURPLE,
                iconRes = R.drawable.ic_nav_usage,
                contentDescription = null,
            )
            Column {
                Text(
                    text = "我的 AI 会话用量汇总（只读）",
                    color = palette.ink,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "脱敏统计口径 · 不采集任何对话正文",
                    color = palette.muted,
                    fontSize = 12.sp,
                )
            }
        }

        if (uiState.loadingUsage) {
            Text(text = "正在同步云端用量数据…", color = palette.muted, fontSize = 14.sp)
        } else if (summary == null || !summary.hasData) {
            Surface(
                color = palette.layer,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "暂无数据（近 ${uiState.selectedUsageDays} 天尚未收到已同步的脱敏会话用量记录）。",
                    color = palette.muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(14.dp),
                )
            }
        } else {
            MetricRow("总计 Token", formatCount(summary.totalTokens))
            MetricRow("输入 Token", formatCount(summary.inputTokens))
            MetricRow("思考 Token", formatCount(summary.thinkingTokens))
            MetricRow("输出 Token", formatCount(summary.outputTokens))
            MetricRow("缓存命中 Token", formatCount(summary.cacheTokens))
            MetricRow("会话 / 轮次", "${formatCount(summary.sessions)} 次会话 · ${formatCount(summary.turns)} 轮")
            MetricRow("活跃同步设备", "${summary.activeDevices} 台")

            if (summary.byApp.isNotEmpty()) {
                Text(
                    text = "按应用分布",
                    color = palette.ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 6.dp),
                )
                summary.byApp.forEach { row ->
                    MetricRow(
                        label = row.appId,
                        value = "${formatCount(row.totalTokens)} Tokens (${row.turns} 轮)",
                    )
                }
            }
        }
    }
}

@Composable
private fun TicketsSection(
    uiState: DingtuUiState,
    onRefreshTickets: () -> Unit,
    onOpenTicketDetail: (String) -> Unit,
    onCloseTicketDetail: () -> Unit,
    onShowCreateTicket: (Boolean) -> Unit,
    onSubmitNewTicket: (subject: String, category: String, body: String) -> Unit,
    onSubmitTicketReplyOrAction: (ticketId: String, body: String?, action: String) -> Unit,
) {
    val palette = LocalDingtuPalette.current
    val activeDetail = uiState.activeTicketDetail
    if (activeDetail != null) {
        TicketDetailCard(
            detail = activeDetail,
            submitting = uiState.ticketSubmitting,
            onBack = onCloseTicketDetail,
            onSubmitReplyOrAction = onSubmitTicketReplyOrAction,
        )
        return
    }

    if (uiState.showCreateTicketForm) {
        CreateTicketFormCard(
            submitting = uiState.ticketSubmitting,
            onCancel = { onShowCreateTicket(false) },
            onSubmit = onSubmitNewTicket,
        )
        return
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Button(
            onClick = { onShowCreateTicket(true) },
            colors = ButtonDefaults.buttonColors(
                containerColor = palette.accent,
                contentColor = palette.btnPrimaryText,
            ),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.weight(1f),
        ) {
            Text(text = "新建服务工单", fontWeight = FontWeight.Bold)
        }
        OutlinedButton(
            onClick = onRefreshTickets,
            enabled = !uiState.loadingTickets,
            border = BorderStroke(1.dp, palette.lineStrong),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text(
                text = if (uiState.loadingTickets) "刷新中…" else "刷新",
                color = palette.ink,
            )
        }
    }

    if (uiState.tickets.isEmpty()) {
        DingtuPanelCard(cornerRadius = 22.dp, contentPadding = 18.dp) {
            Text(
                text = if (uiState.loadingTickets) "正在加载工单记录…" else "暂无历史服务工单。遇到连接或账户问题可点击上方「新建服务工单」。",
                color = palette.muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    } else {
        uiState.tickets.forEach { ticket ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenTicketDetail(ticket.ticketId) },
                shape = RoundedCornerShape(20.dp),
                color = palette.panel,
                border = BorderStroke(1.dp, palette.line),
                shadowElevation = if (palette.isDark) 4.dp else 2.dp,
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = ticket.subject,
                            color = palette.ink,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Surface(
                            color = palette.accentSoft,
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text(
                                text = ticket.statusLabel,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.accentInk,
                            )
                        }
                    }
                    Text(
                        text = "${ticket.categoryLabel} · 更新于 ${ticket.updatedAt}${if (ticket.unreadByCustomer) " · 有新回复" else ""}",
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateTicketFormCard(
    submitting: Boolean,
    onCancel: () -> Unit,
    onSubmit: (subject: String, category: String, body: String) -> Unit,
) {
    val palette = LocalDingtuPalette.current
    var subject by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("connection") }
    var body by rememberSaveable { mutableStateOf("") }

    val categories = listOf(
        "connection" to "连接异常",
        "exit_ip" to "出口质量",
        "workbench_app" to "应用兼容",
        "account_billing" to "账户套餐",
        "other" to "其他",
    )

    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = palette.layer,
        unfocusedContainerColor = palette.layer,
        focusedBorderColor = palette.accent,
        unfocusedBorderColor = palette.line,
        focusedTextColor = palette.ink,
        unfocusedTextColor = palette.ink,
    )

    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
        Text(
            text = "新建支持工单",
            color = palette.ink,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )

        OutlinedTextField(
            value = subject,
            onValueChange = { subject = it.take(160) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            label = { Text("问题标题") },
            colors = textFieldColors,
            modifier = Modifier.fillMaxWidth(),
        )

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = "问题分类", color = palette.muted, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                categories.take(3).forEach { (code, label) ->
                    val selected = category == code
                    Surface(
                        onClick = { category = code },
                        shape = RoundedCornerShape(999.dp),
                        color = if (selected) palette.accentSoft else palette.layer,
                        border = BorderStroke(1.dp, if (selected) palette.accent else palette.line),
                    ) {
                        Text(
                            text = label,
                            color = if (selected) palette.accentInk else palette.muted,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                categories.drop(3).forEach { (code, label) ->
                    val selected = category == code
                    Surface(
                        onClick = { category = code },
                        shape = RoundedCornerShape(999.dp),
                        color = if (selected) palette.accentSoft else palette.layer,
                        border = BorderStroke(1.dp, if (selected) palette.accent else palette.line),
                    ) {
                        Text(
                            text = label,
                            color = if (selected) palette.accentInk else palette.muted,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }

        OutlinedTextField(
            value = body,
            onValueChange = { body = it.take(4000) },
            minLines = 4,
            shape = RoundedCornerShape(14.dp),
            label = { Text("详细描述（请勿粘贴密码或私钥）") },
            colors = textFieldColors,
            modifier = Modifier.fillMaxWidth(),
        )

        Text(
            text = "提交时将自动附带脱敏运行快照（v0.1.0 · android · tun 状态 · 最近错误码与请求编号，绝不包含任何密钥或隐私内容）。",
            color = palette.subtle,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(
                onClick = onCancel,
                enabled = !submitting,
                border = BorderStroke(1.dp, palette.lineStrong),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                Text("取消", color = palette.ink)
            }
            Button(
                onClick = { onSubmit(subject, category, body) },
                enabled = !submitting && subject.isNotBlank() && body.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accent,
                    contentColor = palette.btnPrimaryText,
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                Text(if (submitting) "提交中…" else "确认提交", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun TicketDetailCard(
    detail: TicketDetailUi,
    submitting: Boolean,
    onBack: () -> Unit,
    onSubmitReplyOrAction: (ticketId: String, body: String?, action: String) -> Unit,
) {
    val palette = LocalDingtuPalette.current
    var replyText by rememberSaveable(detail.summary.ticketId) { mutableStateOf("") }

    DingtuPanelCard(cornerRadius = 24.dp, contentPadding = 18.dp) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = onBack,
                border = BorderStroke(1.dp, palette.lineStrong),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("返回列表", color = palette.ink)
            }
            Surface(
                color = palette.accentSoft,
                shape = RoundedCornerShape(999.dp),
            ) {
                Text(
                    text = detail.summary.statusLabel,
                    color = palette.accentInk,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }

        Text(
            text = detail.summary.subject,
            color = palette.ink,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )

        detail.messages.forEach { msg ->
            Surface(
                color = if (msg.authorRole == "customer") palette.accentSoft.copy(alpha = 0.6f) else palette.layer,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, palette.line),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "${msg.authorLabel} · ${msg.createdAt}",
                        color = palette.muted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = msg.body,
                        color = palette.ink,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
        }

        if (detail.summary.status != "closed") {
            OutlinedTextField(
                value = replyText,
                onValueChange = { replyText = it.take(4000) },
                minLines = 2,
                shape = RoundedCornerShape(14.dp),
                label = { Text("追加补充回复") },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = palette.layer,
                    unfocusedContainerColor = palette.layer,
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
            ) {
                Button(
                    onClick = {
                        val sending = replyText
                        replyText = ""
                        onSubmitReplyOrAction(detail.summary.ticketId, sending, "reply")
                    },
                    enabled = !submitting && replyText.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = palette.btnPrimaryText,
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text("发送回复", fontWeight = FontWeight.Bold)
                }
                if (detail.summary.status == "resolved") {
                    OutlinedButton(
                        onClick = { onSubmitReplyOrAction(detail.summary.ticketId, null, "reopen") },
                        enabled = !submitting,
                        border = BorderStroke(1.dp, palette.lineStrong),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("重新打开", color = palette.ink)
                    }
                    OutlinedButton(
                        onClick = { onSubmitReplyOrAction(detail.summary.ticketId, null, "close") },
                        enabled = !submitting,
                        border = BorderStroke(1.dp, palette.lineStrong),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("确认关闭", color = palette.ink)
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
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
            modifier = Modifier.weight(0.45f),
        )
        Text(
            text = value,
            color = palette.ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(0.55f),
        )
    }
}

private fun formatCount(value: Long): String =
    NumberFormat.getIntegerInstance(Locale.US).format(value)

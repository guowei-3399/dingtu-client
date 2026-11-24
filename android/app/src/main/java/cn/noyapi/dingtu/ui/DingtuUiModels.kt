// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui

import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.diagnostics.NetworkSelfCheckReport
import cn.noyapi.dingtu.telemetry.TelemetryHealthSummary
import cn.noyapi.dingtu.vpn.ExitContextMetadata

enum class MainNavTab(val title: String) {
    CONNECT("连接"),
    ROUTING_APPS("分流应用"),
    USAGE_AND_TICKETS("用量与工单"),
    PROFILE("我的"),
}

enum class AppListFilter(val label: String) {
    RECOMMENDED("推荐"),
    SELECTED("已选"),
    ALL("全部"),
}

enum class UsageTicketsSubTab(val label: String) {
    USAGE("AI 用量"),
    TICKETS("服务工单"),
}

data class InstalledAppDisplayItem(
    val packageName: String,
    val displayName: String,
    val isRecommended: Boolean,
    val recommendedCategory: String? = null,
)

data class AccountSummaryUi(
    val maskedEmail: String,
    val customerTypeLabel: String,
    val planLevelLabel: String,
    val memberRoleLabel: String,
    val quotaSummary: String,
    val expiresAtDisplay: String,
    val boundExitContext: ExitContextMetadata?,
)

data class AuthorizedDeviceItemUi(
    val deviceId: String,
    val displayName: String,
    val platform: String,
    val appVersion: String,
    val status: String,
    val createdAt: String,
    val isCurrentDevice: Boolean,
)

data class AppUsageRowUi(
    val appId: String,
    val totalTokens: Long,
    val sessions: Long,
    val turns: Long,
)

data class UsageSummaryUi(
    val windowDays: Int,
    val hasData: Boolean,
    val totalTokens: Long,
    val inputTokens: Long,
    val thinkingTokens: Long,
    val outputTokens: Long,
    val cacheTokens: Long,
    val sessions: Long,
    val turns: Long,
    val activeDevices: Int,
    val byApp: List<AppUsageRowUi>,
)

data class TicketSummaryUi(
    val ticketId: String,
    val subject: String,
    val category: String,
    val categoryLabel: String,
    val status: String,
    val statusLabel: String,
    val unreadByCustomer: Boolean,
    val updatedAt: String,
)

data class TicketMessageUi(
    val messageId: String,
    val authorRole: String,
    val authorLabel: String,
    val body: String,
    val createdAt: String,
)

data class TicketDetailUi(
    val summary: TicketSummaryUi,
    val messages: List<TicketMessageUi>,
)

data class DingtuUiState(
    val currentTab: MainNavTab = MainNavTab.CONNECT,
    val isDarkTheme: Boolean = true,
    val isLoggedIn: Boolean = false,
    val currentDeviceId: String? = null,
    val authBusy: Boolean = false,
    val statusBannerMessage: String? = null,
    val errorBannerMessage: String? = null,
    val telemetrySummary: TelemetryHealthSummary = TelemetryHealthSummary(),

    // Account & Profile
    val accountSummary: AccountSummaryUi? = null,
    val authorizedDevices: List<AuthorizedDeviceItemUi> = emptyList(),
    val loadingAccount: Boolean = false,

    // Routing Apps
    val routingMode: VpnRoutingMode = VpnRoutingMode.PER_APP_VPN,
    val installedApps: List<InstalledAppDisplayItem> = emptyList(),
    val selectedPackages: Set<String> = emptySet(),
    val appSearchQuery: String = "",
    val appFilter: AppListFilter = AppListFilter.RECOMMENDED,

    // Basic Connectivity Check
    val selfCheckBusy: Boolean = false,
    val lastSelfCheckReport: NetworkSelfCheckReport? = null,

    // Usage & Tickets
    val usageTicketsSubTab: UsageTicketsSubTab = UsageTicketsSubTab.USAGE,
    val selectedUsageDays: Int = 30,
    val loadingUsage: Boolean = false,
    val usageSummary: UsageSummaryUi? = null,
    val loadingTickets: Boolean = false,
    val tickets: List<TicketSummaryUi> = emptyList(),
    val activeTicketDetail: TicketDetailUi? = null,
    val showCreateTicketForm: Boolean = false,
    val ticketSubmitting: Boolean = false,
)

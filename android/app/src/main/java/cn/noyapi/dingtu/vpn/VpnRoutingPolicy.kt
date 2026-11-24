// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode

class VpnRoutingException(
    val errorCode: String,
    override val message: String,
) : IllegalStateException(message)

data class ManagedAppRecommendation(
    val packageName: String,
    val defaultName: String,
    val category: String,
)

data class EffectiveVpnApplicationPlan(
    val mode: VpnRoutingMode,
    val allowedPackages: Set<String>,
    val disallowedPackages: Set<String>,
) {
    init {
        when (mode) {
            VpnRoutingMode.PER_APP_VPN -> {
                require(allowedPackages.isNotEmpty()) {
                    "per_app_vpn requires at least one allowed package"
                }
                require(disallowedPackages.isEmpty()) {
                    "per_app_vpn must not mix disallowedPackages"
                }
                require(DingtuConstants.APPLICATION_ID !in allowedPackages) {
                    "Self package must never be inside per_app_vpn allowedPackages"
                }
            }
            VpnRoutingMode.GLOBAL_VPN -> {
                require(allowedPackages.isEmpty()) {
                    "global_vpn must not set allowedPackages"
                }
                require(disallowedPackages.isNotEmpty()) {
                    "global_vpn must exclude self package"
                }
            }
        }
    }
}

object VpnRoutingPolicy {
    private val PACKAGE_NAME_REGEX =
        Regex("""^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$""")

    val RECOMMENDED_AI_AND_BROWSER_APPS: List<ManagedAppRecommendation> = listOf(
        ManagedAppRecommendation("com.openai.chatgpt", "ChatGPT", "AI 助手"),
        ManagedAppRecommendation("com.anthropic.claude", "Claude", "AI 助手"),
        ManagedAppRecommendation("ai.x.grok", "Grok", "AI 助手"),
        ManagedAppRecommendation("com.google.android.apps.bard", "Google Gemini", "AI 助手"),
        ManagedAppRecommendation("ai.perplexity.app.android", "Perplexity", "AI 搜索"),
        ManagedAppRecommendation("com.microsoft.copilot", "Microsoft Copilot", "AI 助手"),
        ManagedAppRecommendation("com.poe.android", "Poe", "AI 助手"),
        ManagedAppRecommendation("com.github.android", "GitHub", "开发者"),
        ManagedAppRecommendation("com.android.chrome", "Chrome", "浏览器"),
        ManagedAppRecommendation("com.android.chromium", "Chromium", "浏览器"),
        ManagedAppRecommendation("com.chrome.beta", "Chrome Beta", "浏览器"),
        ManagedAppRecommendation("org.mozilla.firefox", "Firefox", "浏览器"),
        ManagedAppRecommendation("com.microsoft.emmx", "Microsoft Edge", "浏览器"),
        ManagedAppRecommendation("com.brave.browser", "Brave", "浏览器"),
    )

    val RECOMMENDED_PACKAGE_NAMES: Set<String> =
        RECOMMENDED_AI_AND_BROWSER_APPS.map { it.packageName }.toSet()

    fun isValidPackageName(packageName: String): Boolean =
        packageName.length in 3..255 && PACKAGE_NAME_REGEX.matches(packageName)

    fun defaultPreselectedPackages(
        installedPackages: Set<String>,
        selfPackageName: String = DingtuConstants.APPLICATION_ID,
    ): Set<String> =
        installedPackages
            .asSequence()
            .filter { it != selfPackageName && isValidPackageName(it) && it in RECOMMENDED_PACKAGE_NAMES }
            .toSortedSet()

    fun computeEffectivePlan(
        mode: VpnRoutingMode,
        userSelectedPackages: Set<String>?,
        hasExplicitUserSelection: Boolean,
        installedPackages: Set<String>,
        selfPackageName: String = DingtuConstants.APPLICATION_ID,
    ): EffectiveVpnApplicationPlan {
        require(isValidPackageName(selfPackageName)) { "Invalid self package name" }
        val sanitizedInstalled = installedPackages
            .asSequence()
            .filter { it != selfPackageName && isValidPackageName(it) }
            .toSet()

        return when (mode) {
            VpnRoutingMode.GLOBAL_VPN -> EffectiveVpnApplicationPlan(
                mode = VpnRoutingMode.GLOBAL_VPN,
                allowedPackages = emptySet(),
                disallowedPackages = setOf(selfPackageName),
            )
            VpnRoutingMode.PER_APP_VPN -> {
                val baseCandidates = if (hasExplicitUserSelection) {
                    userSelectedPackages.orEmpty()
                } else {
                    defaultPreselectedPackages(sanitizedInstalled, selfPackageName)
                }
                val effectiveAllowed = baseCandidates
                    .asSequence()
                    .filter { it != selfPackageName && isValidPackageName(it) && it in sanitizedInstalled }
                    .toSortedSet()

                if (effectiveAllowed.isEmpty()) {
                    throw VpnRoutingException(
                        errorCode = "PER_APP_VPN_EMPTY_ALLOWLIST",
                        message = "按应用分流模式下未匹配到任何已安装受管应用，已拒绝启动以避免直连泄漏。",
                    )
                }
                EffectiveVpnApplicationPlan(
                    mode = VpnRoutingMode.PER_APP_VPN,
                    allowedPackages = effectiveAllowed,
                    disallowedPackages = emptySet(),
                )
            }
        }
    }

    fun queryInstalledNonSelfPackages(context: Context): Set<String> {
        val pm = context.packageManager
        val selfPkg = context.packageName
        val apps: List<ApplicationInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(0L))
        } else {
            @Suppress("DEPRECATION")
            pm.getInstalledApplications(0)
        }
        return apps.asSequence()
            .map { it.packageName }
            .filter { it != selfPkg && isValidPackageName(it) }
            .toSet()
    }
}

interface RoutingPreferencesStore {
    fun getRoutingMode(): VpnRoutingMode
    fun setRoutingMode(mode: VpnRoutingMode)
    fun hasExplicitSelection(): Boolean
    fun getSelectedPackages(): Set<String>
    fun setSelectedPackages(packages: Set<String>)
    fun getDarkThemeEnabled(): Boolean = true
    fun setDarkThemeEnabled(enabled: Boolean) {}
}

/**
 * Stores non-sensitive routing preferences in dedicated plain SharedPreferences,
 * physically separated from EncryptedSharedPreferences credential storage.
 */
class SharedPreferencesRoutingStore(context: Context) : RoutingPreferencesStore {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun getRoutingMode(): VpnRoutingMode =
        VpnRoutingMode.fromWireValue(prefs.getString(KEY_ROUTING_MODE, VpnRoutingMode.PER_APP_VPN.wireValue))

    override fun setRoutingMode(mode: VpnRoutingMode) {
        prefs.edit().putString(KEY_ROUTING_MODE, mode.wireValue).apply()
    }

    override fun hasExplicitSelection(): Boolean =
        prefs.getBoolean(KEY_HAS_EXPLICIT_SELECTION, false)

    override fun getSelectedPackages(): Set<String> {
        val stored = prefs.getStringSet(KEY_SELECTED_PACKAGES, emptySet()).orEmpty()
        return stored.asSequence()
            .filter { it != DingtuConstants.APPLICATION_ID && VpnRoutingPolicy.isValidPackageName(it) }
            .toSortedSet()
    }

    override fun setSelectedPackages(packages: Set<String>) {
        val sanitized = packages.asSequence()
            .filter { it != DingtuConstants.APPLICATION_ID && VpnRoutingPolicy.isValidPackageName(it) }
            .toSet()
        prefs.edit()
            .putBoolean(KEY_HAS_EXPLICIT_SELECTION, true)
            .putStringSet(KEY_SELECTED_PACKAGES, sanitized)
            .apply()
    }

    override fun getDarkThemeEnabled(): Boolean =
        prefs.getBoolean(KEY_DARK_THEME_ENABLED, true)

    override fun setDarkThemeEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DARK_THEME_ENABLED, enabled).apply()
    }

    companion object {
        private const val PREFS_NAME = "dingtu_routing_prefs_v1"
        private const val KEY_ROUTING_MODE = "vpn_routing_mode"
        private const val KEY_HAS_EXPLICIT_SELECTION = "has_explicit_app_selection"
        private const val KEY_SELECTED_PACKAGES = "selected_app_packages"
        private const val KEY_DARK_THEME_ENABLED = "ui_dark_theme_enabled"
    }
}

class InMemoryRoutingPreferencesStore(
    initialMode: VpnRoutingMode = VpnRoutingMode.PER_APP_VPN,
    initialDarkTheme: Boolean = true,
) : RoutingPreferencesStore {
    @Volatile
    private var mode: VpnRoutingMode = initialMode

    @Volatile
    private var explicit: Boolean = false

    @Volatile
    private var selected: Set<String> = emptySet()

    @Volatile
    private var darkThemeEnabled: Boolean = initialDarkTheme

    override fun getRoutingMode(): VpnRoutingMode = mode

    override fun setRoutingMode(mode: VpnRoutingMode) {
        this.mode = mode
    }

    override fun hasExplicitSelection(): Boolean = explicit

    override fun getSelectedPackages(): Set<String> = selected

    override fun setSelectedPackages(packages: Set<String>) {
        this.explicit = true
        this.selected = packages
            .filter { it != DingtuConstants.APPLICATION_ID && VpnRoutingPolicy.isValidPackageName(it) }
            .toSortedSet()
    }

    override fun getDarkThemeEnabled(): Boolean = darkThemeEnabled

    override fun setDarkThemeEnabled(enabled: Boolean) {
        this.darkThemeEnabled = enabled
    }
}

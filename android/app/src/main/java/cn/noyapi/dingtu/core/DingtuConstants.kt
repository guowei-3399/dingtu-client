// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.core

enum class VpnRoutingMode(val wireValue: String, val displayLabel: String) {
    PER_APP_VPN("per_app_vpn", "按应用分流"),
    GLOBAL_VPN("global_vpn", "全局独享隧道");

    companion object {
        fun fromWireValue(value: String?): VpnRoutingMode =
            entries.firstOrNull { it.wireValue == value } ?: PER_APP_VPN
    }
}

object DingtuConstants {
    const val APPLICATION_ID = "cn.noyapi.dingtu"
    const val APP_VERSION = "0.1.0"
    const val MIN_SDK = 26
    const val TARGET_SDK = 35
    const val COMPILE_SDK = 36

    const val CONTROL_ORIGIN = "https://dingtu.noyapi.cn"
    const val HEADER_CLIENT_NAME = "X-Noya-Client"
    const val HEADER_CLIENT_VALUE = "android-v1"
    const val HEADER_SCHEMA_NAME = "X-Noya-Schema"
    const val HEADER_SCHEMA_VALUE = "2"

    const val OAUTH_CLIENT_ID = "noya-desktop"
    const val OAUTH_PLATFORM = "android"
    const val OAUTH_DEEP_LINK_REDIRECT_URI = "noya://auth/callback"
    const val DIAGNOSTIC_ENVIRONMENT_MODE = "tun"

    const val PRODUCTION_TRUST_ASSET_NAME = "production-trust.json"
    const val PRODUCTION_TRUST_KEY_ID =
        "ed25519-56e1402e0b411015a6bebb50c7f79ae1910ee473f34200eba35eb95698798dc2"
    const val PRODUCTION_TRUST_SHA256 =
        "680f39a5442e2a560edea8dbb2ffdb19628cc3594c732c570aae1179f23d0620"

    const val EXPECTED_SING_BOX_VERSION = "1.14.2"
}

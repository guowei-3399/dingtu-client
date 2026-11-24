// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.diagnostics

import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.vpn.ExitContextMetadata
import cn.noyapi.dingtu.vpn.TunnelLifecycleState
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.net.ssl.HttpsURLConnection

data class NetworkSelfCheckReport(
    val checkedAtMillis: Long,
    val tunnelConnected: Boolean,
    val routingMode: VpnRoutingMode,
    val boundExitRegionLabel: String,
    val probeReachable: Boolean,
    val observedMaskedIp: String?,
    val observedCountryOrTrace: String?,
    val connectivitySummary: String,
    val routingScopeNote: String,
)

interface ExitSelfCheckRunner {
    fun runSelfCheck(
        tunnelState: TunnelLifecycleState,
        routingMode: VpnRoutingMode,
        exitContext: ExitContextMetadata?,
    ): NetworkSelfCheckReport
}

class BasicConnectivityCheckService(
    private val probeUrl: String = "https://1.1.1.1/cdn-cgi/trace",
    private val clockMillis: () -> Long = System::currentTimeMillis,
) : ExitSelfCheckRunner {

    override fun runSelfCheck(
        tunnelState: TunnelLifecycleState,
        routingMode: VpnRoutingMode,
        exitContext: ExitContextMetadata?,
    ): NetworkSelfCheckReport {
        val connected = tunnelState == TunnelLifecycleState.CONNECTED ||
            tunnelState == TunnelLifecycleState.RELOADING
        val boundRegion = exitContext?.regionLabel?.takeIf { it.isNotBlank() } ?: "基础联通节点"

        if (!connected) {
            return NetworkSelfCheckReport(
                checkedAtMillis = clockMillis(),
                tunnelConnected = false,
                routingMode = routingMode,
                boundExitRegionLabel = boundRegion,
                probeReachable = false,
                observedMaskedIp = null,
                observedCountryOrTrace = null,
                connectivitySummary = "当前未连接基础隧道（开源学习交流版 · 仅保留基础联通检测）",
                routingScopeNote = "开启连接后可验证基础代理链路是否可达。",
            )
        }

        val traceMap = fetchCloudflareTrace()
        val rawIp = traceMap["ip"]
        val loc = traceMap["loc"]
        val colo = traceMap["colo"]
        val traceSummary = when {
            !loc.isNullOrBlank() && !colo.isNullOrBlank() -> "$loc · $colo"
            !loc.isNullOrBlank() -> loc
            else -> null
        }

        val scopeNote = when (routingMode) {
            VpnRoutingMode.PER_APP_VPN ->
                "当前为「按应用基础分流」模式：已选应用流量经基础隧道转发至 $boundRegion（开源学习交流版已剥离防风控与时区核验模块）。"
            VpnRoutingMode.GLOBAL_VPN ->
                "当前为「全局基础隧道」模式：设备流量经基础隧道转发至 $boundRegion（开源学习交流版仅作基础联通交流）。"
        }

        val reachable = rawIp != null
        return NetworkSelfCheckReport(
            checkedAtMillis = clockMillis(),
            tunnelConnected = true,
            routingMode = routingMode,
            boundExitRegionLabel = boundRegion,
            probeReachable = reachable,
            observedMaskedIp = rawIp?.let(::maskIpAddress),
            observedCountryOrTrace = traceSummary,
            connectivitySummary = if (reachable) {
                "基础隧道联通正常"
            } else {
                "基础探测暂未响应（可直接在浏览器核验外网访问）"
            },
            routingScopeNote = scopeNote,
        )
    }

    private fun fetchCloudflareTrace(): Map<String, String> =
        runCatching {
            val conn = (URL(probeUrl).openConnection() as HttpsURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 5_000
                readTimeout = 5_000
                requestMethod = "GET"
            }
            try {
                if (conn.responseCode !in 200..299) return@runCatching emptyMap()
                val map = LinkedHashMap<String, String>()
                BufferedReader(InputStreamReader(conn.inputStream, StandardCharsets.UTF_8)).useLines { lines ->
                    lines.take(32).forEach { line ->
                        val idx = line.indexOf('=')
                        if (idx > 0) {
                            map[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
                        }
                    }
                }
                map
            } finally {
                conn.disconnect()
            }
        }.getOrDefault(emptyMap())

    companion object {
        fun maskIpAddress(ip: String): String {
            val trimmed = ip.trim()
            if ('.' in trimmed) {
                val parts = trimmed.split('.')
                if (parts.size == 4) {
                    return "${parts[0]}.${parts[1]}.*.*"
                }
            }
            if (':' in trimmed) {
                val parts = trimmed.split(':').filter { it.isNotEmpty() }
                if (parts.size >= 2) {
                    return "${parts[0]}:${parts[1]}:*:*:*"
                }
            }
            return "***"
        }
    }
}

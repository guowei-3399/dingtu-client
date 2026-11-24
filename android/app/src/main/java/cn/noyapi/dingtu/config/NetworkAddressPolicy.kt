// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

object NetworkAddressPolicy {
    private val IPV4_LITERAL_REGEX =
        Regex("""^(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$""")
    private val DISALLOWED_HOST_SUFFIX =
        Regex("""(?:^|\.)(?:invalid|test|example|localhost)$""", RegexOption.IGNORE_CASE)

    fun isIpLiteral(value: String): Boolean {
        if (value.isEmpty() || '%' in value) return false
        if (IPV4_LITERAL_REGEX.matches(value)) return true
        if (':' in value) {
            return parseIpv6Literal(value) != null
        }
        return false
    }

    fun isValidClientEndpointHost(host: String): Boolean {
        if (host.isEmpty() || '%' in host) return false
        if (IPV4_LITERAL_REGEX.matches(host)) {
            return isPublicUnicastIp(host)
        }
        if (':' in host) {
            return isPublicUnicastIp(host)
        }
        if (host.length > 253 || host != host.lowercase()) return false
        if (DISALLOWED_HOST_SUFFIX.containsMatchIn(host)) return false
        val labels = host.split('.')
        if (labels.size < 2) return false
        for (label in labels) {
            if (label.isEmpty() || label.length > 63 || label.startsWith('-') || label.endsWith('-')) {
                return false
            }
            for (ch in label) {
                if (ch !in 'a'..'z' && ch !in '0'..'9' && ch != '-') {
                    return false
                }
            }
        }
        // Final TLD cannot be all digits (prevents malformed IPv4 masquerading as hostname).
        if (labels.last().all { it in '0'..'9' }) return false
        return true
    }

    fun isPublicUnicastIp(rawIp: String): Boolean {
        if (rawIp.isEmpty() || '%' in rawIp || rawIp != rawIp.trim()) return false
        if (IPV4_LITERAL_REGEX.matches(rawIp)) {
            val octets = rawIp.split('.').map { it.toInt() }
            val a = octets[0]
            val b = octets[1]
            val c = octets[2]
            if (a == 0) return false // 0.0.0.0/8
            if (a == 10) return false // 10.0.0.0/8
            if (a == 100 && b in 64..127) return false // 100.64.0.0/10 CGNAT
            if (a == 127) return false // 127.0.0.0/8 loopback
            if (a == 169 && b == 254) return false // 169.254.0.0/16 link-local
            if (a == 172 && b in 16..31) return false // 172.16.0.0/12 private
            if (a == 192 && b == 0 && (c == 0 || c == 2)) return false // 192.0.0.0/24, 192.0.2.0/24
            if (a == 192 && b == 168) return false // 192.168.0.0/16 private
            if (a == 198 && (b == 18 || b == 19)) return false // 198.18.0.0/15 benchmark
            if (a == 198 && b == 51 && c == 100) return false // 198.51.100.0/24 TEST-NET-2
            if (a == 203 && b == 0 && c == 113) return false // 203.0.113.0/24 TEST-NET-3
            if (a >= 224) return false // multicast 224.0.0.0/4 & reserved 240.0.0.0/4
            return true
        }
        if (':' !in rawIp) return false
        val addr = parseIpv6Literal(rawIp) ?: return false
        val bytes = addr.address
        if (bytes.size != 16) return false
        // Reject IPv4-mapped IPv6 (::ffff:0:0/96) or IPv4-compatible IPv6
        val first10Zero = (0 until 10).all { bytes[it].toInt() == 0 }
        if (first10Zero) {
            val b10 = bytes[10].toInt() and 0xFF
            val b11 = bytes[11].toInt() and 0xFF
            if ((b10 == 0 && b11 == 0) || (b10 == 0xFF && b11 == 0xFF)) {
                return false
            }
        }
        if (addr.isAnyLocalAddress || addr.isLoopbackAddress || addr.isLinkLocalAddress ||
            addr.isSiteLocalAddress || addr.isMulticastAddress
        ) {
            return false
        }
        val firstByte = bytes[0].toInt() and 0xFF
        val secondByte = bytes[1].toInt() and 0xFF
        // fc00::/7 Unique Local
        if ((firstByte and 0xFE) == 0xFC) return false
        // 2001:db8::/32 documentation prefix
        if (firstByte == 0x20 && secondByte == 0x01 &&
            (bytes[2].toInt() and 0xFF) == 0x0D && (bytes[3].toInt() and 0xFF) == 0xB8
        ) {
            return false
        }
        // Global unicast 2000::/3
        return (firstByte and 0xE0) == 0x20
    }

    private fun parseIpv6Literal(rawIp: String): Inet6Address? {
        if (rawIp.isEmpty() || '%' in rawIp || '[' in rawIp || ']' in rawIp) return null
        if (!rawIp.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' || it == ':' || it == '.' }) {
            return null
        }
        // Reject IPv4 dotted-quad embedded in IPv6 literal
        if ('.' in rawIp) return null
        return try {
            val parsed = InetAddress.getByName(rawIp)
            parsed as? Inet6Address
        } catch (_: Exception) {
            null
        }
    }

    fun normalizeHttpsOrigin(rawOrigin: String): String {
        val uri = java.net.URI(rawOrigin)
        require(uri.scheme == "https") { "Origin must use https scheme" }
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) {
            "Origin must not include userinfo, query, or fragment"
        }
        require(uri.rawPath.isNullOrEmpty()) { "Origin must not include trailing path or slash" }
        val host = uri.host?.lowercase() ?: throw IllegalArgumentException("Origin missing host")
        require(host.isNotEmpty() && uri.host == host) { "Origin host must be lowercase" }
        val portPart = when (uri.port) {
            -1, 443 -> ""
            in 1..65535 -> ":${uri.port}"
            else -> throw IllegalArgumentException("Invalid origin port")
        }
        return "https://$host$portPart"
    }

    @Suppress("unused")
    internal fun isInet4Instance(addr: InetAddress): Boolean = addr is Inet4Address
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import cn.noyapi.dingtu.json.StrictJsonValidator
import org.json.JSONArray
import org.json.JSONObject

class ConfigGenerationException(message: String, cause: Throwable? = null) :
    IllegalStateException(message, cause)

object AndroidLibboxConfigBuilder {
    const val TUN_INBOUND_TAG = "tun-in"
    const val TUN_CIDR = "172.19.0.1/30"
    const val TUN_MTU = 1500
    const val TUN_STACK = "gvisor"
    const val DEVICE_OUTBOUND_TAG = "noya-device"
    const val REMOTE_DNS_TAG = "noya-remote-dns"
    const val BOOTSTRAP_HOSTS_TAG = "noya-bootstrap-hosts"

    private val ANDROID_LIBBOX_ALLOWED_KEYS = setOf(
        "inbounds", "outbounds", "dns", "route",
        "type", "tag", "address", "mtu", "stack", "auto_route",
        "server", "server_port", "uuid", "flow", "domain_resolver",
        "tls", "enabled", "server_name", "utls", "fingerprint", "reality", "public_key", "short_id",
        "servers", "path", "detour", "predefined", "final",
        "auto_detect_interface", "default_domain_resolver", "rules", "protocol", "action",
    )

    private val EXISTING_DOMAIN_RESOLVER_PROP_REGEX =
        Regex(""""domain_resolver"\s*:\s*"(?:\\.|[^"\\])*"""")

    fun buildClosedConfigJson(
        verified: VerifiedProductionConfig,
        resolvedBootstrapIps: List<String> = emptyList(),
    ): String {
        val effectiveBootstrapIps = resolveValidatedBootstrapIps(verified, resolvedBootstrapIps)
        val preservedOutboundJson = injectBootstrapResolverVerbatim(verified.rawDeviceOutboundJson)

        val predefinedIpsJson = effectiveBootstrapIps.joinToString(",") { JSONObject.quote(it) }
        val serverKeyQuoted = JSONObject.quote(verified.outboundServer)

        val generated = buildString(1024) {
            append('{')
            append("\"inbounds\":[{")
            append("\"type\":\"tun\",")
            append("\"tag\":\"").append(TUN_INBOUND_TAG).append("\",")
            append("\"address\":[\"").append(TUN_CIDR).append("\"],")
            append("\"mtu\":").append(TUN_MTU).append(',')
            append("\"stack\":\"").append(TUN_STACK).append("\",")
            append("\"auto_route\":true")
            append("}],")
            append("\"outbounds\":[").append(preservedOutboundJson).append("],")
            append("\"dns\":{")
            append("\"servers\":[")
            append("{\"tag\":\"").append(REMOTE_DNS_TAG).append("\",")
            append("\"type\":\"https\",")
            append("\"server\":\"cloudflare-dns.com\",")
            append("\"server_port\":443,")
            append("\"path\":\"/dns-query\",")
            append("\"detour\":\"").append(DEVICE_OUTBOUND_TAG).append("\"},")
            append("{\"tag\":\"").append(BOOTSTRAP_HOSTS_TAG).append("\",")
            append("\"type\":\"hosts\",")
            append("\"predefined\":{").append(serverKeyQuoted).append(":[").append(predefinedIpsJson).append("]}}")
            append("],")
            append("\"final\":\"").append(REMOTE_DNS_TAG).append("\"")
            append("},")
            append("\"route\":{")
            append("\"auto_detect_interface\":false,")
            append("\"default_domain_resolver\":\"").append(BOOTSTRAP_HOSTS_TAG).append("\",")
            append("\"rules\":[")
            append("{\"action\":\"sniff\"},")
            append("{\"protocol\":\"dns\",\"action\":\"hijack-dns\"}")
            append("],")
            append("\"final\":\"").append(DEVICE_OUTBOUND_TAG).append("\"")
            append('}')
            append('}')
        }

        assertClosedAndroidLibboxConfig(generated, verified, effectiveBootstrapIps)
        return generated
    }

    private fun resolveValidatedBootstrapIps(
        verified: VerifiedProductionConfig,
        callerBootstrapIps: List<String>,
    ): List<String> {
        val candidateIps = when {
            NetworkAddressPolicy.isIpLiteral(verified.outboundServer) -> listOf(verified.outboundServer)
            verified.signedBootstrapIps.isNotEmpty() -> verified.signedBootstrapIps
            else -> callerBootstrapIps
        }.distinct()

        if (candidateIps.isEmpty() || candidateIps.size > 4) {
            throw ConfigGenerationException(
                "Missing or excessive public bootstrap IPs for outbound server ${verified.outboundServer}"
            )
        }
        for (ip in candidateIps) {
            if (!NetworkAddressPolicy.isPublicUnicastIp(ip)) {
                throw ConfigGenerationException("Bootstrap IP is not public unicast: $ip")
            }
            if (NetworkAddressPolicy.isIpLiteral(verified.outboundServer) && ip != verified.outboundServer) {
                throw ConfigGenerationException("IP literal outbound server must bootstrap to itself")
            }
        }
        return candidateIps
    }

    /**
     * Preserves every signed byte of `outbounds[0]` verbatim, setting or replacing only
     * `"domain_resolver":"noya-bootstrap-hosts"` at the top level of `outbounds[0]`.
     */
    private fun injectBootstrapResolverVerbatim(rawOutboundJson: String): String {
        val trimmed = rawOutboundJson.trim()
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
            throw ConfigGenerationException("Invalid raw outbound JSON object slice")
        }
        val replacementProp = "\"domain_resolver\":\"$BOOTSTRAP_HOSTS_TAG\""
        val parsed = JSONObject(trimmed)
        return if (parsed.has("domain_resolver")) {
            val replaced = EXISTING_DOMAIN_RESOLVER_PROP_REGEX.replaceFirst(trimmed, replacementProp)
            if (replaced == trimmed && parsed.optString("domain_resolver") != BOOTSTRAP_HOSTS_TAG) {
                throw ConfigGenerationException("Failed to update domain_resolver in outbound JSON")
            }
            replaced
        } else {
            val closingBraceIndex = trimmed.lastIndexOf('}')
            trimmed.substring(0, closingBraceIndex) + "," + replacementProp + "}"
        }
    }

    internal fun assertClosedAndroidLibboxConfig(
        generatedJson: String,
        verified: VerifiedProductionConfig,
        expectedBootstrapIps: List<String>,
    ) {
        try {
            StrictJsonValidator.assertStrictJson(
                text = generatedJson,
                maxDepth = 8,
                rejectCaseCollisions = true,
                allowedKeys = ANDROID_LIBBOX_ALLOWED_KEYS,
                dynamicMapParentKey = "predefined",
            )
        } catch (err: Exception) {
            throw ConfigGenerationException("Generated Android libbox JSON failed strict schema validation", err)
        }

        val root = JSONObject(generatedJson)
        if (root.keys().asSequence().toSet() != setOf("inbounds", "outbounds", "dns", "route")) {
            throw ConfigGenerationException("Generated libbox JSON has unexpected root keys")
        }

        val inbounds = root.getJSONArray("inbounds")
        if (inbounds.length() != 1) {
            throw ConfigGenerationException("Generated libbox JSON must contain exactly 1 tun inbound")
        }
        val tunIn = inbounds.getJSONObject(0)
        if (tunIn.getString("type") != "tun" ||
            tunIn.getString("tag") != TUN_INBOUND_TAG ||
            tunIn.getJSONArray("address").let { it.length() != 1 || it.getString(0) != TUN_CIDR } ||
            tunIn.getInt("mtu") != TUN_MTU ||
            tunIn.getString("stack") != TUN_STACK ||
            !tunIn.getBoolean("auto_route") ||
            tunIn.has("strict_route")
        ) {
            throw ConfigGenerationException("Generated tun inbound violates Android VpnService contract")
        }

        val outbounds = root.getJSONArray("outbounds")
        if (outbounds.length() != 1) {
            throw ConfigGenerationException("Generated libbox JSON MUST contain exactly 1 outbound (zero direct)")
        }
        val out0 = outbounds.getJSONObject(0)
        val originalOut0 = JSONObject(verified.rawDeviceOutboundJson)
        if (out0.getString("type") != "vless" ||
            out0.getString("tag") != DEVICE_OUTBOUND_TAG ||
            out0.getString("domain_resolver") != BOOTSTRAP_HOSTS_TAG
        ) {
            throw ConfigGenerationException("Generated outbound violated noya-device vless invariant")
        }
        // Verify zero mutation of every signed outbound field except domain_resolver.
        for (key in originalOut0.keys()) {
            if (key == "domain_resolver") continue
            val origVal = originalOut0.get(key).toString()
            val genVal = out0.opt(key)?.toString()
            if (origVal != genVal) {
                throw ConfigGenerationException("Signed outbound property '$key' mutated during encapsulation")
            }
        }
        for (key in out0.keys()) {
            if (key != "domain_resolver" && !originalOut0.has(key)) {
                throw ConfigGenerationException("Unexpected extra property '$key' injected into signed outbound")
            }
        }

        val dns = root.getJSONObject("dns")
        if (dns.getString("final") != REMOTE_DNS_TAG) {
            throw ConfigGenerationException("Generated dns.final must equal '$REMOTE_DNS_TAG'")
        }
        val dnsServers = dns.getJSONArray("servers")
        if (dnsServers.length() != 2) {
            throw ConfigGenerationException("Generated dns.servers must have exact 2 entries")
        }
        val doh = dnsServers.getJSONObject(0)
        val hosts = dnsServers.getJSONObject(1)
        if (doh.getString("tag") != REMOTE_DNS_TAG ||
            doh.getString("type") != "https" ||
            doh.getString("server") != "cloudflare-dns.com" ||
            doh.getInt("server_port") != 443 ||
            doh.getString("path") != "/dns-query" ||
            doh.getString("detour") != DEVICE_OUTBOUND_TAG
        ) {
            throw ConfigGenerationException("Generated remote DoH server violates contract")
        }
        val predefined = hosts.getJSONObject("predefined")
        val mappedArray: JSONArray = predefined.getJSONArray(verified.outboundServer)
        val mappedIps = (0 until mappedArray.length()).map { mappedArray.getString(it) }
        if (hosts.getString("tag") != BOOTSTRAP_HOSTS_TAG ||
            hosts.getString("type") != "hosts" ||
            predefined.keys().asSequence().toSet() != setOf(verified.outboundServer) ||
            mappedIps != expectedBootstrapIps
        ) {
            throw ConfigGenerationException("Generated bootstrap hosts server violates contract")
        }

        val route = root.getJSONObject("route")
        if (route.getBoolean("auto_detect_interface") ||
            route.getString("default_domain_resolver") != BOOTSTRAP_HOSTS_TAG ||
            route.getString("final") != DEVICE_OUTBOUND_TAG
        ) {
            throw ConfigGenerationException("Generated route header violates zero-direct contract")
        }
        val rules = route.getJSONArray("rules")
        if (rules.length() != 2) {
            throw ConfigGenerationException("Generated route.rules must contain exact 2 ordered rules")
        }
        val r0 = rules.getJSONObject(0)
        val r1 = rules.getJSONObject(1)
        if (r0.keys().asSequence().toSet() != setOf("action") || r0.getString("action") != "sniff") {
            throw ConfigGenerationException("Rule 0 must be sniff")
        }
        if (r1.keys().asSequence().toSet() != setOf("protocol", "action") ||
            r1.getString("protocol") != "dns" ||
            r1.getString("action") != "hijack-dns"
        ) {
            throw ConfigGenerationException("Rule 1 must be hijack-dns")
        }
    }
}

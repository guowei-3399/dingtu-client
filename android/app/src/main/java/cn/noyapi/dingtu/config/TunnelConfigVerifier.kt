// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.json.StrictJsonException
import cn.noyapi.dingtu.json.StrictJsonValidator
import cn.noyapi.dingtu.trust.ProductionTrustAnchor
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

class ConfigVerificationException(
    val reasonCode: String,
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

class VerifiedProductionConfig internal constructor(
    val deviceId: String,
    val authorizationHandleDigest: String,
    val bindingRevision: String,
    val configRevision: String,
    val expiresAt: String,
    val expiresAtMillis: Long,
    val keyId: String,
    val outboundServer: String,
    val outboundServerPort: Int,
    val outboundTlsServerName: String,
    val signedBootstrapIps: List<String>,
    internal val rawDeviceOutboundJson: String,
) {
    override fun toString(): String =
        "VerifiedProductionConfig(deviceId=$deviceId, bindingRevision=$bindingRevision, configRevision=$configRevision, expiresAt=$expiresAt)"
}

object TunnelConfigVerifier {
    private const val MAX_ENVELOPE_BYTES = 64 * 1024
    private const val MAX_LEASE_WINDOW_MILLIS = 660_000L
    private const val MAX_SAFE_REVISION_NUMBER = 9_007_199_254_740_991L
    private const val SIGNING_DOMAIN = "dingtu-production-config-v1"
    private const val REQUIRED_INBOUND_LISTEN = "127.0.0.1"
    private const val REQUIRED_INBOUND_PORT = 17899
    private const val REQUIRED_OUTBOUND_TAG = "noya-device"

    private val ENVELOPE_KEYS = setOf(
        "data_source",
        "deviceId",
        "authorizationHandleDigest",
        "bindingRevision",
        "configRevision",
        "expiresAt",
        "config",
        "signature",
    )
    private val SIGNATURE_KEYS = setOf("keyId", "value")
    private val BASE_POLICY_ALLOWED_KEYS = setOf(
        "inbounds", "outbounds", "route", "dns",
        "type", "tag", "listen", "listen_port",
        "server", "server_port", "uuid", "flow", "domain_resolver",
        "tls", "enabled", "server_name",
        "utls", "fingerprint",
        "reality", "public_key", "short_id",
        "final", "rules", "protocol", "action",
        "servers", "path", "detour", "predefined",
    )

    private val UUID_LOWER_REGEX =
        Regex("""^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$""")
    private val UUID_ANYCASE_REGEX =
        Regex("""^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$""")
    private val ZERO_UUID = "00000000-0000-0000-0000-000000000000"
    private val BINDING_REVISION_REGEX = Regex("""^binding-([1-9][0-9]{0,15})$""")
    private val UTC_MILLIS_TIMESTAMP_REGEX =
        Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$""")
    private val REALITY_SHORT_ID_REGEX = Regex("""^(?:[0-9a-f]{2}){0,8}$""")
    private val UTC_MS_FORMATTER: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun buildEnvelopeSigningInput(
        dataSource: String,
        deviceId: String,
        authorizationHandleDigest: String,
        bindingRevision: String,
        configRevision: String,
        expiresAt: String,
        signatureKeyId: String,
        configJson: String,
    ): String {
        val configDigestHex = Ed25519Crypto.sha256HexUtf8(configJson)
        return listOf(
            SIGNING_DOMAIN,
            dataSource,
            deviceId,
            authorizationHandleDigest,
            bindingRevision,
            configRevision,
            expiresAt,
            signatureKeyId,
            configDigestHex,
        ).joinToString("\n")
    }

    fun verifyEnvelopeAndPolicy(
        rawEnvelopeBytes: ByteArray,
        expectedDeviceId: String,
        expectedAuthorizationHandle: String,
        trustAnchor: VerifiedTrustAnchor,
        nowMillis: Long = System.currentTimeMillis(),
    ): VerifiedProductionConfig {
        if (rawEnvelopeBytes.isEmpty() || rawEnvelopeBytes.size > MAX_ENVELOPE_BYTES) {
            throw ConfigVerificationException(
                "ENVELOPE_SIZE_INVALID",
                "Production config envelope byte length invalid: ${rawEnvelopeBytes.size}",
            )
        }
        val normalizedExpectedDeviceId = expectedDeviceId.lowercase()
        if (!UUID_LOWER_REGEX.matches(normalizedExpectedDeviceId)) {
            throw ConfigVerificationException("DEVICE_ID_INVALID", "Expected deviceId is not canonical UUID")
        }
        if (!DeviceProofSigner.isValidAuthorizationHandle(expectedAuthorizationHandle)) {
            throw ConfigVerificationException("HANDLE_INVALID", "Expected authorizationHandle is malformed")
        }

        val envelopeText = String(rawEnvelopeBytes, StandardCharsets.UTF_8)
        try {
            StrictJsonValidator.assertStrictJson(envelopeText, maxDepth = 6, rejectCaseCollisions = true)
        } catch (err: StrictJsonException) {
            throw ConfigVerificationException("ENVELOPE_JSON_INVALID", "Envelope failed strict JSON check", err)
        }

        val root = try {
            JSONObject(envelopeText)
        } catch (err: Exception) {
            throw ConfigVerificationException("ENVELOPE_JSON_INVALID", "Envelope JSON parse error", err)
        }

        if (root.keys().asSequence().toSet() != ENVELOPE_KEYS) {
            throw ConfigVerificationException("ENVELOPE_KEYS_INVALID", "Envelope must contain exact 8 required fields")
        }

        val dataSource = requireExactStringField(root, "data_source")
        if (dataSource != "production") {
            throw ConfigVerificationException("DATA_SOURCE_INVALID", "Envelope data_source must be 'production'")
        }

        val deviceId = requireExactStringField(root, "deviceId")
        if (deviceId != normalizedExpectedDeviceId) {
            throw ConfigVerificationException("DEVICE_ID_MISMATCH", "Envelope deviceId mismatch")
        }

        val expectedHandleDigest = Ed25519Crypto.sha256HexUtf8(expectedAuthorizationHandle)
        val authorizationHandleDigest = requireExactStringField(root, "authorizationHandleDigest")
        if (!Ed25519Crypto.constantTimeEquals(authorizationHandleDigest, expectedHandleDigest)) {
            throw ConfigVerificationException("HANDLE_DIGEST_MISMATCH", "Envelope authorizationHandleDigest mismatch")
        }

        val bindingRevision = requireExactStringField(root, "bindingRevision")
        val revMatch = BINDING_REVISION_REGEX.matchEntire(bindingRevision)
            ?: throw ConfigVerificationException("BINDING_REVISION_INVALID", "Invalid bindingRevision format")
        val revNumber = revMatch.groupValues[1].toLongOrNull()
            ?: throw ConfigVerificationException("BINDING_REVISION_INVALID", "Overflow in bindingRevision")
        if (revNumber < 1L || revNumber > MAX_SAFE_REVISION_NUMBER) {
            throw ConfigVerificationException("BINDING_REVISION_INVALID", "bindingRevision out of safe integer range")
        }

        val configText = requireExactStringField(root, "config")
        val expectedConfigRevision = "cfg-${Ed25519Crypto.sha256HexUtf8(configText)}"
        val configRevision = requireExactStringField(root, "configRevision")
        if (!Ed25519Crypto.constantTimeEquals(configRevision, expectedConfigRevision)) {
            throw ConfigVerificationException("CONFIG_REVISION_MISMATCH", "configRevision does not match config SHA-256")
        }

        val expiresAt = requireExactStringField(root, "expiresAt")
        val expiresAtMillis = parseStrictUtcMillis(expiresAt)
        if (expiresAtMillis <= nowMillis || expiresAtMillis > nowMillis + MAX_LEASE_WINDOW_MILLIS) {
            throw ConfigVerificationException(
                "CONFIG_EXPIRED_OR_WINDOW_INVALID",
                "Config expiresAt outside valid lease window",
            )
        }

        val signatureObj = root.opt("signature") as? JSONObject
            ?: throw ConfigVerificationException("SIGNATURE_OBJECT_INVALID", "Missing signature object")
        if (signatureObj.keys().asSequence().toSet() != SIGNATURE_KEYS) {
            throw ConfigVerificationException("SIGNATURE_KEYS_INVALID", "Signature object must have exact keyId and value")
        }
        val signatureKeyId = requireExactStringField(signatureObj, "keyId")
        val signatureValue = requireExactStringField(signatureObj, "value")

        if (ProductionTrustAnchor.isForbiddenTestKey(keyId = signatureKeyId, x = null)) {
            throw ConfigVerificationException("FORBIDDEN_TEST_KEY", "Envelope signed by forbidden test keyId")
        }
        if (signatureKeyId != trustAnchor.keyId) {
            throw ConfigVerificationException("UNTRUSTED_KEY_ID", "Envelope signature keyId is not pinned")
        }

        val signingInput = buildEnvelopeSigningInput(
            dataSource = dataSource,
            deviceId = deviceId,
            authorizationHandleDigest = authorizationHandleDigest,
            bindingRevision = bindingRevision,
            configRevision = configRevision,
            expiresAt = expiresAt,
            signatureKeyId = signatureKeyId,
            configJson = configText,
        )
        val signatureValid = Ed25519Crypto.verifyBase64Url(
            publicKeyBytes = trustAnchor.publicKeyBytes,
            message = signingInput.toByteArray(StandardCharsets.UTF_8),
            signatureBase64Url = signatureValue,
        )
        if (!signatureValid) {
            throw ConfigVerificationException("SIGNATURE_INVALID", "Ed25519 signature verification failed")
        }

        val parsedPolicy = validateClosedProductionConfigPolicy(configText)

        return VerifiedProductionConfig(
            deviceId = deviceId,
            authorizationHandleDigest = authorizationHandleDigest,
            bindingRevision = bindingRevision,
            configRevision = configRevision,
            expiresAt = expiresAt,
            expiresAtMillis = expiresAtMillis,
            keyId = signatureKeyId,
            outboundServer = parsedPolicy.server,
            outboundServerPort = parsedPolicy.serverPort,
            outboundTlsServerName = parsedPolicy.tlsServerName,
            signedBootstrapIps = parsedPolicy.bootstrapIps,
            rawDeviceOutboundJson = parsedPolicy.rawDeviceOutboundJson,
        )
    }

    private data class ParsedClosedPolicy(
        val server: String,
        val serverPort: Int,
        val tlsServerName: String,
        val bootstrapIps: List<String>,
        val rawDeviceOutboundJson: String,
    )

    private fun validateClosedProductionConfigPolicy(configText: String): ParsedClosedPolicy {
        try {
            StrictJsonValidator.assertStrictJson(
                text = configText,
                maxDepth = 8,
                rejectCaseCollisions = true,
                allowedKeys = BASE_POLICY_ALLOWED_KEYS,
                dynamicMapParentKey = "predefined",
            )
        } catch (err: StrictJsonException) {
            throw ConfigVerificationException(
                "CONFIG_POLICY_SCHEMA_REJECTED",
                "Config contains disallowed, duplicate, or malformed JSON fields",
                err,
            )
        }

        val cfg = try {
            JSONObject(configText)
        } catch (err: Exception) {
            throw ConfigVerificationException("CONFIG_JSON_INVALID", "Failed to parse config JSON", err)
        }

        val topKeys = cfg.keys().asSequence().toSet()
        if (!setOf("inbounds", "outbounds", "route", "dns").containsAll(topKeys) ||
            !topKeys.containsAll(setOf("inbounds", "outbounds", "route"))
        ) {
            throw ConfigVerificationException("CONFIG_TOP_KEYS_INVALID", "Unexpected top-level config keys: $topKeys")
        }

        // 1. Validate single mixed 127.0.0.1:17899 inbound
        val inbounds = cfg.opt("inbounds") as? JSONArray
            ?: throw ConfigVerificationException("CONFIG_INBOUNDS_INVALID", "inbounds must be an array")
        if (inbounds.length() != 1) {
            throw ConfigVerificationException("CONFIG_INBOUNDS_COUNT", "inbounds must contain exactly 1 entry")
        }
        val inbound0 = inbounds.opt(0) as? JSONObject
            ?: throw ConfigVerificationException("CONFIG_INBOUND_INVALID", "inbounds[0] must be an object")
        val inboundKeys = inbound0.keys().asSequence().toSet()
        if (inboundKeys != setOf("type", "listen", "listen_port") ||
            requireExactStringField(inbound0, "type") != "mixed" ||
            requireExactStringField(inbound0, "listen") != REQUIRED_INBOUND_LISTEN ||
            requireExactIntField(inbound0, "listen_port") != REQUIRED_INBOUND_PORT
        ) {
            throw ConfigVerificationException(
                "CONFIG_INBOUND_POLICY_REJECTED",
                "inbounds[0] must be strictly mixed 127.0.0.1:17899",
            )
        }

        // 2. Validate single controlled noya-device VLESS outbound (ZERO direct / extra outbounds)
        val outbounds = cfg.opt("outbounds") as? JSONArray
            ?: throw ConfigVerificationException("CONFIG_OUTBOUNDS_INVALID", "outbounds must be an array")
        if (outbounds.length() != 1) {
            throw ConfigVerificationException(
                "CONFIG_OUTBOUNDS_COUNT",
                "outbounds must contain exactly 1 entry (got ${outbounds.length()})",
            )
        }
        val outbound0 = outbounds.opt(0) as? JSONObject
            ?: throw ConfigVerificationException("CONFIG_OUTBOUND_INVALID", "outbounds[0] must be an object")

        val outboundAllowedKeys = setOf(
            "type", "tag", "server", "server_port", "uuid", "flow", "domain_resolver", "tls"
        )
        if (!outboundAllowedKeys.containsAll(outbound0.keys().asSequence().toSet())) {
            throw ConfigVerificationException("CONFIG_OUTBOUND_KEYS_INVALID", "Unexpected keys on outbounds[0]")
        }

        val outType = requireExactStringField(outbound0, "type")
        val outTag = requireExactStringField(outbound0, "tag")
        if (outType != "vless" || outTag != REQUIRED_OUTBOUND_TAG) {
            throw ConfigVerificationException(
                "CONFIG_OUTBOUND_TYPE_OR_TAG_REJECTED",
                "Single outbound must be vless tagged '$REQUIRED_OUTBOUND_TAG'",
            )
        }

        val server = requireExactStringField(outbound0, "server")
        if (!NetworkAddressPolicy.isValidClientEndpointHost(server)) {
            throw ConfigVerificationException("CONFIG_OUTBOUND_SERVER_INVALID", "Invalid outbound server host")
        }

        val serverPort = requireExactIntField(outbound0, "server_port")
        if (serverPort !in 1..65535) {
            throw ConfigVerificationException("CONFIG_OUTBOUND_PORT_INVALID", "Invalid outbound server_port")
        }

        val uuid = requireExactStringField(outbound0, "uuid")
        if (!UUID_ANYCASE_REGEX.matches(uuid) || uuid.equals(ZERO_UUID, ignoreCase = true)) {
            throw ConfigVerificationException("CONFIG_OUTBOUND_UUID_INVALID", "Invalid outbound VLESS UUID")
        }

        if (outbound0.has("flow")) {
            val flow = requireExactStringField(outbound0, "flow")
            if (flow.isNotEmpty() && flow != "xtls-rprx-vision") {
                throw ConfigVerificationException("CONFIG_OUTBOUND_FLOW_INVALID", "Unsupported VLESS flow")
            }
        }

        val domainResolver = if (outbound0.has("domain_resolver")) {
            requireExactStringField(outbound0, "domain_resolver")
        } else {
            ""
        }

        val tlsObj = outbound0.opt("tls") as? JSONObject
            ?: throw ConfigVerificationException("CONFIG_TLS_MISSING", "VLESS outbound must enable TLS")
        val tlsAllowedKeys = setOf("enabled", "server_name", "utls", "reality")
        if (!tlsAllowedKeys.containsAll(tlsObj.keys().asSequence().toSet())) {
            throw ConfigVerificationException("CONFIG_TLS_KEYS_INVALID", "Unexpected keys on outbound tls")
        }
        if (!requireExactBooleanField(tlsObj, "enabled")) {
            throw ConfigVerificationException("CONFIG_TLS_DISABLED", "VLESS outbound tls.enabled must be true")
        }
        val serverName = requireExactStringField(tlsObj, "server_name")
        if (!NetworkAddressPolicy.isValidClientEndpointHost(serverName)) {
            throw ConfigVerificationException("CONFIG_TLS_SNI_INVALID", "Invalid TLS server_name")
        }

        val hasUtls = tlsObj.has("utls")
        if (hasUtls) {
            val utlsObj = tlsObj.opt("utls") as? JSONObject
                ?: throw ConfigVerificationException("CONFIG_UTLS_INVALID", "tls.utls must be an object")
            if (utlsObj.keys().asSequence().toSet() != setOf("enabled", "fingerprint") ||
                !requireExactBooleanField(utlsObj, "enabled") ||
                requireExactStringField(utlsObj, "fingerprint") != "chrome"
            ) {
                throw ConfigVerificationException("CONFIG_UTLS_POLICY_REJECTED", "Invalid tls.utls configuration")
            }
        }

        if (tlsObj.has("reality")) {
            if (!hasUtls) {
                throw ConfigVerificationException("CONFIG_REALITY_REQUIRES_UTLS", "Reality requires uTLS enabled")
            }
            val realityObj = tlsObj.opt("reality") as? JSONObject
                ?: throw ConfigVerificationException("CONFIG_REALITY_INVALID", "tls.reality must be an object")
            if (realityObj.keys().asSequence().toSet() != setOf("enabled", "public_key", "short_id") ||
                !requireExactBooleanField(realityObj, "enabled")
            ) {
                throw ConfigVerificationException("CONFIG_REALITY_POLICY_REJECTED", "Invalid tls.reality fields")
            }
            val pubKey = requireExactStringField(realityObj, "public_key")
            val shortId = requireExactStringField(realityObj, "short_id")
            if (!Ed25519Crypto.isValidX25519RealityPublicKey(pubKey) || !REALITY_SHORT_ID_REGEX.matches(shortId)) {
                throw ConfigVerificationException("CONFIG_REALITY_KEY_INVALID", "Invalid Reality public_key or short_id")
            }
        }

        // 3. Validate route & optional dns
        val routeObj = cfg.opt("route") as? JSONObject
            ?: throw ConfigVerificationException("CONFIG_ROUTE_MISSING", "Missing route object")
        val routeAllowedKeys = setOf("final", "rules", "auto_detect_interface", "default_domain_resolver")
        if (!routeAllowedKeys.containsAll(routeObj.keys().asSequence().toSet())) {
            throw ConfigVerificationException("CONFIG_ROUTE_KEYS_INVALID", "Unexpected keys in route")
        }
        if (requireExactStringField(routeObj, "final") != REQUIRED_OUTBOUND_TAG) {
            throw ConfigVerificationException("CONFIG_ROUTE_FINAL_INVALID", "route.final must equal '$REQUIRED_OUTBOUND_TAG'")
        }
        if (routeObj.has("auto_detect_interface") && requireExactBooleanField(routeObj, "auto_detect_interface")) {
            throw ConfigVerificationException("CONFIG_ROUTE_AUTODETECT_REJECTED", "Base config must not set auto_detect_interface")
        }
        if (routeObj.has("default_domain_resolver") &&
            requireExactStringField(routeObj, "default_domain_resolver").isNotEmpty()
        ) {
            throw ConfigVerificationException("CONFIG_ROUTE_RESOLVER_REJECTED", "Base config must not set default_domain_resolver")
        }

        val bootstrapIps = validateOptionalDnsAndRoute(
            dnsObj = if (cfg.has("dns")) {
                cfg.opt("dns") as? JSONObject
                    ?: throw ConfigVerificationException("CONFIG_DNS_INVALID", "dns must be an object")
            } else {
                null
            },
            routeObj = routeObj,
            domainResolver = domainResolver,
            outboundServer = server,
        )

        val rawOutboundJson = StrictJsonValidator.extractFirstArrayElementRawObject(configText, "outbounds")

        return ParsedClosedPolicy(
            server = server,
            serverPort = serverPort,
            tlsServerName = serverName,
            bootstrapIps = bootstrapIps,
            rawDeviceOutboundJson = rawOutboundJson,
        )
    }

    private fun validateOptionalDnsAndRoute(
        dnsObj: JSONObject?,
        routeObj: JSONObject,
        domainResolver: String,
        outboundServer: String,
    ): List<String> {
        val rulesArray = if (routeObj.has("rules")) {
            routeObj.opt("rules") as? JSONArray
                ?: throw ConfigVerificationException("CONFIG_ROUTE_RULES_INVALID", "route.rules must be an array")
        } else {
            null
        }

        if (dnsObj == null) {
            if (domainResolver.isNotEmpty() || (rulesArray != null && rulesArray.length() > 0)) {
                throw ConfigVerificationException("CONFIG_DNS_ROUTE_MISMATCH", "Unexpected domain_resolver or route.rules without dns")
            }
            return emptyList()
        }

        val dnsKeys = dnsObj.keys().asSequence().toSet()
        if (!setOf("servers", "final", "rules").containsAll(dnsKeys) || !dnsObj.has("servers")) {
            throw ConfigVerificationException("CONFIG_DNS_KEYS_INVALID", "Unexpected keys in dns")
        }
        if (dnsObj.has("rules")) {
            val dnsRules = dnsObj.opt("rules") as? JSONArray
                ?: throw ConfigVerificationException("CONFIG_DNS_RULES_INVALID", "dns.rules must be an array")
            if (dnsRules.length() != 0) {
                throw ConfigVerificationException("CONFIG_DNS_RULES_FORBIDDEN", "Base config dns.rules must be empty")
            }
        }
        val servers = dnsObj.opt("servers") as? JSONArray
            ?: throw ConfigVerificationException("CONFIG_DNS_SERVERS_INVALID", "dns.servers must be an array")
        if (servers.length() != 2) {
            throw ConfigVerificationException("CONFIG_DNS_SERVERS_COUNT", "dns.servers must contain 2 entries")
        }

        var dohTag: String? = null
        var hostsTag: String? = null
        var resolvedBootstrapIps: List<String> = emptyList()

        for (i in 0 until servers.length()) {
            val srv = servers.opt(i) as? JSONObject
                ?: throw ConfigVerificationException("CONFIG_DNS_SERVER_INVALID", "dns.servers[$i] must be an object")
            when (requireExactStringField(srv, "type")) {
                "https" -> {
                    if (dohTag != null) throw ConfigVerificationException("CONFIG_DNS_DUPLICATE_DOH", "Duplicate DoH server")
                    if (srv.keys().asSequence().toSet() != setOf("tag", "type", "server", "server_port", "path", "detour")) {
                        throw ConfigVerificationException("CONFIG_DNS_DOH_KEYS", "Invalid DoH server keys")
                    }
                    val tag = requireExactStringField(srv, "tag")
                    if (tag.isEmpty() ||
                        requireExactStringField(srv, "server") != "cloudflare-dns.com" ||
                        requireExactIntField(srv, "server_port") != 443 ||
                        requireExactStringField(srv, "path") != "/dns-query" ||
                        requireExactStringField(srv, "detour") != REQUIRED_OUTBOUND_TAG
                    ) {
                        throw ConfigVerificationException("CONFIG_DNS_DOH_POLICY", "Invalid controlled DoH server")
                    }
                    dohTag = tag
                }
                "hosts" -> {
                    if (hostsTag != null) throw ConfigVerificationException("CONFIG_DNS_DUPLICATE_HOSTS", "Duplicate hosts server")
                    if (srv.keys().asSequence().toSet() != setOf("tag", "type", "predefined")) {
                        throw ConfigVerificationException("CONFIG_DNS_HOSTS_KEYS", "Invalid hosts server keys")
                    }
                    val tag = requireExactStringField(srv, "tag")
                    val predefined = srv.opt("predefined") as? JSONObject
                        ?: throw ConfigVerificationException("CONFIG_DNS_PREDEFINED_INVALID", "predefined must be an object")
                    if (tag.isEmpty() || predefined.keys().asSequence().toSet() != setOf(outboundServer)) {
                        throw ConfigVerificationException("CONFIG_DNS_PREDEFINED_HOST", "predefined must map outbound server only")
                    }
                    resolvedBootstrapIps = extractPredefinedIps(predefined.opt(outboundServer), outboundServer)
                    hostsTag = tag
                }
                else -> throw ConfigVerificationException("CONFIG_DNS_TYPE_FORBIDDEN", "Unsupported dns server type")
            }
        }

        if (dohTag == null || hostsTag == null || dohTag == hostsTag) {
            throw ConfigVerificationException("CONFIG_DNS_PAIR_INVALID", "dns.servers must pair DoH and hosts")
        }
        if (dnsObj.has("final")) {
            if (requireExactStringField(dnsObj, "final") != dohTag) {
                throw ConfigVerificationException("CONFIG_DNS_FINAL_INVALID", "dns.final must target DoH server")
            }
        } else {
            val firstSrv = servers.getJSONObject(0)
            if (requireExactStringField(firstSrv, "tag") != dohTag) {
                throw ConfigVerificationException("CONFIG_DNS_ORDER_INVALID", "First dns server must be DoH when final omitted")
            }
        }
        if (domainResolver != hostsTag) {
            throw ConfigVerificationException("CONFIG_OUTBOUND_RESOLVER_MISMATCH", "outbound domain_resolver must reference hosts tag")
        }

        if (rulesArray == null || rulesArray.length() !in 1..2) {
            throw ConfigVerificationException("CONFIG_ROUTE_RULES_COUNT", "Expected 1 or 2 controlled DNS route rules")
        }
        if (rulesArray.length() == 1) {
            assertHijackDnsRule(rulesArray.opt(0) as? JSONObject)
        } else {
            assertSniffRule(rulesArray.opt(0) as? JSONObject)
            assertHijackDnsRule(rulesArray.opt(1) as? JSONObject)
        }
        return resolvedBootstrapIps
    }

    private fun extractPredefinedIps(rawVal: Any?, outboundServer: String): List<String> {
        val ips = when (rawVal) {
            is String -> listOf(rawVal)
            is JSONArray -> {
                if (rawVal.length() !in 1..4) {
                    throw ConfigVerificationException("CONFIG_DNS_PREDEFINED_LEN", "predefined IP list length must be 1..4")
                }
                (0 until rawVal.length()).map { idx ->
                    rawVal.opt(idx) as? String
                        ?: throw ConfigVerificationException("CONFIG_DNS_PREDEFINED_ITEM", "predefined entry must be string")
                }
            }
            else -> throw ConfigVerificationException("CONFIG_DNS_PREDEFINED_TYPE", "Invalid predefined value type")
        }
        for (ip in ips) {
            if (!NetworkAddressPolicy.isPublicUnicastIp(ip)) {
                throw ConfigVerificationException("CONFIG_DNS_BOOTSTRAP_IP_INVALID", "Non-public bootstrap IP rejected: $ip")
            }
            if (NetworkAddressPolicy.isIpLiteral(outboundServer) && ip != outboundServer) {
                throw ConfigVerificationException("CONFIG_DNS_BOOTSTRAP_MISMATCH", "IP literal server must map to itself")
            }
        }
        return ips
    }

    private fun assertSniffRule(rule: JSONObject?) {
        if (rule == null || rule.keys().asSequence().toSet() != setOf("action") ||
            requireExactStringField(rule, "action") != "sniff"
        ) {
            throw ConfigVerificationException("CONFIG_ROUTE_SNIFF_INVALID", "Invalid sniff route rule")
        }
    }

    private fun assertHijackDnsRule(rule: JSONObject?) {
        if (rule == null || rule.keys().asSequence().toSet() != setOf("protocol", "action") ||
            requireExactStringField(rule, "protocol") != "dns" ||
            requireExactStringField(rule, "action") != "hijack-dns"
        ) {
            throw ConfigVerificationException("CONFIG_ROUTE_HIJACK_DNS_INVALID", "Invalid hijack-dns route rule")
        }
    }

    private fun parseStrictUtcMillis(value: String): Long {
        if (!UTC_MILLIS_TIMESTAMP_REGEX.matches(value)) {
            throw ConfigVerificationException("TIMESTAMP_FORMAT_INVALID", "Timestamp must be YYYY-MM-DDTHH:mm:ss.SSSZ")
        }
        val instant = try {
            Instant.parse(value)
        } catch (err: Exception) {
            throw ConfigVerificationException("TIMESTAMP_PARSE_INVALID", "Invalid calendar UTC timestamp", err)
        }
        // Reject rolled-over non-existent calendar dates such as Feb 30 if parser were lenient.
        if (UTC_MS_FORMATTER.format(instant) != value) {
            throw ConfigVerificationException("TIMESTAMP_CALENDAR_INVALID", "Non-canonical UTC calendar timestamp")
        }
        return instant.toEpochMilli()
    }

    private fun requireExactStringField(obj: JSONObject, key: String): String {
        val raw = obj.opt(key)
        if (raw !is String) {
            throw ConfigVerificationException("FIELD_TYPE_INVALID", "Field '$key' must be a JSON string")
        }
        return raw
    }

    private fun requireExactIntField(obj: JSONObject, key: String): Int {
        val raw = obj.opt(key)
        return when (raw) {
            is Int -> raw
            is Long -> {
                if (raw < Int.MIN_VALUE || raw > Int.MAX_VALUE) {
                    throw ConfigVerificationException("FIELD_INT_RANGE", "Field '$key' integer overflow")
                }
                raw.toInt()
            }
            else -> throw ConfigVerificationException("FIELD_TYPE_INVALID", "Field '$key' must be a JSON integer")
        }
    }

    private fun requireExactBooleanField(obj: JSONObject, key: String): Boolean {
        val raw = obj.opt(key)
        if (raw !is Boolean) {
            throw ConfigVerificationException("FIELD_TYPE_INVALID", "Field '$key' must be a JSON boolean")
        }
        return raw
    }
}

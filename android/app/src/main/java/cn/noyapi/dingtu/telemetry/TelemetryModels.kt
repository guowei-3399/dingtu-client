// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.telemetry

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.Locale
import java.util.UUID

/**
 * Allowed lifecycle/error stages per Master Contract v1.26 §20.2.
 */
enum class TelemetryStage(val wireValue: String) {
    PKCE_LOGIN("pkce_login"),
    SESSION_REFRESH("session_refresh"),
    TUNNEL_AUTHORIZE("tunnel_authorize"),
    TUNNEL_CONFIG_FETCH("tunnel_config_fetch"),
    CONFIG_VERIFY("config_verify"),
    CORE_START("core_start"),
    TUN_SETUP("tun_setup"),
    DNS_PROBE("dns_probe"),
    EXIT_PROBE("exit_probe"),
    LEASE_RENEW("lease_renew"),
    CORE_CRASH("core_crash"),
    WORKBENCH_LAUNCH("workbench_launch"),
    ACCOUNT_SWITCH("account_switch"),
    LOGOUT("logout"),
}

enum class TelemetryCategory(val wireValue: String) {
    TUNNEL("tunnel"),
    WORKBENCH("workbench"),
    ACCOUNT_SWITCH("account_switch"),
    AUTH("auth"),
    DIAGNOSTIC("diagnostic"),
}

enum class TelemetryEventStatus(val wireValue: String) {
    OK("ok"),
    WARN("warn"),
    ERROR("error"),
}

enum class TelemetrySeverity(val wireValue: String) {
    INFO("info"),
    WARN("warn"),
    ERROR("error"),
    FATAL("fatal"),
}

enum class LatencySampleTrigger(val wireValue: String) {
    CONNECT("connect"),
    PERIODIC("periodic"),
    SELF_CHECK("self_check"),
    ERROR_SLOW("error_slow"),
}

enum class LatencySampleStatus(val wireValue: String) {
    OK("ok"),
    DEGRADED("degraded"),
    TIMEOUT("timeout"),
    ERROR("error"),
}

data class TelemetryEventRecord(
    val eventId: String,
    val occurredAt: String,
    val category: TelemetryCategory,
    val action: String,
    val status: TelemetryEventStatus,
    val severity: TelemetrySeverity,
    val stage: TelemetryStage,
    val fingerprint: String,
    val errorCode: String? = null,
    val requestId: String? = null,
    val appId: String? = null,
    val durationMs: Int? = null,
    val httpStatus: Int? = null,
    val retryable: Boolean? = null,
    val environmentMode: String = DingtuConstants.DIAGNOSTIC_ENVIRONMENT_MODE,
    val platform: String = DingtuConstants.OAUTH_PLATFORM,
    val appVersion: String = DingtuConstants.APP_VERSION,
) {
    fun toJsonObject(): JSONObject {
        val obj = JSONObject()
            .put("eventId", eventId)
            .put("occurredAt", occurredAt)
            .put("category", category.wireValue)
            .put("action", action)
            .put("status", status.wireValue)
            .put("severity", severity.wireValue)
            .put("stage", stage.wireValue)
            .put("fingerprint", fingerprint)
            .put("platform", platform)
            .put("appVersion", appVersion)
            .put("environmentMode", environmentMode)
        if (errorCode != null) obj.put("errorCode", errorCode)
        if (requestId != null) obj.put("requestId", requestId)
        if (appId != null) obj.put("appId", appId)
        if (durationMs != null) obj.put("durationMs", durationMs)
        if (httpStatus != null) obj.put("httpStatus", httpStatus)
        if (retryable != null) obj.put("retryable", retryable)
        return obj
    }

    companion object {
        fun createSanitized(
            category: TelemetryCategory,
            stage: TelemetryStage,
            action: String,
            status: TelemetryEventStatus,
            severity: TelemetrySeverity,
            occurredAtMillis: Long,
            errorCode: String? = null,
            requestId: String? = null,
            appId: String? = null,
            durationMs: Long? = null,
            httpStatus: Int? = null,
            retryable: Boolean? = null,
            eventId: String = "evt_${UUID.randomUUID().toString().replace("-", "")}",
        ): TelemetryEventRecord {
            val safeEventId = TelemetryPrivacyGuard.sanitizeId(eventId, prefix = "evt_", maxLen = 128)
            val safeAction = TelemetryPrivacyGuard.sanitizeAction(action)
            val safeErrorCode = TelemetryPrivacyGuard.sanitizeErrorCode(errorCode)
            val safeRequestId = TelemetryPrivacyGuard.sanitizeRequestId(requestId)
            val safeAppId = TelemetryPrivacyGuard.sanitizeAppId(appId)
            val safeDuration = durationMs?.coerceIn(0L, MAX_DURATION_MS.toLong())?.toInt()
            val safeHttpStatus = httpStatus?.takeIf { it in 100..599 }
            val fingerprint = computeFingerprint(
                stage = stage,
                errorCode = safeErrorCode,
                httpStatus = safeHttpStatus,
                normalizedAction = safeAction,
            )
            return TelemetryEventRecord(
                eventId = safeEventId,
                occurredAt = Instant.ofEpochMilli(occurredAtMillis).toString(),
                category = category,
                action = safeAction,
                status = status,
                severity = severity,
                stage = stage,
                fingerprint = fingerprint,
                errorCode = safeErrorCode,
                requestId = safeRequestId,
                appId = safeAppId,
                durationMs = safeDuration,
                httpStatus = safeHttpStatus,
                retryable = retryable,
            )
        }

        fun computeFingerprint(
            stage: TelemetryStage,
            errorCode: String?,
            httpStatus: Int?,
            normalizedAction: String,
        ): String {
            val canonical = listOf(
                DingtuConstants.OAUTH_PLATFORM,
                stage.wireValue,
                errorCode ?: "NONE",
                httpStatus?.toString() ?: "0",
                normalizedAction.lowercase(Locale.ROOT),
            ).joinToString("|")
            return Ed25519Crypto.sha256HexUtf8(canonical)
        }

        const val MAX_DURATION_MS = 600_000
    }
}

data class LatencySampleRecord(
    val sampleId: String,
    val sampledAt: String,
    val trigger: LatencySampleTrigger,
    val status: LatencySampleStatus,
    val clientToOriginMs: Int? = null,
    val dnsMs: Int? = null,
    val e2eTtfbMs: Int? = null,
    val totalMs: Int? = null,
    val errorCode: String? = null,
    val requestId: String? = null,
    val platform: String = DingtuConstants.OAUTH_PLATFORM,
    val appVersion: String = DingtuConstants.APP_VERSION,
    val environmentMode: String = DingtuConstants.DIAGNOSTIC_ENVIRONMENT_MODE,
) {
    fun toJsonObject(): JSONObject {
        val obj = JSONObject()
            .put("sampleId", sampleId)
            .put("sampledAt", sampledAt)
            .put("trigger", trigger.wireValue)
            .put("status", status.wireValue)
            .put("platform", platform)
            .put("appVersion", appVersion)
            .put("environmentMode", environmentMode)
        if (clientToOriginMs != null) obj.put("clientToOriginMs", clientToOriginMs)
        if (dnsMs != null) obj.put("dnsMs", dnsMs)
        if (e2eTtfbMs != null) obj.put("e2eTtfbMs", e2eTtfbMs)
        if (totalMs != null) obj.put("totalMs", totalMs)
        if (errorCode != null) obj.put("errorCode", errorCode)
        if (requestId != null) obj.put("requestId", requestId)
        return obj
    }

    companion object {
        fun createSanitized(
            trigger: LatencySampleTrigger,
            status: LatencySampleStatus,
            sampledAtMillis: Long,
            clientToOriginMs: Long? = null,
            dnsMs: Long? = null,
            e2eTtfbMs: Long? = null,
            totalMs: Long? = null,
            errorCode: String? = null,
            requestId: String? = null,
            sampleId: String = "lat_${UUID.randomUUID().toString().replace("-", "")}",
        ): LatencySampleRecord {
            val safeId = TelemetryPrivacyGuard.sanitizeSampleId(sampleId)
            return LatencySampleRecord(
                sampleId = safeId,
                sampledAt = Instant.ofEpochMilli(sampledAtMillis).toString(),
                trigger = trigger,
                status = status,
                clientToOriginMs = clientToOriginMs?.coerceIn(0L, MAX_LATENCY_MS.toLong())?.toInt(),
                dnsMs = dnsMs?.coerceIn(0L, MAX_LATENCY_MS.toLong())?.toInt(),
                e2eTtfbMs = e2eTtfbMs?.coerceIn(0L, MAX_LATENCY_MS.toLong())?.toInt(),
                totalMs = totalMs?.coerceIn(0L, MAX_LATENCY_MS.toLong())?.toInt(),
                errorCode = TelemetryPrivacyGuard.sanitizeErrorCode(errorCode),
                requestId = TelemetryPrivacyGuard.sanitizeRequestId(requestId),
            )
        }

        const val MAX_LATENCY_MS = 600_000
    }
}

data class TelemetrySyncResult(
    val acceptedBuckets: Int,
    val acceptedEvents: Int,
    val acceptedLatencySamples: Int?,
    val syncedAt: String,
)

data class TelemetryHealthSummary(
    val queuedEvents: Int = 0,
    val queuedLatencySamples: Int = 0,
    val totalAcceptedEvents: Int = 0,
    val totalAcceptedLatencySamples: Int = 0,
    val lastSyncedAtUtc: String? = null,
    val lastFailureCode: String? = null,
)

/**
 * Mirrors server `telemetry-privacy.mjs` strictly on-device before any telemetry payload leaves Android.
 */
object TelemetryPrivacyGuard {
    private val ERROR_CODE_REGEX = Regex("""^[A-Z0-9_.-]{1,64}$""")
    private val REQUEST_ID_REGEX = Regex("""^[A-Za-z0-9_.-]{1,128}$""")
    private val SAMPLE_ID_REGEX = Regex("""^[A-Za-z0-9_.-]{8,64}$""")
    private val APP_ID_REGEX = Regex("""^[a-z0-9][a-z0-9._-]{0,63}$""")
    private val NON_ALNUM_REGEX = Regex("""[^a-z0-9]""")
    private val CTRL_OR_WS_REGEX = Regex("""[\s\u0000-\u001f\u007f]""")
    private val SECRET_VALUE_MARKERS = listOf(
        "nda_",
        "ndr_",
        "nac_",
        "vless://",
        "bearer ",
        "private_key",
        "-----begin ",
    )

    val FORBIDDEN_NORMALIZED_KEYS: Set<String> = setOf(
        "workspacepath",
        "workspacename",
        "title",
        "prompt",
        "prompts",
        "responsebody",
        "replybody",
        "codesnippet",
        "env",
        "envvars",
        "token",
        "accesstoken",
        "refreshtoken",
        "secret",
        "cookie",
        "cookies",
        "credential",
        "credentials",
        "password",
        "apikey",
        "authorization",
        "privatekey",
        "exitip",
        "upstream",
        "upstreamurl",
        "proxyurl",
        "proxypassword",
    )

    fun sanitizeId(raw: String, prefix: String, maxLen: Int): String {
        val cleaned = raw.trim().replace(CTRL_OR_WS_REGEX, "").take(maxLen)
        return if (cleaned.isNotEmpty()) cleaned else "${prefix}${UUID.randomUUID().toString().replace("-", "")}"
    }

    fun sanitizeSampleId(raw: String): String {
        val cleaned = raw.trim().replace(Regex("""[^A-Za-z0-9_.-]"""), "").take(64)
        return if (SAMPLE_ID_REGEX.matches(cleaned)) {
            cleaned
        } else {
            "lat_${UUID.randomUUID().toString().replace("-", "")}"
        }
    }

    fun sanitizeAction(raw: String): String {
        val cleaned = raw.trim()
            .replace(Regex("""[\u0000-\u001f\u007f]"""), "")
            .replace(Regex("""\s+"""), "_")
            .take(80)
        if (cleaned.isEmpty() || containsSecretMarker(cleaned)) {
            return "client_event"
        }
        return cleaned
    }

    fun sanitizeErrorCode(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val upper = raw.trim().uppercase(Locale.ROOT)
            .replace(Regex("""[^A-Z0-9_.-]"""), "_")
            .take(64)
        if (upper.isEmpty() || containsSecretMarker(upper)) return null
        return if (ERROR_CODE_REGEX.matches(upper)) upper else null
    }

    fun sanitizeRequestId(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val cleaned = raw.trim().take(128)
        if (containsSecretMarker(cleaned)) return null
        return if (REQUEST_ID_REGEX.matches(cleaned)) cleaned else null
    }

    fun sanitizeAppId(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val lowered = raw.trim().lowercase(Locale.ROOT)
        return if (APP_ID_REGEX.matches(lowered)) lowered else null
    }

    fun assertPayloadSafe(payload: JSONObject) {
        validateObjectRecursive(payload, depth = 0)
    }

    private fun validateObjectRecursive(obj: JSONObject, depth: Int) {
        require(depth <= 8) { "Telemetry payload exceeds max nesting depth" }
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val normalizedKey = key.lowercase(Locale.ROOT).replace(NON_ALNUM_REGEX, "")
            require(normalizedKey !in FORBIDDEN_NORMALIZED_KEYS) {
                "TELEMETRY_PRIVACY_VIOLATION: forbidden key '$key'"
            }
            val value = obj.opt(key)
            validateValueRecursive(value, depth + 1)
        }
    }

    private fun validateValueRecursive(value: Any?, depth: Int) {
        when (value) {
            is JSONObject -> validateObjectRecursive(value, depth)
            is JSONArray -> {
                for (i in 0 until value.length()) {
                    validateValueRecursive(value.opt(i), depth + 1)
                }
            }
            is String -> {
                require(!containsSecretMarker(value)) {
                    "TELEMETRY_PRIVACY_VIOLATION: disallowed secret token pattern in telemetry value"
                }
            }
        }
    }

    private fun containsSecretMarker(text: String): Boolean {
        val lower = text.lowercase(Locale.ROOT)
        return SECRET_VALUE_MARKERS.any { lower.contains(it) }
    }
}

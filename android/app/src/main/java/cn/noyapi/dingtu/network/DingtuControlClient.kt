// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.network

import cn.noyapi.dingtu.auth.PkceAuthException
import cn.noyapi.dingtu.auth.PkceAuthManager
import cn.noyapi.dingtu.config.DeviceProofSigner
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.DevicePublicJwk
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.json.StrictJsonValidator
import cn.noyapi.dingtu.storage.StoredDeviceSession
import cn.noyapi.dingtu.telemetry.LatencySampleRecord
import cn.noyapi.dingtu.telemetry.TelemetryEventRecord
import cn.noyapi.dingtu.telemetry.TelemetryPrivacyGuard
import cn.noyapi.dingtu.telemetry.TelemetrySyncResult
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Collections

data class TunnelAuthorizationGrant(
    val authorizationHandle: String,
    val expiresAt: String,
    val expiresAtMillis: Long,
) {
    override fun toString(): String = "TunnelAuthorizationGrant(expiresAt=$expiresAt)"
}

data class DiagnosticSnapshotPayload(
    val appVersion: String = DingtuConstants.APP_VERSION,
    val platform: String = DingtuConstants.OAUTH_PLATFORM,
    val environmentMode: String = DingtuConstants.DIAGNOSTIC_ENVIRONMENT_MODE,
    val proxyState: String,
    val recentErrorCodes: List<String> = emptyList(),
    val recentRequestIds: List<String> = emptyList(),
) {
    init {
        require(appVersion == DingtuConstants.APP_VERSION) { "Locked appVersion required" }
        require(platform == DingtuConstants.OAUTH_PLATFORM) { "Locked platform=android required" }
        require(environmentMode == DingtuConstants.DIAGNOSTIC_ENVIRONMENT_MODE) {
            "Locked environmentMode=tun required"
        }
        require(proxyState in ALLOWED_PROXY_STATES) { "Invalid proxyState: $proxyState" }
        require(recentErrorCodes.size <= 20 && recentErrorCodes.all { ERROR_CODE_REGEX.matches(it) }) {
            "Invalid recentErrorCodes in DiagnosticSnapshotPayload"
        }
        require(recentRequestIds.size <= 20 && recentRequestIds.all { REQUEST_ID_REGEX.matches(it) }) {
            "Invalid recentRequestIds in DiagnosticSnapshotPayload"
        }
    }

    fun toJsonObject(): JSONObject = JSONObject()
        .put("appVersion", appVersion)
        .put("platform", platform)
        .put("environmentMode", environmentMode)
        .put("proxyState", proxyState)
        .put("recentErrorCodes", JSONArray(recentErrorCodes))
        .put("recentRequestIds", JSONArray(recentRequestIds))

    companion object {
        private val ERROR_CODE_REGEX = Regex("""^[A-Z0-9_.-]{1,64}$""")
        private val REQUEST_ID_REGEX = Regex("""^[A-Za-z0-9_.-]{1,128}$""")
        private val ALLOWED_PROXY_STATES = setOf(
            "unknown", "stopped", "starting", "running", "degraded", "failed", "error"
        )

        fun fromRawDiagnostics(
            proxyState: String,
            rawErrorCodes: List<String>,
            rawRequestIds: List<String>,
        ): DiagnosticSnapshotPayload {
            val safeProxy = if (proxyState in ALLOWED_PROXY_STATES) proxyState else "unknown"
            val safeErrors = rawErrorCodes
                .map { it.trim() }
                .filter { ERROR_CODE_REGEX.matches(it) }
                .takeLast(20)
            val safeRequests = rawRequestIds
                .map { it.trim() }
                .filter { REQUEST_ID_REGEX.matches(it) }
                .takeLast(20)
            return DiagnosticSnapshotPayload(
                proxyState = safeProxy,
                recentErrorCodes = safeErrors,
                recentRequestIds = safeRequests,
            )
        }
    }
}

class DingtuControlClient(
    private val transport: HttpTransport = DefaultHttpsTransport(),
    private val controlOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    private val nowProvider: () -> Long = System::currentTimeMillis,
) {
    private val attemptedCodeDigests = Collections.synchronizedSet(HashSet<String>())
    private val uuidRegex =
        Regex("""^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$""", RegexOption.IGNORE_CASE)
    private val ticketIdRegex = Regex("""^tkt_[0-9a-f]{32}$""")

    init {
        require(controlOrigin == DingtuConstants.CONTROL_ORIGIN) {
            "DingtuControlClient must bind strictly to ${DingtuConstants.CONTROL_ORIGIN}"
        }
    }

    fun exchangeAuthorizationCode(
        authorizationCode: String,
        codeVerifier: String,
        redirectUri: String,
        deviceName: String,
        devicePublicKey: DevicePublicJwk,
    ): StoredDeviceSession {
        require(authorizationCode.length in 16..256) { "Invalid authorizationCode length" }
        require(codeVerifier.length in 43..128) { "Invalid codeVerifier length" }
        require(PkceAuthManager.isAllowedRedirectUri(redirectUri)) { "Invalid redirectUri" }
        val normalizedDeviceName = deviceName.trim().take(120)
        require(normalizedDeviceName.isNotEmpty()) { "deviceName must not be blank" }

        val codeDigest = Ed25519Crypto.sha256HexUtf8(authorizationCode)
        if (!attemptedCodeDigests.add(codeDigest)) {
            throw PkceAuthException(
                "PKCE_CODE_SINGLE_USE_GUARD",
                "Authorization code was already used in an exchange attempt; re-authorize instead of retrying",
            )
        }

        val bodyJson = JSONObject()
            .put("authorizationCode", authorizationCode)
            .put("codeVerifier", codeVerifier)
            .put("redirectUri", redirectUri)
            .put("deviceName", normalizedDeviceName)
            .put("platform", DingtuConstants.OAUTH_PLATFORM)
            .put("appVersion", DingtuConstants.APP_VERSION)
            .put("devicePublicKey", devicePublicKey.toJsonObject())

        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/device/sessions",
                headers = jsonHeaders(accessToken = null),
                bodyBytes = bodyJson.toString().toByteArray(StandardCharsets.UTF_8),
            )
        )
        if (response.statusCode != 201) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        return parseDeviceSessionResponse(response.bodyBytes)
    }

    fun refreshDeviceSession(deviceId: String, refreshToken: String): StoredDeviceSession {
        val normalizedDeviceId = normalizeUuid(deviceId)
        require(refreshToken.length >= 16) { "Invalid refreshToken" }

        val bodyJson = JSONObject().put("refreshToken", refreshToken)
        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/device/sessions/$normalizedDeviceId/refresh",
                headers = jsonHeaders(accessToken = null),
                bodyBytes = bodyJson.toString().toByteArray(StandardCharsets.UTF_8),
            )
        )
        if (response.statusCode != 200) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        return parseDeviceSessionResponse(response.bodyBytes)
    }

    fun revokeDeviceSession(deviceId: String, accessToken: String) {
        val normalizedDeviceId = normalizeUuid(deviceId)
        val response = transport.execute(
            HttpRequestSpec(
                method = "DELETE",
                url = "$controlOrigin/api/v1/client/device/sessions/$normalizedDeviceId",
                headers = baseHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = null,
            )
        )
        if (response.statusCode != 204) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
    }

    fun issueTunnelAuthorization(accessToken: String): TunnelAuthorizationGrant {
        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/tunnel/authorizations",
                headers = jsonHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = "{}".toByteArray(StandardCharsets.UTF_8),
            )
        )
        if (response.statusCode != 201) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        val text = String(response.bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 4, rejectCaseCollisions = true)
        val root = JSONObject(text)
        if (root.keys().asSequence().toSet() != setOf("authorizationHandle", "expiresAt")) {
            throw DingtuApiException(
                201,
                "AUTHORIZATION_RESPONSE_INVALID",
                "Unexpected fields in tunnel authorization response",
                response.headerValue("X-Request-Id"),
            )
        }
        val handle = root.optString("authorizationHandle", "")
        val expiresAt = root.optString("expiresAt", "")
        if (!DeviceProofSigner.isValidAuthorizationHandle(handle)) {
            throw DingtuApiException(
                201,
                "AUTHORIZATION_HANDLE_INVALID",
                "Malformed authorizationHandle returned by server",
                response.headerValue("X-Request-Id"),
            )
        }
        val expiresMillis = try {
            Instant.parse(expiresAt).toEpochMilli()
        } catch (err: Exception) {
            throw DingtuApiException(
                201,
                "AUTHORIZATION_EXPIRY_INVALID",
                "Invalid expiresAt timestamp in tunnel authorization response",
                response.headerValue("X-Request-Id"),
                err,
            )
        }
        return TunnelAuthorizationGrant(
            authorizationHandle = handle,
            expiresAt = expiresAt,
            expiresAtMillis = expiresMillis,
        )
    }

    // Account, Entitlement, Devices, Usage, and Ticket Endpoints:

    fun getMe(accessToken: String): JSONObject =
        executeAuthenticatedGet("/api/v1/me", accessToken)

    fun getTenantEntitlement(accessToken: String): JSONObject =
        executeAuthenticatedGet("/api/v1/tenants/me", accessToken)

    fun getAssistantOverview(accessToken: String): JSONObject =
        executeAuthenticatedGet("/api/v1/assistant/overview", accessToken)

    fun getTunnelStatus(accessToken: String): JSONObject =
        executeAuthenticatedGet("/api/v1/client/tunnel/status", accessToken)

    fun getClientDevices(accessToken: String): JSONObject =
        executeAuthenticatedGet("/api/v1/client/devices", accessToken)

    fun getUsageSummary(accessToken: String, days: Int = 30): JSONObject {
        require(days in 1..90) { "days must be between 1 and 90" }
        return executeAuthenticatedGet("/api/v1/tenants/me/usage-summary?days=$days", accessToken)
    }

    fun getActivityLogs(
        accessToken: String,
        limit: Int = 50,
        cursor: String? = null,
    ): JSONObject {
        require(limit in 1..100) { "limit must be between 1 and 100" }
        val query = buildString {
            append("limit=").append(limit)
            if (!cursor.isNullOrBlank()) {
                append("&cursor=").append(URLEncoder.encode(cursor, StandardCharsets.UTF_8.name()))
            }
        }
        return executeAuthenticatedGet("/api/v1/tenants/me/activity-logs?$query", accessToken)
    }

    fun getTickets(
        accessToken: String,
        status: String? = null,
        limit: Int = 50,
    ): JSONObject {
        require(limit in 1..100) { "limit must be between 1 and 100" }
        val query = buildString {
            append("limit=").append(limit)
            if (!status.isNullOrBlank()) {
                require(status in ALLOWED_TICKET_STATUSES) { "Invalid ticket status filter" }
                append("&status=").append(URLEncoder.encode(status, StandardCharsets.UTF_8.name()))
            }
        }
        return executeAuthenticatedGet("/api/v1/client/tickets?$query", accessToken)
    }

    fun getTicketDetail(accessToken: String, ticketId: String): JSONObject {
        require(ticketIdRegex.matches(ticketId)) { "Invalid ticketId format" }
        return executeAuthenticatedGet("/api/v1/client/tickets/$ticketId", accessToken)
    }

    fun createTicket(
        accessToken: String,
        subject: String,
        category: String,
        body: String,
        diagnosticSnapshot: DiagnosticSnapshotPayload? = null,
    ): JSONObject {
        val cleanSubject = subject.trim().replace(Regex("[\\u0000-\\u001f\\u007f]"), "")
        val cleanBody = body.trim()
        require(cleanSubject.length in 1..160) { "工单标题长度须在 1 至 160 字符之间" }
        require(category in ALLOWED_TICKET_CATEGORIES) { "不支持的工单分类" }
        require(cleanBody.length in 1..8000) { "工单描述长度须在 1 至 8000 字符之间" }

        val reqJson = JSONObject()
            .put("subject", cleanSubject)
            .put("category", category)
            .put("body", cleanBody)
        if (diagnosticSnapshot != null) {
            reqJson.put("diagnosticSnapshot", diagnosticSnapshot.toJsonObject())
        }

        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/tickets",
                headers = jsonHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = reqJson.toString().toByteArray(StandardCharsets.UTF_8),
            )
        )
        if (response.statusCode != 201) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        val text = String(response.bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 10)
        return JSONObject(text)
    }

    fun postTicketMessage(
        accessToken: String,
        ticketId: String,
        body: String? = null,
        action: String = "reply",
    ): JSONObject {
        require(ticketIdRegex.matches(ticketId)) { "Invalid ticketId format" }
        require(action in ALLOWED_TICKET_ACTIONS) { "Unsupported ticket action: $action" }

        val cleanBody = body?.trim()?.takeIf { it.isNotEmpty() }
        if (action == "reply") {
            require(cleanBody != null && cleanBody.length in 1..8000) {
                "回复内容不能为空且不得超过 8000 字符"
            }
        } else if (cleanBody != null) {
            require(cleanBody.length <= 8000) { "附言不得超过 8000 字符" }
        }

        val reqJson = JSONObject().put("action", action)
        if (cleanBody != null) {
            reqJson.put("body", cleanBody)
        }

        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/tickets/$ticketId/messages",
                headers = jsonHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = reqJson.toString().toByteArray(StandardCharsets.UTF_8),
            )
        )
        if (response.statusCode != 200) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        val text = String(response.bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 10)
        return JSONObject(text)
    }

    /**
     * Wave 4 (Master Contract v1.26 §16 + §20.2) client telemetry upload.
     * Supports both 3-key (`acceptedBuckets`, `acceptedEvents`, `syncedAt`) and
     * 4-key (`+ acceptedLatencySamples`) responses cleanly.
     */
    fun syncTelemetry(
        accessToken: String,
        reportedAtUtc: String,
        events: List<TelemetryEventRecord>,
        latencySamples: List<LatencySampleRecord> = emptyList(),
    ): TelemetrySyncResult {
        require(events.size <= 100) { "Telemetry events batch exceeds 100" }
        require(latencySamples.size <= 60) { "Telemetry latencySamples batch exceeds 60" }
        Instant.parse(reportedAtUtc)

        val eventsArr = JSONArray()
        events.forEach { eventsArr.put(it.toJsonObject()) }

        val reqJson = JSONObject()
            .put("reportedAt", reportedAtUtc)
            .put("usageBuckets", JSONArray())
            .put("events", eventsArr)

        if (latencySamples.isNotEmpty()) {
            val samplesArr = JSONArray()
            latencySamples.forEach { samplesArr.put(it.toJsonObject()) }
            reqJson.put("latencySamples", samplesArr)
        }

        TelemetryPrivacyGuard.assertPayloadSafe(reqJson)
        val bodyBytes = reqJson.toString().toByteArray(StandardCharsets.UTF_8)
        require(bodyBytes.size <= MAX_TELEMETRY_BODY_BYTES) {
            "Telemetry payload exceeds 256 KiB limit"
        }

        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$controlOrigin/api/v1/client/telemetry/sync",
                headers = jsonHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = bodyBytes,
            )
        )
        if (response.statusCode != 200) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        val text = String(response.bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 4, rejectCaseCollisions = true)
        val root = JSONObject(text)
        val keys = root.keys().asSequence().toSet()
        val allowed3Keys = setOf("acceptedBuckets", "acceptedEvents", "syncedAt")
        val allowed4Keys = setOf("acceptedBuckets", "acceptedEvents", "acceptedLatencySamples", "syncedAt")
        if (keys != allowed3Keys && keys != allowed4Keys) {
            throw DingtuApiException(
                200,
                "TELEMETRY_RESPONSE_INVALID",
                "Unexpected fields in telemetry sync response",
                response.headerValue("X-Request-Id"),
            )
        }
        val acceptedBuckets = root.optInt("acceptedBuckets", -1)
        val acceptedEvents = root.optInt("acceptedEvents", -1)
        val acceptedLatency = if (root.has("acceptedLatencySamples") && !root.isNull("acceptedLatencySamples")) {
            root.optInt("acceptedLatencySamples", -1).also {
                if (it < 0) {
                    throw DingtuApiException(
                        200,
                        "TELEMETRY_RESPONSE_INVALID",
                        "Invalid acceptedLatencySamples in telemetry sync response",
                        response.headerValue("X-Request-Id"),
                    )
                }
            }
        } else {
            null
        }
        val syncedAt = root.optString("syncedAt", "")
        if (acceptedBuckets < 0 || acceptedEvents < 0 || syncedAt.isBlank()) {
            throw DingtuApiException(
                200,
                "TELEMETRY_RESPONSE_INVALID",
                "Malformed telemetry sync counts or timestamp",
                response.headerValue("X-Request-Id"),
            )
        }
        Instant.parse(syncedAt)
        return TelemetrySyncResult(
            acceptedBuckets = acceptedBuckets,
            acceptedEvents = acceptedEvents,
            acceptedLatencySamples = acceptedLatency,
            syncedAt = syncedAt,
        )
    }

    private fun executeAuthenticatedGet(pathWithOptionalQuery: String, accessToken: String): JSONObject {
        require(pathWithOptionalQuery.startsWith("/api/v1/")) { "Unexpected API path: $pathWithOptionalQuery" }
        val response = transport.execute(
            HttpRequestSpec(
                method = "GET",
                url = "$controlOrigin$pathWithOptionalQuery",
                headers = baseHeaders(accessToken = requireAccessToken(accessToken)),
                bodyBytes = null,
            )
        )
        if (response.statusCode != 200) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }
        val text = String(response.bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 10)
        return JSONObject(text)
    }

    private fun parseDeviceSessionResponse(bodyBytes: ByteArray): StoredDeviceSession {
        val text = String(bodyBytes, StandardCharsets.UTF_8)
        StrictJsonValidator.assertStrictJson(text, maxDepth = 6)
        val root = JSONObject(text)
        val deviceObj = root.optJSONObject("device")
            ?: throw DingtuApiException(200, "SESSION_SCHEMA_INVALID", "Missing device object in session response")
        val sessionObj = root.optJSONObject("session")
            ?: throw DingtuApiException(200, "SESSION_SCHEMA_INVALID", "Missing session object in session response")

        val deviceId = normalizeUuid(deviceObj.optString("id", ""))
        val platform = deviceObj.optString("platform", "")
        val appVersion = deviceObj.optString("appVersion", "")
        val status = deviceObj.optString("status", "")
        val createdAt = deviceObj.optString("createdAt", "")

        val accessToken = requireAccessToken(sessionObj.optString("accessToken", ""))
        val expiresInSec = sessionObj.optLong("expiresIn", -1L)
        val refreshToken = sessionObj.optString("refreshToken", "")
        val refreshExpiresAt = sessionObj.optString("refreshExpiresAt", "")
        val scopeArr = sessionObj.optJSONArray("scope")

        if (expiresInSec <= 0L || refreshToken.length < 16 || refreshExpiresAt.isBlank() || scopeArr == null) {
            throw DingtuApiException(200, "SESSION_SCHEMA_INVALID", "Incomplete session credentials in response")
        }
        Instant.parse(createdAt)
        Instant.parse(refreshExpiresAt)

        val scopes = (0 until scopeArr.length()).map { idx ->
            scopeArr.optString(idx, "").also { s ->
                if (s.isBlank()) throw DingtuApiException(200, "SESSION_SCHEMA_INVALID", "Blank scope entry")
            }
        }

        val accessExpiresAtMillis = nowProvider() + (expiresInSec * 1_000L)

        return StoredDeviceSession(
            deviceId = deviceId,
            platform = platform,
            appVersion = appVersion,
            status = status,
            createdAt = createdAt,
            accessToken = accessToken,
            accessExpiresAtMillis = accessExpiresAtMillis,
            refreshToken = refreshToken,
            refreshExpiresAt = refreshExpiresAt,
            scopes = scopes,
        )
    }

    private fun baseHeaders(accessToken: String?): Map<String, String> {
        val map = LinkedHashMap<String, String>()
        map["Accept"] = "application/json"
        map[DingtuConstants.HEADER_CLIENT_NAME] = DingtuConstants.HEADER_CLIENT_VALUE
        map[DingtuConstants.HEADER_SCHEMA_NAME] = DingtuConstants.HEADER_SCHEMA_VALUE
        map["X-Requested-With"] = "Dingtu-Portal"
        map["Cache-Control"] = "no-store"
        if (accessToken != null) {
            map["Authorization"] = "Bearer $accessToken"
        }
        return map
    }

    private fun jsonHeaders(accessToken: String?): Map<String, String> {
        val map = LinkedHashMap(baseHeaders(accessToken))
        map["Content-Type"] = "application/json"
        return map
    }

    private fun normalizeUuid(raw: String): String {
        if (!uuidRegex.matches(raw)) {
            throw DingtuApiException(400, "DEVICE_ID_INVALID", "Invalid device UUID format")
        }
        return raw.lowercase()
    }

    private fun requireAccessToken(token: String): String {
        val trimmed = token.trim()
        if (trimmed.length < 16 || trimmed.any { it.isWhitespace() }) {
            throw DingtuApiException(401, "SESSION_INVALID", "Missing or malformed device access token")
        }
        return trimmed
    }

    companion object {
        const val MAX_TELEMETRY_BODY_BYTES = 256 * 1024
        val ALLOWED_TICKET_CATEGORIES = setOf(
            "connection", "exit_ip", "workbench_app", "account_billing", "other"
        )
        val ALLOWED_TICKET_STATUSES = setOf(
            "submitted", "acknowledged", "investigating", "waiting_user",
            "awaiting_ops", "awaiting_production", "resolved", "closed", "reopened",
        )
        val ALLOWED_TICKET_ACTIONS = setOf("reply", "reopen", "close")
    }
}

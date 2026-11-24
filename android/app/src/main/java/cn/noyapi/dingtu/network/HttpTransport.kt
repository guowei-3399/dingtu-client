// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.network

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.RedactedLogger
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.net.ssl.HttpsURLConnection

class DingtuApiException(
    val statusCode: Int,
    val errorCode: String,
    override val message: String,
    val requestId: String? = null,
    cause: Throwable? = null,
) : RuntimeException(RedactedLogger.redact(message), cause)

data class HttpRequestSpec(
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val bodyBytes: ByteArray? = null,
) {
    init {
        require(headers.keys.none { it.equals("Cookie", ignoreCase = true) }) {
            "Cookie header is strictly forbidden on Dingtu client API requests"
        }
    }
}

data class HttpResponseData(
    val statusCode: Int,
    val headers: Map<String, List<String>>,
    val bodyBytes: ByteArray,
) {
    fun headerValue(name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
            ?.value?.firstOrNull()
}

fun interface HttpTransport {
    fun execute(request: HttpRequestSpec): HttpResponseData
}

class DefaultHttpsTransport(
    private val pinnedOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
    private val maxResponseBytes: Int = 256 * 1024,
) : HttpTransport {

    override fun execute(request: HttpRequestSpec): HttpResponseData {
        assertPinnedHttpsOrigin(request.url)

        val conn = (URL(request.url).openConnection() as? HttpsURLConnection)
            ?: throw DingtuApiException(0, "HTTPS_REQUIRED", "Only HTTPS connections are permitted")
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.connectTimeout = connectTimeoutMs
        conn.readTimeout = readTimeoutMs
        conn.requestMethod = request.method

        for ((name, value) in request.headers) {
            if (name.equals("Cookie", ignoreCase = true)) {
                throw DingtuApiException(0, "COOKIE_FORBIDDEN", "Cookie header forbidden")
            }
            conn.setRequestProperty(name, value)
        }

        try {
            val payload = request.bodyBytes
            if (payload != null) {
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(payload.size)
                conn.outputStream.use { out ->
                    out.write(payload)
                    out.flush()
                }
            }

            val code = conn.responseCode
            val responseHeaders = conn.headerFields
                .filterKeys { it != null }
                .mapKeys { it.key!! }
            val requestId = responseHeaders.entries
                .firstOrNull { it.key.equals("X-Request-Id", ignoreCase = true) }
                ?.value?.firstOrNull()

            if (code in 300..399) {
                throw DingtuApiException(
                    statusCode = code,
                    errorCode = "REDIRECT_FORBIDDEN",
                    message = "HTTP redirect ($code) refused by fail-closed transport",
                    requestId = requestId,
                )
            }

            val stream: InputStream? = if (code in 200..299) conn.inputStream else conn.errorStream
            val bodyBytes = stream?.use { readBoundedBytes(it, maxResponseBytes) } ?: ByteArray(0)

            return HttpResponseData(
                statusCode = code,
                headers = responseHeaders,
                bodyBytes = bodyBytes,
            )
        } finally {
            conn.disconnect()
        }
    }

    private fun assertPinnedHttpsOrigin(rawUrl: String) {
        val uri = try {
            URI(rawUrl)
        } catch (err: Exception) {
            throw DingtuApiException(0, "URL_INVALID", "Invalid request URL", cause = err)
        }
        if (uri.scheme != "https" || uri.rawUserInfo != null || uri.rawFragment != null) {
            throw DingtuApiException(0, "ORIGIN_UNTRUSTED", "Request URL violates HTTPS origin security")
        }
        val portSuffix = if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
        val actualOrigin = "https://${uri.host?.lowercase() ?: ""}$portSuffix"
        if (actualOrigin != pinnedOrigin) {
            throw DingtuApiException(0, "ORIGIN_UNTRUSTED", "Refusing request to unpinned origin: $actualOrigin")
        }
    }

    private fun readBoundedBytes(input: InputStream, maxBytes: Int): ByteArray {
        val buffer = ByteArray(8 * 1024)
        val out = ByteArrayOutputStream()
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > maxBytes) {
                throw DingtuApiException(0, "RESPONSE_TOO_LARGE", "Response body exceeded $maxBytes bytes")
            }
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    companion object {
        fun parseApiErrorAndThrow(response: HttpResponseData): Nothing {
            val headerRequestId = response.headerValue("X-Request-Id")
            val text = String(response.bodyBytes, StandardCharsets.UTF_8)
            var code = "HTTP_${response.statusCode}"
            var message = "请求失败（HTTP ${response.statusCode}）"
            var bodyRequestId: String? = null

            runCatching {
                val json = JSONObject(text)
                val errObj = json.optJSONObject("error")
                if (errObj != null) {
                    code = errObj.optString("code", code).ifBlank { code }
                    message = errObj.optString("message", message).ifBlank { message }
                    bodyRequestId = errObj.optString("request_id", "").takeIf { it.isNotBlank() }
                }
            }

            throw DingtuApiException(
                statusCode = response.statusCode,
                errorCode = code,
                message = RedactedLogger.redact(message),
                requestId = bodyRequestId ?: headerRequestId,
            )
        }
    }
}

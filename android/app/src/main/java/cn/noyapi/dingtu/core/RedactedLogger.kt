// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.core

import android.util.Log

object RedactedLogger {
    private const val DEFAULT_TAG = "Dingtu"

    private val OPAQUE_TOKEN_REGEX =
        Regex("""\b(?:nda|ndr|nac|pah|dts)_[A-Za-z0-9_-]{8,}\b""")
    private val BEARER_HEADER_REGEX =
        Regex("""(?i)(Authorization\s*[:=]\s*Bearer\s+)[^\s"',}]+""")
    private val COOKIE_HEADER_REGEX =
        Regex("""(?i)(Cookie\s*[:=]\s*)[^\r\n"']+""")
    private val SENSITIVE_JSON_FIELD_REGEX = Regex(
        """("(?i:accessToken|refreshToken|authorizationCode|authorizationHandle|deviceProof|codeVerifier|privateKey|seed|uuid|public_key|short_id|password|secret|x|d)"\s*:\s*)"(?:\\.|[^"\\])*""""
    )
    private val QUERY_SECRET_REGEX = Regex(
        """(?i)([?&](?:code|code_verifier|access_token|refresh_token|token)=)[^&#\s"']+"""
    )
    private val EMAIL_REGEX = Regex(
        """\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"""
    )

    fun redact(raw: String?): String {
        if (raw.isNullOrEmpty()) return ""
        var sanitized = raw
        sanitized = OPAQUE_TOKEN_REGEX.replace(sanitized, "[REDACTED_TOKEN]")
        sanitized = BEARER_HEADER_REGEX.replace(sanitized, "$1[REDACTED_BEARER]")
        sanitized = COOKIE_HEADER_REGEX.replace(sanitized, "$1[REDACTED_COOKIE]")
        sanitized = SENSITIVE_JSON_FIELD_REGEX.replace(sanitized, "$1\"[REDACTED]\"")
        sanitized = QUERY_SECRET_REGEX.replace(sanitized, "$1[REDACTED]")
        sanitized = EMAIL_REGEX.replace(sanitized, "$1***@$2")
        return sanitized
    }

    fun info(message: String, tag: String = DEFAULT_TAG) {
        val safeMessage = redact(message)
        runCatching { Log.i(tag, safeMessage) }
    }

    fun warn(message: String, tag: String = DEFAULT_TAG) {
        val safeMessage = redact(message)
        runCatching { Log.w(tag, safeMessage) }
    }

    fun error(message: String, throwable: Throwable? = null, tag: String = DEFAULT_TAG) {
        val safeMessage = buildString {
            append(redact(message))
            if (throwable != null) {
                append(" | cause=")
                append(throwable::class.java.simpleName)
                val errMsg = redact(throwable.message)
                if (errMsg.isNotEmpty()) {
                    append(": ")
                    append(errMsg)
                }
            }
        }
        runCatching { Log.e(tag, safeMessage) }
    }
}

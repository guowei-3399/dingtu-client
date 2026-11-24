// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.SecureRandom

class PkceAuthException(
    val errorCode: String,
    message: String,
    cause: Throwable? = null,
) : IllegalArgumentException(message, cause)

data class PkceAuthorizationRequest(
    val authorizeUrl: String,
    val redirectUri: String,
    val codeVerifier: String,
    val codeChallenge: String,
    val state: String,
) {
    override fun toString(): String =
        "PkceAuthorizationRequest(redirectUri=$redirectUri, codeChallenge=$codeChallenge)"
}

data class VerifiedPkceCallback(
    val authorizationCode: String,
    val redirectUri: String,
) {
    override fun toString(): String = "VerifiedPkceCallback(redirectUri=$redirectUri)"
}

object PkceAuthManager {
    private const val VERIFIER_RANDOM_BYTES = 64
    private const val STATE_RANDOM_BYTES = 32
    private val LOOPBACK_REDIRECT_REGEX =
        Regex("""^http://127\.0\.0\.1:([1-9][0-9]{3,4})/callback$""")
    private val FORBIDDEN_LOCAL_PORTS = setOf(7890, 7899, 17899)
    private val secureRandom = SecureRandom()

    fun createAuthorizationRequest(
        redirectUri: String = DingtuConstants.OAUTH_DEEP_LINK_REDIRECT_URI,
        controlOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    ): PkceAuthorizationRequest {
        if (!isAllowedRedirectUri(redirectUri)) {
            throw PkceAuthException("PKCE_INVALID_REDIRECT_URI", "Unsupported PKCE redirect URI: $redirectUri")
        }
        if (controlOrigin != DingtuConstants.CONTROL_ORIGIN) {
            throw PkceAuthException("PKCE_INVALID_ORIGIN", "Control origin must match pinned origin")
        }

        val verifierBytes = ByteArray(VERIFIER_RANDOM_BYTES).also(secureRandom::nextBytes)
        val stateBytes = ByteArray(STATE_RANDOM_BYTES).also(secureRandom::nextBytes)
        val codeVerifier = Ed25519Crypto.encodeBase64UrlNoPadding(verifierBytes)
        verifierBytes.fill(0)
        val codeChallenge = Ed25519Crypto.sha256Base64UrlUtf8(codeVerifier)
        val state = Ed25519Crypto.encodeBase64UrlNoPadding(stateBytes)
        stateBytes.fill(0)

        val query = listOf(
            "client_id" to DingtuConstants.OAUTH_CLIENT_ID,
            "response_type" to "code",
            "redirect_uri" to redirectUri,
            "code_challenge" to codeChallenge,
            "code_challenge_method" to "S256",
            "state" to state,
            "platform" to DingtuConstants.OAUTH_PLATFORM,
        ).joinToString("&") { (k, v) ->
            "${urlEncode(k)}=${urlEncode(v)}"
        }

        return PkceAuthorizationRequest(
            authorizeUrl = "$controlOrigin/api/v1/client/authorize?$query",
            redirectUri = redirectUri,
            codeVerifier = codeVerifier,
            codeChallenge = codeChallenge,
            state = state,
        )
    }

    fun isAllowedRedirectUri(redirectUri: String): Boolean {
        if (redirectUri == DingtuConstants.OAUTH_DEEP_LINK_REDIRECT_URI) {
            return true
        }
        val match = LOOPBACK_REDIRECT_REGEX.matchEntire(redirectUri) ?: return false
        val port = match.groupValues[1].toIntOrNull() ?: return false
        return port in 1024..65535 && port !in FORBIDDEN_LOCAL_PORTS
    }

    fun validateCallbackUri(
        rawCallbackUri: String,
        expectedRequest: PkceAuthorizationRequest,
    ): VerifiedPkceCallback {
        val parsed = try {
            URI(rawCallbackUri)
        } catch (err: Exception) {
            throw PkceAuthException("PKCE_CALLBACK_MALFORMED", "Malformed PKCE callback URI", err)
        }
        if (parsed.rawFragment != null || parsed.rawUserInfo != null) {
            throw PkceAuthException("PKCE_CALLBACK_FRAGMENT_FORBIDDEN", "Callback URI must not carry fragment or credentials")
        }

        val expectedParsed = URI(expectedRequest.redirectUri)
        if (!parsed.scheme.equals(expectedParsed.scheme, ignoreCase = false) ||
            !parsed.host.equals(expectedParsed.host, ignoreCase = false) ||
            parsed.port != expectedParsed.port ||
            parsed.rawPath != expectedParsed.rawPath
        ) {
            throw PkceAuthException("PKCE_CALLBACK_REDIRECT_MISMATCH", "Callback URI base does not match expected redirect URI")
        }

        val rawQuery = parsed.rawQuery
            ?: throw PkceAuthException("PKCE_CALLBACK_EMPTY_QUERY", "Missing query parameters on PKCE callback")
        val params = parseStrictSingleValueQuery(rawQuery)

        val returnedState = params["state"]
            ?: throw PkceAuthException("PKCE_STATE_MISSING", "Missing state parameter on PKCE callback")
        if (!Ed25519Crypto.constantTimeEquals(returnedState, expectedRequest.state)) {
            throw PkceAuthException("PKCE_STATE_MISMATCH", "PKCE callback state mismatch")
        }

        val code = params["code"]
        val error = params["error"]
        if (code != null && error != null) {
            throw PkceAuthException("PKCE_AMBIGUOUS_CALLBACK", "Callback contains both code and error parameters")
        }
        if (error != null) {
            val safeError = error.replace(Regex("[^A-Za-z0-9_.-]"), "_").take(64)
            throw PkceAuthException("OAUTH_${safeError.uppercase()}", "Authorization denied or failed: $safeError")
        }
        if (code.isNullOrBlank() || code.length < 16 || code.length > 256 || code.any { it.isWhitespace() }) {
            throw PkceAuthException("PKCE_CODE_INVALID", "Missing or invalid authorization code")
        }

        return VerifiedPkceCallback(
            authorizationCode = code,
            redirectUri = expectedRequest.redirectUri,
        )
    }

    private fun parseStrictSingleValueQuery(rawQuery: String): Map<String, String> {
        if (rawQuery.isEmpty()) return emptyMap()
        val result = LinkedHashMap<String, String>()
        for (pair in rawQuery.split('&')) {
            if (pair.isEmpty()) {
                throw PkceAuthException("PKCE_QUERY_MALFORMED", "Empty query segment in PKCE callback")
            }
            val eqIndex = pair.indexOf('=')
            if (eqIndex <= 0) {
                throw PkceAuthException("PKCE_QUERY_MALFORMED", "Malformed query parameter in PKCE callback")
            }
            val rawName = pair.substring(0, eqIndex)
            val rawValue = pair.substring(eqIndex + 1)
            val name = urlDecodeStrict(rawName)
            val value = urlDecodeStrict(rawValue)
            if (result.containsKey(name)) {
                throw PkceAuthException("PKCE_DUPLICATE_PARAM", "Duplicate query parameter '$name' in PKCE callback")
            }
            result[name] = value
        }
        return result
    }

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

    private fun urlDecodeStrict(value: String): String {
        // Do not convert '+' cleanly if malformed percent sequence exists; URLDecoder validates hex pairs.
        return try {
            URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name())
        } catch (err: IllegalArgumentException) {
            throw PkceAuthException("PKCE_QUERY_ENCODING_INVALID", "Invalid percent-encoding in PKCE callback", err)
        }
    }
}

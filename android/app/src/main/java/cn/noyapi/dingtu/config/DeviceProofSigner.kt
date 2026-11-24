// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import java.nio.charset.StandardCharsets

data class SignedConfigFetchPayload(
    val authorizationHandle: String,
    val issuedAt: String,
    val deviceProof: String,
) {
    override fun toString(): String = "SignedConfigFetchPayload(issuedAt=$issuedAt)"
}

object DeviceProofSigner {
    private const val DOMAIN_PREFIX = "dingtu-tunnel-config-v1"
    private const val TARGET_PATH = "/api/v1/client/tunnel/config"
    private val AUTHORIZATION_HANDLE_REGEX = Regex("""^pah_[A-Za-z0-9_-]{43}$""")
    private val ISSUED_AT_MS_REGEX = Regex("""^[1-9][0-9]{12}$""")

    fun isValidAuthorizationHandle(handle: String): Boolean {
        if (!AUTHORIZATION_HANDLE_REGEX.matches(handle)) return false
        val encodedPart = handle.removePrefix("pah_")
        return Ed25519Crypto.isUnpaddedBase64UrlOfByteSize(encodedPart, 32)
    }

    fun buildSigningInput(
        authorizationHandle: String,
        issuedAtMillisText: String,
        productionOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    ): String {
        require(isValidAuthorizationHandle(authorizationHandle)) {
            "Invalid authorizationHandle format"
        }
        require(ISSUED_AT_MS_REGEX.matches(issuedAtMillisText)) {
            "issuedAt must be a 13-digit Unix millisecond timestamp"
        }
        val normalizedOrigin = NetworkAddressPolicy.normalizeHttpsOrigin(productionOrigin)
        val handleDigestHex = Ed25519Crypto.sha256HexUtf8(authorizationHandle)
        return listOf(
            DOMAIN_PREFIX,
            "POST",
            normalizedOrigin,
            TARGET_PATH,
            handleDigestHex,
            issuedAtMillisText,
        ).joinToString("\n")
    }

    fun createSignedPayload(
        deviceSeed32: ByteArray,
        authorizationHandle: String,
        issuedAtMillis: Long,
        productionOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    ): SignedConfigFetchPayload {
        val issuedAtText = issuedAtMillis.toString()
        val signingInput = buildSigningInput(
            authorizationHandle = authorizationHandle,
            issuedAtMillisText = issuedAtText,
            productionOrigin = productionOrigin,
        )
        val signature = Ed25519Crypto.signBase64Url(
            seed32 = deviceSeed32,
            message = signingInput.toByteArray(StandardCharsets.UTF_8),
        )
        return SignedConfigFetchPayload(
            authorizationHandle = authorizationHandle,
            issuedAt = issuedAtText,
            deviceProof = signature,
        )
    }
}

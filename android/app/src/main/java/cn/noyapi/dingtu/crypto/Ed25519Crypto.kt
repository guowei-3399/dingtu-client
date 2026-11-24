// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.crypto

import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.bouncycastle.math.ec.rfc7748.X25519
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

data class DevicePublicJwk(
    val kty: String = "OKP",
    val crv: String = "Ed25519",
    val x: String,
) {
    init {
        require(kty == "OKP" && crv == "Ed25519") { "DevicePublicJwk must be OKP Ed25519" }
        require(Ed25519Crypto.isUnpaddedBase64UrlOfByteSize(x, 32)) {
            "DevicePublicJwk x coordinate must be 43-char unpadded base64url"
        }
    }

    fun toJsonObject(): JSONObject = JSONObject()
        .put("kty", kty)
        .put("crv", crv)
        .put("x", x)
}

object Ed25519Crypto {
    const val SEED_BYTES = 32
    const val PUBLIC_KEY_BYTES = 32
    const val SIGNATURE_BYTES = 64

    private val UNPADDED_BASE64URL_REGEX = Regex("^[A-Za-z0-9_-]+$")
    private val secureRandom = SecureRandom()

    fun generateSeed(): ByteArray {
        repeat(8) {
            val seed = ByteArray(SEED_BYTES)
            secureRandom.nextBytes(seed)
            if (seed.any { it.toInt() != 0 }) {
                return seed
            }
        }
        throw IllegalStateException("SecureRandom failed to produce non-zero Ed25519 seed")
    }

    fun derivePublicKeyBytes(seed32: ByteArray): ByteArray {
        require(seed32.size == SEED_BYTES) { "Ed25519 seed must be exactly 32 bytes" }
        val privateParams = Ed25519PrivateKeyParameters(seed32, 0)
        return privateParams.generatePublicKey().encoded
    }

    fun exportPublicJwk(seed32: ByteArray): DevicePublicJwk {
        val publicBytes = derivePublicKeyBytes(seed32)
        return DevicePublicJwk(x = encodeBase64UrlNoPadding(publicBytes))
    }

    fun computeKeyId(publicKeyBytes: ByteArray): String {
        require(publicKeyBytes.size == PUBLIC_KEY_BYTES) { "Ed25519 public key must be 32 bytes" }
        return "ed25519-${sha256Hex(publicKeyBytes)}"
    }

    fun signBase64Url(seed32: ByteArray, message: ByteArray): String {
        require(seed32.size == SEED_BYTES) { "Ed25519 seed must be 32 bytes" }
        val privateParams = Ed25519PrivateKeyParameters(seed32, 0)
        val signer = Ed25519Signer()
        signer.init(true, privateParams)
        signer.update(message, 0, message.size)
        val signature = signer.generateSignature()
        check(signature.size == SIGNATURE_BYTES) { "Unexpected Ed25519 signature length" }
        return encodeBase64UrlNoPadding(signature)
    }

    fun verifyBase64Url(
        publicKeyBytes: ByteArray,
        message: ByteArray,
        signatureBase64Url: String,
    ): Boolean {
        if (publicKeyBytes.size != PUBLIC_KEY_BYTES) return false
        if (!isUnpaddedBase64UrlOfByteSize(signatureBase64Url, SIGNATURE_BYTES)) return false
        val signatureBytes = try {
            decodeBase64UrlNoPadding(signatureBase64Url)
        } catch (_: IllegalArgumentException) {
            return false
        }
        if (signatureBytes.size != SIGNATURE_BYTES) return false

        return try {
            val publicParams = Ed25519PublicKeyParameters(publicKeyBytes, 0)
            val verifier = Ed25519Signer()
            verifier.init(false, publicParams)
            verifier.update(message, 0, message.size)
            verifier.verifySignature(signatureBytes)
        } catch (_: Exception) {
            false
        }
    }

    fun isValidX25519RealityPublicKey(encoded: String): Boolean {
        if (!isUnpaddedBase64UrlOfByteSize(encoded, 32)) return false
        val raw = try {
            decodeBase64UrlNoPadding(encoded)
        } catch (_: IllegalArgumentException) {
            return false
        }
        if (raw.size != 32) return false
        // Fixed non-secret scalar checks against low-order X25519 points (matches config_policy.go).
        val scalar = ByteArray(32).apply { this[0] = 1 }
        val shared = ByteArray(32)
        X25519.scalarMult(scalar, 0, raw, 0, shared, 0)
        return shared.any { it.toInt() != 0 }
    }

    fun encodeBase64UrlNoPadding(bytes: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    fun decodeBase64UrlNoPadding(encoded: String): ByteArray {
        if (encoded.isEmpty() || !UNPADDED_BASE64URL_REGEX.matches(encoded)) {
            throw IllegalArgumentException("Input is not unpadded base64url")
        }
        val bytes = Base64.getUrlDecoder().decode(encoded)
        // Enforce canonical base64url without non-zero trailing pad bits.
        if (encodeBase64UrlNoPadding(bytes) != encoded) {
            throw IllegalArgumentException("Non-canonical base64url encoding")
        }
        return bytes
    }

    fun isUnpaddedBase64UrlOfByteSize(encoded: String, expectedBytes: Int): Boolean {
        val expectedChars = (expectedBytes * 4 + 2) / 3
        if (encoded.length != expectedChars || !UNPADDED_BASE64URL_REGEX.matches(encoded)) {
            return false
        }
        return try {
            decodeBase64UrlNoPadding(encoded).size == expectedBytes
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        val chars = CharArray(digest.size * 2)
        val hexDigits = "0123456789abcdef"
        for (i in digest.indices) {
            val value = digest[i].toInt() and 0xFF
            chars[i * 2] = hexDigits[value ushr 4]
            chars[i * 2 + 1] = hexDigits[value and 0x0F]
        }
        return String(chars)
    }

    fun sha256HexUtf8(value: String): String =
        sha256Hex(value.toByteArray(StandardCharsets.UTF_8))

    fun sha256Base64UrlUtf8(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
        return encodeBase64UrlNoPadding(digest)
    }

    fun constantTimeEquals(a: String?, b: String?): Boolean {
        if (a == null || b == null) return false
        val aBytes = a.toByteArray(StandardCharsets.UTF_8)
        val bBytes = b.toByteArray(StandardCharsets.UTF_8)
        return MessageDigest.isEqual(aBytes, bBytes)
    }
}

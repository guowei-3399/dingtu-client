// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.trust

import android.content.Context
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.json.StrictJsonException
import cn.noyapi.dingtu.json.StrictJsonValidator
import org.json.JSONObject
import java.io.InputStream
import java.nio.charset.StandardCharsets

class TrustAnchorException(message: String, cause: Throwable? = null) :
    IllegalStateException(message, cause)

data class ForbiddenPublicTestKey(
    val source: String,
    val x: String,
    val keyId: String,
)

data class VerifiedTrustAnchor(
    val origin: String,
    val keyId: String,
    val publicKeyBytes: ByteArray,
    val sha256Hex: String,
) {
    init {
        require(publicKeyBytes.size == Ed25519Crypto.PUBLIC_KEY_BYTES) {
            "VerifiedTrustAnchor public key must be 32 bytes"
        }
        val encodedX = Ed25519Crypto.encodeBase64UrlNoPadding(publicKeyBytes)
        if (ProductionTrustAnchor.isForbiddenTestKey(keyId = keyId, x = encodedX)) {
            throw TrustAnchorException("Forbidden public test Ed25519 key rejected: $keyId")
        }
        val expectedKeyId = Ed25519Crypto.computeKeyId(publicKeyBytes)
        if (expectedKeyId != keyId) {
            throw TrustAnchorException("Trust anchor keyId does not match Ed25519 public key digest")
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is VerifiedTrustAnchor) return false
        return origin == other.origin &&
            keyId == other.keyId &&
            publicKeyBytes.contentEquals(other.publicKeyBytes) &&
            sha256Hex == other.sha256Hex
    }

    override fun hashCode(): Int {
        var result = origin.hashCode()
        result = 31 * result + keyId.hashCode()
        result = 31 * result + publicKeyBytes.contentHashCode()
        result = 31 * result + sha256Hex.hashCode()
        return result
    }
}

object ProductionTrustAnchor {
    const val MAX_PRODUCTION_TRUST_BYTES = 16 * 1024

    val FORBIDDEN_PUBLIC_TEST_KEYS: List<ForbiddenPublicTestKey> = listOf(
        ForbiddenPublicTestKey(
            source = "v112-signature-vector:configPublicJwk(PUBLIC_TEST_ONLY_DO_NOT_DEPLOY)",
            x = "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
            keyId = "ed25519-139e3940e64b5491722088d9a0d741628fc826e09475d341a780acde3c4b8070",
        ),
        ForbiddenPublicTestKey(
            source = "v112-signature-vector:devicePublicJwk(PUBLIC_TEST_ONLY_DO_NOT_DEPLOY)",
            x = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ",
            keyId = "ed25519-65b60673d6ed884bf01c2c222d82ada0740f29ac3355d6a925c81f17f47a27b8",
        ),
        ForbiddenPublicTestKey(
            source = "smoke-dummy-zero32-ed25519",
            x = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            keyId = "ed25519-66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
        ),
    )

    private val FORBIDDEN_TEST_MARKERS = listOf(
        "PUBLIC_TEST_ONLY_DO_NOT_DEPLOY",
        "PUBLIC-TEST-ONLY-NOT-A-DEPLOYMENT-SECRET",
        "PUBLIC-LEASE-TEST-ONLY-NOT-A-DEPLOYMENT-SECRET",
        "not-for-deployment",
    )

    private val ALLOWED_JWK_KEYS = setOf("kty", "crv", "x", "alg", "use", "key_ops")
    private val ALLOWED_ROOT_KEYS = setOf("origin", "keys")
    private val forbiddenByKeyId = FORBIDDEN_PUBLIC_TEST_KEYS.associateBy { it.keyId }
    private val forbiddenByX = FORBIDDEN_PUBLIC_TEST_KEYS.associateBy { it.x }

    fun isForbiddenTestKey(keyId: String?, x: String?): Boolean {
        if (keyId != null && keyId in forbiddenByKeyId) return true
        if (x != null && x in forbiddenByX) return true
        return false
    }

    fun loadFromContext(context: Context): VerifiedTrustAnchor {
        val rawBytes = context.assets
            .open(DingtuConstants.PRODUCTION_TRUST_ASSET_NAME)
            .use(InputStream::readBytes)
        return parseAndVerify(rawBytes)
    }

    fun parseAndVerify(rawBytes: ByteArray): VerifiedTrustAnchor {
        if (rawBytes.isEmpty() || rawBytes.size > MAX_PRODUCTION_TRUST_BYTES) {
            throw TrustAnchorException("Production trust anchor byte length invalid: ${rawBytes.size}")
        }
        val actualSha256 = sha256Hex(rawBytes)
        if (actualSha256 != DingtuConstants.PRODUCTION_TRUST_SHA256) {
            throw TrustAnchorException(
                "Production trust anchor SHA-256 mismatch: expected ${DingtuConstants.PRODUCTION_TRUST_SHA256}, got $actualSha256"
            )
        }
        return parseAndValidateStructure(
            rawBytes = rawBytes,
            expectedOrigin = DingtuConstants.CONTROL_ORIGIN,
            expectedKeyId = DingtuConstants.PRODUCTION_TRUST_KEY_ID,
            actualSha256 = actualSha256,
        )
    }

    internal fun parseUnpinnedForPolicyCheck(
        rawBytes: ByteArray,
        expectedOrigin: String,
    ): VerifiedTrustAnchor {
        if (rawBytes.isEmpty() || rawBytes.size > MAX_PRODUCTION_TRUST_BYTES) {
            throw TrustAnchorException("Trust JSON byte length invalid: ${rawBytes.size}")
        }
        return parseAndValidateStructure(
            rawBytes = rawBytes,
            expectedOrigin = expectedOrigin,
            expectedKeyId = null,
            actualSha256 = sha256Hex(rawBytes),
        )
    }

    private fun parseAndValidateStructure(
        rawBytes: ByteArray,
        expectedOrigin: String,
        expectedKeyId: String?,
        actualSha256: String,
    ): VerifiedTrustAnchor {
        val jsonText = String(rawBytes, StandardCharsets.UTF_8)
        for (marker in FORBIDDEN_TEST_MARKERS) {
            if (jsonText.contains(marker, ignoreCase = true)) {
                throw TrustAnchorException("Production trust anchor contains forbidden test marker")
            }
        }
        try {
            StrictJsonValidator.assertStrictJson(jsonText, maxDepth = 6)
        } catch (err: StrictJsonException) {
            throw TrustAnchorException("Invalid or duplicate-key JSON in production trust anchor", err)
        }

        val root = try {
            JSONObject(jsonText)
        } catch (err: Exception) {
            throw TrustAnchorException("Invalid production trust JSON payload", err)
        }

        val rootKeys = root.keys().asSequence().toSet()
        if (rootKeys != ALLOWED_ROOT_KEYS) {
            throw TrustAnchorException("Unexpected root keys in trust anchor: $rootKeys")
        }

        val origin = root.optString("origin", "")
        if (origin != expectedOrigin) {
            throw TrustAnchorException("Unexpected trust anchor origin: $origin")
        }

        val keysObject = root.optJSONObject("keys")
            ?: throw TrustAnchorException("Missing keys object in production trust anchor")
        val keyIds = keysObject.keys().asSequence().toList()
        if (keyIds.isEmpty()) {
            throw TrustAnchorException("Empty keys map in production trust anchor")
        }
        for (candidateId in keyIds) {
            if (isForbiddenTestKey(keyId = candidateId, x = null)) {
                throw TrustAnchorException("Forbidden public test keyId present in trust anchor")
            }
        }

        val targetKeyId = expectedKeyId ?: keyIds.singleOrNull()
            ?: throw TrustAnchorException("Ambiguous unpinned key set in trust anchor")
        val jwk = keysObject.optJSONObject(targetKeyId)
            ?: throw TrustAnchorException("Missing pinned production keyId in trust anchor")

        val jwkKeys = jwk.keys().asSequence().toSet()
        if (!ALLOWED_JWK_KEYS.containsAll(jwkKeys)) {
            throw TrustAnchorException("Unexpected JWK properties in trust anchor: $jwkKeys")
        }
        if (jwk.has("d")) {
            throw TrustAnchorException("Private key material is forbidden in trust anchor")
        }
        if (jwk.optString("kty") != "OKP" || jwk.optString("crv") != "Ed25519") {
            throw TrustAnchorException("Pinned key must be OKP Ed25519")
        }
        if (jwk.optString("alg") != "EdDSA" || jwk.optString("use") != "sig") {
            throw TrustAnchorException("Pinned key must enforce EdDSA sig usage")
        }

        val keyOps = jwk.optJSONArray("key_ops")
            ?: throw TrustAnchorException("Pinned key missing key_ops")
        var hasVerifyOp = false
        for (index in 0 until keyOps.length()) {
            if (keyOps.optString(index) == "verify") {
                hasVerifyOp = true
                break
            }
        }
        if (!hasVerifyOp) {
            throw TrustAnchorException("Pinned key missing verify key_ops")
        }

        val encodedX = jwk.optString("x", "")
        if (isForbiddenTestKey(keyId = targetKeyId, x = encodedX)) {
            throw TrustAnchorException("Forbidden public test Ed25519 key rejected")
        }

        val decodedKey = try {
            Ed25519Crypto.decodeBase64UrlNoPadding(encodedX)
        } catch (err: IllegalArgumentException) {
            throw TrustAnchorException("Failed to decode Ed25519 public key coordinate", err)
        }

        if (decodedKey.size != Ed25519Crypto.PUBLIC_KEY_BYTES) {
            throw TrustAnchorException("Decoded Ed25519 public key must be 32 bytes")
        }

        return VerifiedTrustAnchor(
            origin = origin,
            keyId = targetKeyId,
            publicKeyBytes = decodedKey,
            sha256Hex = actualSha256,
        )
    }

    fun sha256Hex(input: ByteArray): String = Ed25519Crypto.sha256Hex(input)
}

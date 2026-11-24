// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.trust.ProductionTrustAnchor
import cn.noyapi.dingtu.trust.TrustAnchorException
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets

class V112SignatureVectorParityTest {

    private fun loadVectorJson(): JSONObject {
        val stream = javaClass.classLoader
            ?.getResourceAsStream("vectors/2026-11-11-v112-public-signature-vectors.json")
        assertNotNull("Test vector resource must exist in src/test/resources", stream)
        val raw = stream!!.use { it.readBytes() }
        return JSONObject(String(raw, StandardCharsets.UTF_8))
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0)
        return ByteArray(hex.length / 2) { idx ->
            hex.substring(idx * 2, idx * 2 + 2).toInt(16).toByte()
        }
    }

    @Test
    fun deviceProofAndEnvelopeSignatureMatchCrossPlaneV112VectorsByteForByte() {
        val vector = loadVectorJson()
        assertEquals("1.12", vector.getString("contractVersion"))

        // 1. Device Ed25519 seed -> JWK parity (no private 'd' key exported)
        val deviceSeed = hexToBytes(vector.getString("devicePublicSeedHex"))
        val exportedDeviceJwk = Ed25519Crypto.exportPublicJwk(deviceSeed)
        val expectedDeviceJwk = vector.getJSONObject("devicePublicJwk")
        assertEquals(expectedDeviceJwk.getString("x"), exportedDeviceJwk.x)
        val serializedJwk = exportedDeviceJwk.toJsonObject()
        assertEquals(setOf("kty", "crv", "x"), serializedJwk.keys().asSequence().toSet())
        assertFalse(serializedJwk.has("d"))

        // 2. DeviceProof signing input & Ed25519 signature parity
        val origin = vector.getString("origin")
        val req = vector.getJSONObject("request")
        val handle = req.getString("authorizationHandle")
        val issuedAt = req.getString("issuedAt")
        val expectedProofInput = vector.getString("deviceProofInput")
        val expectedProofSha = vector.getString("deviceProofInputSha256")

        val actualProofInput = DeviceProofSigner.buildSigningInput(
            authorizationHandle = handle,
            issuedAtMillisText = issuedAt,
            productionOrigin = origin,
        )
        assertEquals(expectedProofInput, actualProofInput)
        assertEquals(expectedProofSha, Ed25519Crypto.sha256HexUtf8(actualProofInput))

        val signedPayload = DeviceProofSigner.createSignedPayload(
            deviceSeed32 = deviceSeed,
            authorizationHandle = handle,
            issuedAtMillis = issuedAt.toLong(),
            productionOrigin = origin,
        )
        assertEquals(req.getString("deviceProof"), signedPayload.deviceProof)

        // 3. Config signing key derivation & envelope 9-line signing input parity
        val configSeed = hexToBytes(vector.getString("configPublicSeedHex"))
        val configPubBytes = Ed25519Crypto.derivePublicKeyBytes(configSeed)
        val configPubJwk = Ed25519Crypto.exportPublicJwk(configSeed)
        assertEquals(vector.getJSONObject("configPublicJwk").getString("x"), configPubJwk.x)

        val envelope = vector.getJSONObject("envelope")
        val signatureObj = envelope.getJSONObject("signature")
        val expectedKeyId = signatureObj.getString("keyId")
        assertEquals(expectedKeyId, Ed25519Crypto.computeKeyId(configPubBytes))

        val actualConfigSigningInput = TunnelConfigVerifier.buildEnvelopeSigningInput(
            dataSource = envelope.getString("data_source"),
            deviceId = envelope.getString("deviceId"),
            authorizationHandleDigest = envelope.getString("authorizationHandleDigest"),
            bindingRevision = envelope.getString("bindingRevision"),
            configRevision = envelope.getString("configRevision"),
            expiresAt = envelope.getString("expiresAt"),
            signatureKeyId = expectedKeyId,
            configJson = envelope.getString("config"),
        )
        assertEquals(vector.getString("configSigningInput"), actualConfigSigningInput)
        assertEquals(
            vector.getString("configSigningInputSha256"),
            Ed25519Crypto.sha256HexUtf8(actualConfigSigningInput),
        )

        val sigValue = signatureObj.getString("value")
        assertTrue(
            Ed25519Crypto.verifyBase64Url(
                publicKeyBytes = configPubBytes,
                message = actualConfigSigningInput.toByteArray(StandardCharsets.UTF_8),
                signatureBase64Url = sigValue,
            )
        )

        // 4. Verify runtime TrustAnchor explicitly blocks the public test vector key!
        assertThrows(TrustAnchorException::class.java) {
            VerifiedTrustAnchor(
                origin = "https://dingtu.noyapi.cn",
                keyId = expectedKeyId,
                publicKeyBytes = configPubBytes,
                sha256Hex = ProductionTrustAnchor.sha256Hex(configPubBytes),
            )
        }
    }
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.config

import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.bouncycastle.math.ec.rfc7748.X25519
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets

class TunnelConfigVerificationAndLibboxTest {

    private val testNowMillis = java.time.Instant.parse("2026-11-23T01:46:40.000Z").toEpochMilli()
    private val validExpiresAt = "2026-11-23T01:55:40.000Z" // +540s (within 660s window)
    private val validDeviceId = "33333333-3333-4333-8333-333333333333"
    private val validHandle = "pah_" + Ed25519Crypto.encodeBase64UrlNoPadding(ByteArray(32) { (it + 7).toByte() })

    private data class EphemeralSigningFixture(
        val seed32: ByteArray,
        val anchor: VerifiedTrustAnchor,
    )

    private fun createSigningFixture(): EphemeralSigningFixture {
        val seed = ByteArray(32) { idx -> (0x41 + idx).toByte() }
        val pubBytes = Ed25519Crypto.derivePublicKeyBytes(seed)
        val keyId = Ed25519Crypto.computeKeyId(pubBytes)
        val anchor = VerifiedTrustAnchor(
            origin = "https://dingtu.noyapi.cn",
            keyId = keyId,
            publicKeyBytes = pubBytes,
            sha256Hex = Ed25519Crypto.sha256Hex(pubBytes),
        )
        return EphemeralSigningFixture(seed, anchor)
    }

    private fun signEnvelope(
        fixture: EphemeralSigningFixture,
        configJson: String,
        deviceId: String = validDeviceId,
        handleDigest: String = Ed25519Crypto.sha256HexUtf8(validHandle),
        bindingRevision: String = "binding-12",
        configRevision: String = "cfg-${Ed25519Crypto.sha256HexUtf8(configJson)}",
        expiresAt: String = validExpiresAt,
        keyId: String = fixture.anchor.keyId,
    ): ByteArray {
        val signingInput = TunnelConfigVerifier.buildEnvelopeSigningInput(
            dataSource = "production",
            deviceId = deviceId,
            authorizationHandleDigest = handleDigest,
            bindingRevision = bindingRevision,
            configRevision = configRevision,
            expiresAt = expiresAt,
            signatureKeyId = keyId,
            configJson = configJson,
        )
        val sig = Ed25519Crypto.signBase64Url(
            seed32 = fixture.seed32,
            message = signingInput.toByteArray(StandardCharsets.UTF_8),
        )
        val envelope = JSONObject()
            .put("data_source", "production")
            .put("deviceId", deviceId)
            .put("authorizationHandleDigest", handleDigest)
            .put("bindingRevision", bindingRevision)
            .put("configRevision", configRevision)
            .put("expiresAt", expiresAt)
            .put("config", configJson)
            .put(
                "signature",
                JSONObject()
                    .put("keyId", keyId)
                    .put("value", sig),
            )
        return envelope.toString().toByteArray(StandardCharsets.UTF_8)
    }

    @Test
    fun positiveTlsVlessIpConfigVerifiesAndGeneratesZeroDirectLibboxJson() {
        val fixture = createSigningFixture()
        val prodConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","server_port":28443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"}}"""
        val rawEnvelope = signEnvelope(fixture, prodConfig)

        val verified = TunnelConfigVerifier.verifyEnvelopeAndPolicy(
            rawEnvelopeBytes = rawEnvelope,
            expectedDeviceId = validDeviceId,
            expectedAuthorizationHandle = validHandle,
            trustAnchor = fixture.anchor,
            nowMillis = testNowMillis,
        )

        val libboxJson = AndroidLibboxConfigBuilder.buildClosedConfigJson(verified)
        assertFalse("Generated config must never contain direct outbound", libboxJson.contains("\"direct\""))
        assertFalse("Learning edition strips quic reject rule", libboxJson.contains("\"quic\""))

        val parsed = JSONObject(libboxJson)
        val tunIn = parsed.getJSONArray("inbounds").getJSONObject(0)
        assertEquals("gvisor", tunIn.getString("stack"))
        assertFalse("Learning edition strips strict_route", tunIn.has("strict_route"))
        val outbounds = parsed.getJSONArray("outbounds")
        assertEquals(1, outbounds.length())
        val out0 = outbounds.getJSONObject(0)
        assertEquals("vless", out0.getString("type"))
        assertEquals("noya-device", out0.getString("tag"))
        assertEquals("93.184.216.34", out0.getString("server"))
        assertEquals(28443, out0.getInt("server_port"))
        assertEquals("550e8400-e29b-41d4-a716-446655440000", out0.getString("uuid"))
        assertEquals("noya-bootstrap-hosts", out0.getString("domain_resolver"))
        assertEquals("origin.noyapi.cn", out0.getJSONObject("tls").getString("server_name"))

        val route = parsed.getJSONObject("route")
        assertFalse(route.getBoolean("auto_detect_interface"))
        assertEquals("noya-bootstrap-hosts", route.getString("default_domain_resolver"))
        assertEquals("noya-device", route.getString("final"))
        assertEquals(2, route.getJSONArray("rules").length())
    }

    @Test
    fun positiveRealityUtlsHostnameConfigPreservesOutboundBytesVerbatim() {
        val fixture = createSigningFixture()
        val x25519Priv = ByteArray(32) { (it + 3).toByte() }
        val x25519Pub = ByteArray(32)
        X25519.scalarMultBase(x25519Priv, 0, x25519Pub, 0)
        val realityPubB64 = Ed25519Crypto.encodeBase64UrlNoPadding(x25519Pub)

        val prodConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"edge-us.noyapi.cn","server_port":443,"uuid":"7c9e6679-7425-40de-944b-e07fc1f90ae7","flow":"xtls-rprx-vision","tls":{"enabled":true,"server_name":"edge-us.noyapi.cn","utls":{"enabled":true,"fingerprint":"chrome"},"reality":{"enabled":true,"public_key":"$realityPubB64","short_id":"01ab89ef"}}}],"route":{"final":"noya-device"}}"""
        val rawEnvelope = signEnvelope(fixture, prodConfig)

        val verified = TunnelConfigVerifier.verifyEnvelopeAndPolicy(
            rawEnvelopeBytes = rawEnvelope,
            expectedDeviceId = validDeviceId,
            expectedAuthorizationHandle = validHandle,
            trustAnchor = fixture.anchor,
            nowMillis = testNowMillis,
        )

        val libboxJson = AndroidLibboxConfigBuilder.buildClosedConfigJson(
            verified = verified,
            resolvedBootstrapIps = listOf("104.18.22.33"),
        )
        val out0 = JSONObject(libboxJson).getJSONArray("outbounds").getJSONObject(0)
        assertEquals("xtls-rprx-vision", out0.getString("flow"))
        assertEquals(realityPubB64, out0.getJSONObject("tls").getJSONObject("reality").getString("public_key"))
        assertEquals("01ab89ef", out0.getJSONObject("tls").getJSONObject("reality").getString("short_id"))

        // Reject private/loopback bootstrap IPs (fail-closed)
        assertThrows(ConfigGenerationException::class.java) {
            AndroidLibboxConfigBuilder.buildClosedConfigJson(
                verified = verified,
                resolvedBootstrapIps = listOf("127.0.0.1"),
            )
        }
        assertThrows(ConfigGenerationException::class.java) {
            AndroidLibboxConfigBuilder.buildClosedConfigJson(
                verified = verified,
                resolvedBootstrapIps = emptyList(),
            )
        }
    }

    @Test
    fun tamperedSignatureOrTamperedConfigBodyFailsClosed() {
        val fixture = createSigningFixture()
        val prodConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","server_port":443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"}}"""
        val validBytes = signEnvelope(fixture, prodConfig)

        // Tamper signature value
        val sigTamperedObj = JSONObject(String(validBytes, StandardCharsets.UTF_8))
        val origSig = sigTamperedObj.getJSONObject("signature").getString("value")
        val flippedFirst = if (origSig.first() == 'A') 'B' else 'A'
        sigTamperedObj.getJSONObject("signature").put("value", flippedFirst + origSig.drop(1))

        val sigEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                rawEnvelopeBytes = sigTamperedObj.toString().toByteArray(StandardCharsets.UTF_8),
                expectedDeviceId = validDeviceId,
                expectedAuthorizationHandle = validHandle,
                trustAnchor = fixture.anchor,
                nowMillis = testNowMillis,
            )
        }
        assertEquals("SIGNATURE_INVALID", sigEx.reasonCode)

        // Tamper config body after signing (even updating configRevision without valid signature)
        val cfgTamperedObj = JSONObject(String(validBytes, StandardCharsets.UTF_8))
        val mutatedConfig = prodConfig.replace("93.184.216.34", "198.51.100.99")
        cfgTamperedObj.put("config", mutatedConfig)
        cfgTamperedObj.put("configRevision", "cfg-${Ed25519Crypto.sha256HexUtf8(mutatedConfig)}")

        val cfgEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                rawEnvelopeBytes = cfgTamperedObj.toString().toByteArray(StandardCharsets.UTF_8),
                expectedDeviceId = validDeviceId,
                expectedAuthorizationHandle = validHandle,
                trustAnchor = fixture.anchor,
                nowMillis = testNowMillis,
            )
        }
        assertEquals("SIGNATURE_INVALID", cfgEx.reasonCode)
    }

    @Test
    fun expiredOrInvalidMetadataAndInjectedDirectOrExtraOutboundsFailClosed() {
        val fixture = createSigningFixture()
        val baseConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","server_port":443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"}}"""

        // 1. Expired expiresAt
        val expiredBytes = signEnvelope(fixture, baseConfig, expiresAt = "2026-11-23T01:40:00.000Z")
        val expEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                expiredBytes, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_EXPIRED_OR_WINDOW_INVALID", expEx.reasonCode)

        // 1b. Excessive future expiresAt (> now + 660_000ms)
        val tooFarBytes = signEnvelope(fixture, baseConfig, expiresAt = "2026-11-23T02:00:00.000Z")
        val farEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                tooFarBytes, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_EXPIRED_OR_WINDOW_INVALID", farEx.reasonCode)

        // 2. Illegal bindingRevision (leading zero / zero)
        val badRevBytes = signEnvelope(fixture, baseConfig, bindingRevision = "binding-01")
        val revEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                badRevBytes, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("BINDING_REVISION_INVALID", revEx.reasonCode)

        // 3. Signed config containing 'direct' outbound MUST still be rejected by policy!
        val directInjectedConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"direct","tag":"noya-device"}],"route":{"final":"noya-device"}}"""
        val directSigned = signEnvelope(fixture, directInjectedConfig)
        val dirEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                directSigned, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_OUTBOUND_TYPE_OR_TAG_REJECTED", dirEx.reasonCode)

        // 4. Signed config containing second malicious outbound MUST fail closed!
        val dualOutboundConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","server_port":443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}},{"type":"direct","tag":"bypass"}],"route":{"final":"noya-device"}}"""
        val dualSigned = signEnvelope(fixture, dualOutboundConfig)
        val dualEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                dualSigned, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_OUTBOUNDS_COUNT", dualEx.reasonCode)

        // 5. Signed config containing clash_api / external_controller MUST fail closed!
        val clashApiConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","server_port":443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"},"experimental":{"clash_api":{"external_controller":"0.0.0.0:9090"}}}"""
        val clashApiSigned = signEnvelope(fixture, clashApiConfig)
        val clashEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                clashApiSigned, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_POLICY_SCHEMA_REJECTED", clashEx.reasonCode)

        // 6. Signed config containing duplicate/escaped duplicate JSON keys MUST fail closed!
        val duplicateKeyConfig = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"93.184.216.34","\u0073erver":"203.0.114.8","server_port":443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"}}"""
        val dupSigned = signEnvelope(fixture, duplicateKeyConfig)
        val dupEx = assertThrows(ConfigVerificationException::class.java) {
            TunnelConfigVerifier.verifyEnvelopeAndPolicy(
                dupSigned, validDeviceId, validHandle, fixture.anchor, testNowMillis
            )
        }
        assertEquals("CONFIG_POLICY_SCHEMA_REJECTED", dupEx.reasonCode)
    }
}

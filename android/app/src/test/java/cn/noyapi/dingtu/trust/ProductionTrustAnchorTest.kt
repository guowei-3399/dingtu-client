// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.trust

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.charset.StandardCharsets

class ProductionTrustAnchorTest {

    private fun resolveBundledTrustAsset(): File {
        val candidates = listOf(
            File("src/main/assets/${DingtuConstants.PRODUCTION_TRUST_ASSET_NAME}"),
            File("app/src/main/assets/${DingtuConstants.PRODUCTION_TRUST_ASSET_NAME}"),
        )
        return candidates.firstOrNull { it.isFile }
            ?: error("Could not locate bundled ${DingtuConstants.PRODUCTION_TRUST_ASSET_NAME}")
    }

    @Test
    fun bundledTrustAnchorMatchesPinnedSha256AndDecodesEd25519Key() {
        val rawBytes = resolveBundledTrustAsset().readBytes()
        val anchor = ProductionTrustAnchor.parseAndVerify(rawBytes)

        assertEquals(DingtuConstants.PRODUCTION_TRUST_SHA256, anchor.sha256Hex)
        assertEquals(DingtuConstants.CONTROL_ORIGIN, anchor.origin)
        assertEquals(DingtuConstants.PRODUCTION_TRUST_KEY_ID, anchor.keyId)
        assertEquals(32, anchor.publicKeyBytes.size)
    }

    @Test
    fun tamperedTrustAnchorBytesFailClosed() {
        val rawBytes = resolveBundledTrustAsset().readBytes().clone()
        rawBytes[0] = (rawBytes[0].toInt() xor 0x01).toByte()

        assertThrows(TrustAnchorException::class.java) {
            ProductionTrustAnchor.parseAndVerify(rawBytes)
        }
    }

    @Test
    fun allForbiddenPublicTestKeysFailClosed() {
        assertEquals(3, ProductionTrustAnchor.FORBIDDEN_PUBLIC_TEST_KEYS.size)
        for (forbidden in ProductionTrustAnchor.FORBIDDEN_PUBLIC_TEST_KEYS) {
            assertTrue(ProductionTrustAnchor.isForbiddenTestKey(forbidden.keyId, forbidden.x))
            val forgedJson = """
                {
                  "origin": "https://dingtu.noyapi.cn",
                  "keys": {
                    "${forbidden.keyId}": {
                      "kty": "OKP",
                      "crv": "Ed25519",
                      "x": "${forbidden.x}",
                      "alg": "EdDSA",
                      "use": "sig",
                      "key_ops": ["verify"]
                    }
                  }
                }
            """.trimIndent().toByteArray(StandardCharsets.UTF_8)

            assertThrows(TrustAnchorException::class.java) {
                ProductionTrustAnchor.parseUnpinnedForPolicyCheck(
                    rawBytes = forgedJson,
                    expectedOrigin = "https://dingtu.noyapi.cn",
                )
            }
        }
    }

    @Test
    fun duplicateJsonKeysAndForbiddenMarkersInTrustAnchorFailClosed() {
        val duplicateKeyJson = """
            {
              "origin": "https://dingtu.noyapi.cn",
              "origin": "https://dingtu.noyapi.cn",
              "keys": {}
            }
        """.trimIndent().toByteArray(StandardCharsets.UTF_8)

        assertThrows(TrustAnchorException::class.java) {
            ProductionTrustAnchor.parseUnpinnedForPolicyCheck(
                rawBytes = duplicateKeyJson,
                expectedOrigin = "https://dingtu.noyapi.cn",
            )
        }

        val escapedDuplicateJson = """
            {
              "origin": "https://dingtu.noyapi.cn",
              "\u006frigin": "https://dingtu.noyapi.cn",
              "keys": {}
            }
        """.trimIndent().toByteArray(StandardCharsets.UTF_8)

        assertThrows(TrustAnchorException::class.java) {
            ProductionTrustAnchor.parseUnpinnedForPolicyCheck(
                rawBytes = escapedDuplicateJson,
                expectedOrigin = "https://dingtu.noyapi.cn",
            )
        }
    }

    @Test
    fun lockedClientConstantsMatchContract() {
        assertEquals("cn.noyapi.dingtu", DingtuConstants.APPLICATION_ID)
        assertEquals("0.1.0", DingtuConstants.APP_VERSION)
        assertEquals(26, DingtuConstants.MIN_SDK)
        assertEquals(35, DingtuConstants.TARGET_SDK)
        assertEquals(36, DingtuConstants.COMPILE_SDK)
        assertEquals("https://dingtu.noyapi.cn", DingtuConstants.CONTROL_ORIGIN)
        assertEquals("android-v1", DingtuConstants.HEADER_CLIENT_VALUE)
        assertEquals("2", DingtuConstants.HEADER_SCHEMA_VALUE)
        assertEquals("noya-desktop", DingtuConstants.OAUTH_CLIENT_ID)
        assertEquals("noya://auth/callback", DingtuConstants.OAUTH_DEEP_LINK_REDIRECT_URI)
        assertEquals("1.14.2", DingtuConstants.EXPECTED_SING_BOX_VERSION)
        assertEquals(VpnRoutingMode.PER_APP_VPN, VpnRoutingMode.fromWireValue(null))
        assertEquals(VpnRoutingMode.GLOBAL_VPN, VpnRoutingMode.fromWireValue("global_vpn"))
    }
}

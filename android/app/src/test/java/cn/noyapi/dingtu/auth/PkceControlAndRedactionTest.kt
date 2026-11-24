// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.HttpRequestSpec
import cn.noyapi.dingtu.network.HttpResponseData
import cn.noyapi.dingtu.network.ProductionConfigClient
import cn.noyapi.dingtu.storage.InMemoryDeviceSessionStore
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

class PkceControlAndRedactionTest {

    @Test
    fun pkceAuthorizationAndStrictCallbackValidationEnforceSecurityInvariants() {
        val req = PkceAuthManager.createAuthorizationRequest()
        assertTrue(req.authorizeUrl.startsWith("https://dingtu.noyapi.cn/api/v1/client/authorize?"))
        assertTrue(req.authorizeUrl.contains("client_id=noya-desktop"))
        assertTrue(req.authorizeUrl.contains("platform=android"))
        assertTrue(req.authorizeUrl.contains("code_challenge_method=S256"))
        assertEquals(43, req.codeChallenge.length)
        assertEquals(Ed25519Crypto.sha256Base64UrlUtf8(req.codeVerifier), req.codeChallenge)

        // Forbidden host/desktop ports rejected
        assertFalse(PkceAuthManager.isAllowedRedirectUri("http://127.0.0.1:7890/callback"))
        assertFalse(PkceAuthManager.isAllowedRedirectUri("http://127.0.0.1:7899/callback"))
        assertFalse(PkceAuthManager.isAllowedRedirectUri("http://127.0.0.1:17899/callback"))
        assertTrue(PkceAuthManager.isAllowedRedirectUri("http://127.0.0.1:42185/callback"))

        // Valid callback succeeds
        val validCode = "nac_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
        val verified = PkceAuthManager.validateCallbackUri(
            "noya://auth/callback?code=$validCode&state=${req.state}",
            req,
        )
        assertEquals(validCode, verified.authorizationCode)

        // Wrong state fails
        assertThrows(PkceAuthException::class.java) {
            PkceAuthManager.validateCallbackUri(
                "noya://auth/callback?code=$validCode&state=tampered_state_value",
                req,
            )
        }

        // Duplicate query param fails
        assertThrows(PkceAuthException::class.java) {
            PkceAuthManager.validateCallbackUri(
                "noya://auth/callback?code=$validCode&code=nac_second0000000000000&state=${req.state}",
                req,
            )
        }

        // Ambiguous code + error fails
        assertThrows(PkceAuthException::class.java) {
            PkceAuthManager.validateCallbackUri(
                "noya://auth/callback?code=$validCode&error=access_denied&state=${req.state}",
                req,
            )
        }

        // Fragment in callback fails
        assertThrows(PkceAuthException::class.java) {
            PkceAuthManager.validateCallbackUri(
                "noya://auth/callback?code=$validCode&state=${req.state}#frag",
                req,
            )
        }
    }

    @Test
    fun loopbackFallbackCallbackServerReceivesBrowserRedirectWithoutTouchingReservedPorts() {
        val server = LoopbackCallbackServer.bindEphemeral()
        assertTrue(server.port in 1024..65535)
        assertFalse(server.port in setOf(7890, 7899, 17899))

        val pkceReq = PkceAuthManager.createAuthorizationRequest(redirectUri = server.redirectUri)
        val executor = Executors.newSingleThreadExecutor()
        try {
            val future = executor.submit<String> { server.awaitCallbackUri(timeoutMillis = 5_000) }
            val callbackUrl = "${server.redirectUri}?code=nac_loopback_valid_code_123456&state=${pkceReq.state}"
            val conn = URL(callbackUrl).openConnection() as HttpURLConnection
            assertEquals(200, conn.responseCode)
            conn.disconnect()

            val receivedUri = future.get()
            val verified = PkceAuthManager.validateCallbackUri(receivedUri, pkceReq)
            assertEquals("nac_loopback_valid_code_123456", verified.authorizationCode)
        } finally {
            server.close()
            executor.shutdownNow()
        }
    }

    @Test
    fun controlAndProductionClientsEnforceHeadersNoRetryAndSessionLifecycle() {
        val store = InMemoryDeviceSessionStore()
        val deviceJwk = store.getDevicePublicKeyJwk()
        val recordedRequests = mutableListOf<HttpRequestSpec>()
        val fixedNow = 1_795_400_000_000L
        val validDeviceId = "44444444-4444-4444-8444-444444444444"
        val validHandle = "pah_" + Ed25519Crypto.encodeBase64UrlNoPadding(ByteArray(32) { 9 })

        val signingSeed = ByteArray(32) { (0x21 + it).toByte() }
        val signingPub = Ed25519Crypto.derivePublicKeyBytes(signingSeed)
        val signingKeyId = Ed25519Crypto.computeKeyId(signingPub)
        val testAnchor = VerifiedTrustAnchor(
            origin = DingtuConstants.CONTROL_ORIGIN,
            keyId = signingKeyId,
            publicKeyBytes = signingPub,
            sha256Hex = Ed25519Crypto.sha256Hex(signingPub),
        )

        val sessionPayload = JSONObject()
            .put(
                "device",
                JSONObject()
                    .put("id", validDeviceId)
                    .put("platform", "android")
                    .put("appVersion", "0.1.0")
                    .put("status", "active")
                    .put("createdAt", "2026-11-23T01:46:40.000Z"),
            )
            .put(
                "session",
                JSONObject()
                    .put("accessToken", "nda_access_token_value_1234567890")
                    .put("expiresIn", 600)
                    .put("refreshToken", "ndr_refresh_token_value_1234567890")
                    .put("refreshExpiresAt", "2026-12-23T01:46:40.000Z")
                    .put("scope", JSONArray(listOf("customer.read", "tunnel.read", "device.revoke"))),
            )

        val client = DingtuControlClient(
            transport = { request ->
                recordedRequests.add(request)
                assertEquals("android-v1", request.headers["X-Noya-Client"])
                assertEquals("2", request.headers["X-Noya-Schema"])
                assertFalse(request.headers.keys.any { it.equals("Cookie", ignoreCase = true) })

                when {
                    request.method == "POST" && request.url.endsWith("/api/v1/client/device/sessions") -> {
                        val reqBody = JSONObject(String(request.bodyBytes!!, StandardCharsets.UTF_8))
                        assertEquals(
                            setOf(
                                "authorizationCode", "codeVerifier", "redirectUri",
                                "deviceName", "platform", "appVersion", "devicePublicKey",
                            ),
                            reqBody.keys().asSequence().toSet(),
                        )
                        HttpResponseData(201, emptyMap(), sessionPayload.toString().toByteArray())
                    }
                    request.method == "POST" && request.url.endsWith("/refresh") -> {
                        val reqBody = JSONObject(String(request.bodyBytes!!, StandardCharsets.UTF_8))
                        assertEquals(setOf("refreshToken"), reqBody.keys().asSequence().toSet())
                        HttpResponseData(200, emptyMap(), sessionPayload.toString().toByteArray())
                    }
                    request.method == "POST" && request.url.endsWith("/api/v1/client/tunnel/authorizations") -> {
                        assertEquals("{}", String(request.bodyBytes!!, StandardCharsets.UTF_8))
                        assertTrue(request.headers["Authorization"]!!.startsWith("Bearer "))
                        val resp = JSONObject()
                            .put("authorizationHandle", validHandle)
                            .put("expiresAt", "2026-11-23T01:47:40.000Z")
                        HttpResponseData(201, emptyMap(), resp.toString().toByteArray())
                    }
                    request.method == "DELETE" && request.url.endsWith("/api/v1/client/device/sessions/$validDeviceId") -> {
                        HttpResponseData(204, emptyMap(), ByteArray(0))
                    }
                    request.method == "GET" -> {
                        HttpResponseData(200, emptyMap(), """{"data_source":"real"}""".toByteArray())
                    }
                    else -> error("Unexpected request: ${request.method} ${request.url}")
                }
            },
            nowProvider = { fixedNow },
        )

        val session = client.exchangeAuthorizationCode(
            authorizationCode = "nac_one_time_code_abcdef123456",
            codeVerifier = "v".repeat(64),
            redirectUri = "noya://auth/callback",
            deviceName = "MuMu 12 Android",
            devicePublicKey = deviceJwk,
        )
        store.saveSession(session)
        assertNotNull(store.readSession())

        // Attempting to reuse the same authorizationCode MUST fail locally without sending a network replay!
        val countBeforeReplay = recordedRequests.size
        assertThrows(PkceAuthException::class.java) {
            client.exchangeAuthorizationCode(
                authorizationCode = "nac_one_time_code_abcdef123456",
                codeVerifier = "v".repeat(64),
                redirectUri = "noya://auth/callback",
                deviceName = "MuMu 12 Android",
                devicePublicKey = deviceJwk,
            )
        }
        assertEquals(countBeforeReplay, recordedRequests.size)

        val refreshed = client.refreshDeviceSession(session.deviceId, session.refreshToken)
        assertEquals(validDeviceId, refreshed.deviceId)

        val grant = client.issueTunnelAuthorization(session.accessToken)
        assertEquals(validHandle, grant.authorizationHandle)

        // Verify read-only control plane skeleton calls
        client.getMe(session.accessToken)
        client.getTenantEntitlement(session.accessToken)
        client.getAssistantOverview(session.accessToken)
        client.getTunnelStatus(session.accessToken)
        client.getClientDevices(session.accessToken)
        client.getUsageSummary(session.accessToken, days = 30)
        client.getActivityLogs(session.accessToken, limit = 20)
        client.getTickets(session.accessToken, status = "submitted", limit = 20)

        // Verify ProductionConfigClient sends exact 3-field payload without Authorization or Cookie
        val prodClient = ProductionConfigClient(
            transport = { req ->
                assertNull(req.headers["Authorization"])
                assertNull(req.headers["Cookie"])
                val body = JSONObject(String(req.bodyBytes!!, StandardCharsets.UTF_8))
                assertEquals(setOf("authorizationHandle", "issuedAt", "deviceProof"), body.keys().asSequence().toSet())
                val errBody = """{"error":{"code":"CONFIG_AUTHORIZATION_INVALID","message":"句柄已过期 nda_secret12345678","request_id":"req_abc"}}"""
                HttpResponseData(401, mapOf("X-Request-Id" to listOf("req_abc")), errBody.toByteArray())
            },
            nowProvider = { fixedNow },
        )
        val seed = store.getOrCreateDeviceKeySeed()
        val apiErr = assertThrows(DingtuApiException::class.java) {
            prodClient.fetchAndVerifyTunnelConfig(validDeviceId, seed, validHandle, testAnchor)
        }
        assertEquals(401, apiErr.statusCode)
        assertEquals("CONFIG_AUTHORIZATION_INVALID", apiErr.errorCode)
        assertEquals("req_abc", apiErr.requestId)
        assertFalse(apiErr.message.contains("nda_secret12345678"))

        // Revoke device session -> 204 & wipe store
        client.revokeDeviceSession(session.deviceId, session.accessToken)
        store.clearAll()
        assertNull(store.readSession())
    }

    @Test
    fun redactedLoggerScrubsAllCredentialsTokensUuidsAndEmails() {
        val dirty = """
            Authorization: Bearer nda_superSecretAccessToken123456789
            refresh=ndr_superSecretRefreshToken987654321
            handle=pah_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
            callback=noya://auth/callback?code=nac_secretAuthCode1234567&state=ok
            json={"accessToken":"raw_tok","uuid":"550e8400-e29b-41d4-a716-446655440000","public_key":"secret_pub","d":"secret_priv"}
            user=alice.smith@noyapi.cn
        """.trimIndent()

        val cleaned = RedactedLogger.redact(dirty)
        assertFalse(cleaned.contains("nda_superSecret"))
        assertFalse(cleaned.contains("ndr_superSecret"))
        assertFalse(cleaned.contains("pah_AAECAwQF"))
        assertFalse(cleaned.contains("nac_secretAuthCode"))
        assertFalse(cleaned.contains("raw_tok"))
        assertFalse(cleaned.contains("550e8400-e29b-41d4-a716-446655440000"))
        assertFalse(cleaned.contains("secret_pub"))
        assertFalse(cleaned.contains("secret_priv"))
        assertFalse(cleaned.contains("alice.smith@noyapi.cn"))
        assertTrue(cleaned.contains("a***@noyapi.cn"))
    }
}

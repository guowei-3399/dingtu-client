// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.HttpResponseData
import cn.noyapi.dingtu.storage.InMemoryDeviceSessionStore
import cn.noyapi.dingtu.storage.StoredDeviceSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.Instant

class AuthenticatedSessionExecutorTest {

    private val deviceId = "66666666-6666-4666-8666-666666666666"
    private val fixedNow = Instant.parse("2026-11-23T06:00:00.000Z").toEpochMilli()

    private fun makeSession(access: String, refresh: String) = StoredDeviceSession(
        deviceId = deviceId,
        platform = "android",
        appVersion = "0.1.0",
        status = "active",
        createdAt = "2026-11-23T05:00:00.000Z",
        accessToken = access,
        accessExpiresAtMillis = fixedNow + 500_000L,
        refreshToken = refresh,
        refreshExpiresAt = "2026-12-23T05:00:00.000Z",
        scopes = listOf("customer.read", "tunnel.read", "device.revoke"),
    )

    @Test
    fun standaloneLogoutReliablyStopsTunnelRevokes204AndClearsStoreWithoutVpnService() {
        val store = InMemoryDeviceSessionStore()
        store.saveSession(makeSession("nda_logout_standalone_1234", "ndr_logout_standalone_1234"))
        val order = mutableListOf<String>()

        val client = DingtuControlClient(
            transport = { req ->
                assertEquals("DELETE", req.method)
                assertEquals(
                    "https://dingtu.noyapi.cn/api/v1/client/device/sessions/$deviceId",
                    req.url,
                )
                order.add("DELETE_204")
                HttpResponseData(204, emptyMap(), ByteArray(0))
            },
            nowProvider = { fixedNow },
        )

        val executor = AuthenticatedSessionExecutor(
            sessionStore = store,
            controlClient = client,
            wallClockMillis = { fixedNow },
        )

        executor.logoutReliably(stopTunnelAction = { order.add("STOP_VPN") })

        assertEquals(listOf("STOP_VPN", "DELETE_204"), order)
        assertNull(store.readSession())
    }

    @Test
    fun second401AfterConcurrentRotatedTokenRetryClearsInvalidLocalSession() {
        val store = InMemoryDeviceSessionStore()
        val oldToken = "nda_old_token_1234567890"
        val rotatedToken = "nda_rotated_token_9876543210"
        store.saveSession(makeSession(oldToken, "ndr_refresh_1234567890"))

        val client = DingtuControlClient(
            transport = { error("Refresh endpoint must not be hit when concurrent token is already rotated") },
            nowProvider = { fixedNow },
        )
        val executor = AuthenticatedSessionExecutor(
            sessionStore = store,
            controlClient = client,
            wallClockMillis = { fixedNow },
        )

        var attempts = 0
        val ex = assertThrows(DingtuApiException::class.java) {
            executor.execute { session ->
                attempts++
                if (attempts == 1) {
                    assertEquals(oldToken, session.accessToken)
                    // Concurrent rotation happened before first 401 returned
                    store.saveSession(makeSession(rotatedToken, "ndr_refresh_rotated_1234"))
                    throw DingtuApiException(401, "SESSION_INVALID", "old token expired")
                }
                assertEquals(rotatedToken, session.accessToken)
                // Second attempt ALSO returns 401 (device revoked on server) -> must clear local store!
                throw DingtuApiException(401, "SESSION_INVALID", "revoked")
            }
        }
        assertEquals(401, ex.statusCode)
        assertEquals(2, attempts)
        assertNull("Invalidated session must be cleared after second 401", store.readSession())
    }

    @Test
    fun second401DoesNotWipeStoreIfAnotherThreadRotatedToAnEvenNewerToken() {
        val store = InMemoryDeviceSessionStore()
        val tokenV1 = "nda_token_v1_1234567890"
        val tokenV2 = "nda_token_v2_1234567890"
        val tokenV3 = "nda_token_v3_1234567890"
        store.saveSession(makeSession(tokenV1, "ndr_refresh_v1_123456"))

        val client = DingtuControlClient(
            transport = { error("Should not hit refresh") },
            nowProvider = { fixedNow },
        )
        val executor = AuthenticatedSessionExecutor(
            sessionStore = store,
            controlClient = client,
            wallClockMillis = { fixedNow },
        )

        var attempts = 0
        assertThrows(DingtuApiException::class.java) {
            executor.execute { session ->
                attempts++
                if (attempts == 1) {
                    store.saveSession(makeSession(tokenV2, "ndr_refresh_v2_123456"))
                    throw DingtuApiException(401, "SESSION_INVALID", "v1 stale")
                }
                assertEquals(tokenV2, session.accessToken)
                // While v2 was in flight, another thread already persisted v3
                store.saveSession(makeSession(tokenV3, "ndr_refresh_v3_123456"))
                throw DingtuApiException(401, "SESSION_INVALID", "v2 stale")
            }
        }
        assertNotNull(store.readSession())
        assertEquals(tokenV3, store.readSession()?.accessToken)
    }
}

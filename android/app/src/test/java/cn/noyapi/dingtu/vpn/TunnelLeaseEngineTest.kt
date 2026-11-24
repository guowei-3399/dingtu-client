// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import cn.noyapi.dingtu.config.TunnelConfigVerifier
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.HttpResponseData
import cn.noyapi.dingtu.network.ProductionConfigClient
import cn.noyapi.dingtu.storage.InMemoryDeviceSessionStore
import cn.noyapi.dingtu.storage.StoredDeviceSession
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.time.Instant

class TunnelLeaseEngineTest {

    private class FakeMonotonicClock(var currentMs: Long = 100_000L) : MonotonicClock {
        override fun elapsedRealtimeMillis(): Long = currentMs
    }

    private class ManualLeaseScheduler(private val clock: FakeMonotonicClock) : LeaseTaskScheduler {
        data class Entry(
            val triggerAtMonoMs: Long,
            val action: () -> Unit,
            var cancelled: Boolean = false,
        )

        val queue = mutableListOf<Entry>()

        override fun scheduleAfterMillis(delayMillis: Long, action: () -> Unit): ScheduledTaskHandle {
            val entry = Entry(clock.currentMs + delayMillis.coerceAtLeast(0L), action)
            queue.add(entry)
            return object : ScheduledTaskHandle {
                override fun cancel() {
                    entry.cancelled = true
                }
            }
        }

        fun advanceBy(deltaMs: Long) {
            val target = clock.currentMs + deltaMs
            while (true) {
                val next = queue
                    .filter { !it.cancelled && it.triggerAtMonoMs <= target }
                    .minByOrNull { it.triggerAtMonoMs }
                    ?: break
                next.cancelled = true
                clock.currentMs = next.triggerAtMonoMs
                next.action()
            }
            clock.currentMs = target
        }

        override fun shutdown() {
            queue.forEach { it.cancelled = true }
            queue.clear()
        }
    }

    private class RecordingCoreAdapter(
        private val eventLog: MutableList<String> = mutableListOf(),
    ) : CoreTunnelAdapter {
        var tunOpen: Boolean = false
        var lastConfigJson: String? = null
        var lastRoutingPlan: EffectiveVpnApplicationPlan? = null
        var lastRegionLabel: String? = null
        var startReloadCalls: Int = 0
        var resetCalls: Int = 0
        var stopReasons = mutableListOf<String>()

        override fun startOrReload(
            closedLibboxConfigJson: String,
            routingPlan: EffectiveVpnApplicationPlan,
            regionLabel: String?,
        ) {
            tunOpen = true
            startReloadCalls++
            lastConfigJson = closedLibboxConfigJson
            lastRoutingPlan = routingPlan
            lastRegionLabel = regionLabel
            eventLog.add("START_OR_RELOAD:${routingPlan.mode.wireValue}")
        }

        override fun resetUnderlyingNetwork() {
            resetCalls++
            eventLog.add("RESET_NETWORK")
        }

        override fun stopAndReleaseTun(reason: String) {
            tunOpen = false
            stopReasons.add(reason)
            eventLog.add("STOP_TUN:$reason")
        }

        override fun isTunActive(): Boolean = tunOpen
    }

    private val signerSeed = ByteArray(32) { (0x31 + it).toByte() }
    private val signerPub = Ed25519Crypto.derivePublicKeyBytes(signerSeed)
    private val signerKeyId = Ed25519Crypto.computeKeyId(signerPub)
    private val trustAnchor = VerifiedTrustAnchor(
        origin = DingtuConstants.CONTROL_ORIGIN,
        keyId = signerKeyId,
        publicKeyBytes = signerPub,
        sha256Hex = Ed25519Crypto.sha256Hex(signerPub),
    )
    private val deviceId = "55555555-5555-4555-8555-555555555555"

    private fun makeSession(
        accessToken: String,
        refreshToken: String,
        accessExpiresAtMillis: Long,
    ) = StoredDeviceSession(
        deviceId = deviceId,
        platform = "android",
        appVersion = "0.1.0",
        status = "active",
        createdAt = "2026-11-23T01:00:00.000Z",
        accessToken = accessToken,
        accessExpiresAtMillis = accessExpiresAtMillis,
        refreshToken = refreshToken,
        refreshExpiresAt = "2026-12-23T01:00:00.000Z",
        scopes = listOf("customer.read", "tunnel.read", "device.revoke"),
    )

    private fun makeHandle(seq: Int): String =
        "pah_" + Ed25519Crypto.encodeBase64UrlNoPadding(ByteArray(32) { (seq + it).toByte() })

    private fun makeSignedEnvelopeBytes(
        handle: String,
        bindingRev: String,
        expiresAtIso: String,
        serverHost: String = "93.184.216.34",
    ): ByteArray {
        val configJson = """{"inbounds":[{"type":"mixed","listen":"127.0.0.1","listen_port":17899}],"outbounds":[{"type":"vless","tag":"noya-device","server":"$serverHost","server_port":28443,"uuid":"550e8400-e29b-41d4-a716-446655440000","tls":{"enabled":true,"server_name":"origin.noyapi.cn"}}],"route":{"final":"noya-device"}}"""
        val handleDigest = Ed25519Crypto.sha256HexUtf8(handle)
        val configRev = "cfg-${Ed25519Crypto.sha256HexUtf8(configJson)}"
        val signingInput = TunnelConfigVerifier.buildEnvelopeSigningInput(
            dataSource = "production",
            deviceId = deviceId,
            authorizationHandleDigest = handleDigest,
            bindingRevision = bindingRev,
            configRevision = configRev,
            expiresAt = expiresAtIso,
            signatureKeyId = signerKeyId,
            configJson = configJson,
        )
        val sig = Ed25519Crypto.signBase64Url(signerSeed, signingInput.toByteArray(StandardCharsets.UTF_8))
        return JSONObject()
            .put("data_source", "production")
            .put("deviceId", deviceId)
            .put("authorizationHandleDigest", handleDigest)
            .put("bindingRevision", bindingRev)
            .put("configRevision", configRev)
            .put("expiresAt", expiresAtIso)
            .put("config", configJson)
            .put("signature", JSONObject().put("keyId", signerKeyId).put("value", sig))
            .toString()
            .toByteArray(StandardCharsets.UTF_8)
    }

    @Test
    fun connectAnd8MinuteMonotonicRenewalAndLiveRoutingSwitchWorkSeamlessly() {
        var wallMs = Instant.parse("2026-11-23T02:00:00.000Z").toEpochMilli()
        val monoClock = FakeMonotonicClock(10_000L)
        val scheduler = ManualLeaseScheduler(monoClock)
        val core = RecordingCoreAdapter()
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore(VpnRoutingMode.PER_APP_VPN)
        sessionStore.saveSession(makeSession("nda_initial_access_token_1111", "ndr_initial_refresh_1111", wallMs + 600_000L))

        var authSeq = 0
        var refreshCalls = 0
        var currentHandle = makeHandle(1)

        val controlClient = DingtuControlClient(
            transport = { req ->
                when {
                    req.url.endsWith("/refresh") -> {
                        refreshCalls++
                        val body = JSONObject()
                            .put("device", JSONObject().put("id", deviceId).put("platform", "android").put("appVersion", "0.1.0").put("status", "active").put("createdAt", "2026-11-23T01:00:00.000Z"))
                            .put("session", JSONObject().put("accessToken", "nda_refreshed_token_$refreshCalls" + "_000000").put("expiresIn", 600).put("refreshToken", "ndr_refreshed_token_$refreshCalls" + "_000000").put("refreshExpiresAt", "2026-12-23T01:00:00.000Z").put("scope", JSONArray(listOf("customer.read", "tunnel.read", "device.revoke"))))
                        HttpResponseData(200, emptyMap(), body.toString().toByteArray())
                    }
                    req.url.endsWith("/tunnel/authorizations") -> {
                        authSeq++
                        currentHandle = makeHandle(authSeq)
                        val exp = Instant.ofEpochMilli(wallMs + 60_000L).toString()
                        HttpResponseData(201, emptyMap(), JSONObject().put("authorizationHandle", currentHandle).put("expiresAt", exp).toString().toByteArray())
                    }
                    req.url.endsWith("/tunnel/status") -> {
                        val exitCtx = JSONObject()
                            .put("countryCode", "US")
                            .put("timezone", "America/Los_Angeles")
                            .put("locale", "en-US")
                            .put("regionLabel", "US · Los Angeles")
                        HttpResponseData(200, emptyMap(), JSONObject().put("status", "running").put("exitContext", exitCtx).toString().toByteArray())
                    }
                    else -> error("Unexpected control call: ${req.url}")
                }
            },
            nowProvider = { wallMs },
        )

        val prodClient = ProductionConfigClient(
            transport = {
                val expIso = DateTimeHelper.formatUtcMs(wallMs + 600_000L)
                HttpResponseData(200, emptyMap(), makeSignedEnvelopeBytes(currentHandle, "binding-$authSeq", expIso))
            },
            nowProvider = { wallMs },
        )

        val engine = TunnelLeaseEngine(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            productionConfigClient = prodClient,
            trustAnchor = trustAnchor,
            coreAdapter = core,
            installedPackagesProvider = { setOf("com.openai.chatgpt", "com.android.chrome") },
            bootstrapDnsResolver = { listOf("93.184.216.34") },
            monotonicClock = monoClock,
            wallClockMillis = { wallMs },
            scheduler = scheduler,
            jitterMillisProvider = { 0L },
        )

        engine.connect()
        assertTrue(core.isTunActive())
        assertEquals(TunnelLifecycleState.CONNECTED, engine.statusFlow.value.state)
        assertEquals("binding-1", engine.statusFlow.value.bindingRevision)
        assertEquals("US · Los Angeles", engine.statusFlow.value.exitContext?.regionLabel)
        assertFalse(core.lastConfigJson!!.contains("\"direct\""))

        // Advance 8 minutes (480,000ms): triggers preemptive token refresh (<180s left) + renewal -> binding-2!
        wallMs += 480_000L
        scheduler.advanceBy(480_000L)
        assertEquals(1, refreshCalls)
        assertEquals(2, core.startReloadCalls)
        assertEquals("binding-2", engine.statusFlow.value.bindingRevision)
        assertTrue(core.isTunActive())

        // Live switch to GLOBAL_VPN without dropping TUN
        engine.updateRoutingConfiguration(VpnRoutingMode.GLOBAL_VPN)
        assertEquals(VpnRoutingMode.GLOBAL_VPN, core.lastRoutingPlan?.mode)
        assertEquals(setOf(DingtuConstants.APPLICATION_ID), core.lastRoutingPlan?.disallowedPackages)
        assertTrue(core.isTunActive())
    }

    @Test
    fun concurrent5msTokenRotationRaceDoesNotWipeNewlyRotatedSession() {
        val wallMs = Instant.parse("2026-11-23T02:00:00.000Z").toEpochMilli()
        val monoClock = FakeMonotonicClock(10_000L)
        val scheduler = ManualLeaseScheduler(monoClock)
        val core = RecordingCoreAdapter()
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore()

        val oldToken = "nda_old_stale_token_123456789"
        val rotatedFreshToken = "nda_fresh_rotated_token_987654321"
        sessionStore.saveSession(makeSession(oldToken, "ndr_refresh_11111111111111", wallMs + 500_000L))

        var refreshEndpointHit = 0
        val handle = makeHandle(7)

        val controlClient = DingtuControlClient(
            transport = { req ->
                when {
                    req.url.endsWith("/refresh") -> {
                        refreshEndpointHit++
                        error("Should not call refresh endpoint when store already has fresh rotated token!")
                    }
                    req.url.endsWith("/tunnel/authorizations") -> {
                        val bearer = req.headers["Authorization"]!!
                        if (bearer == "Bearer $oldToken") {
                            // Simulate another coroutine completing token rotation 5ms earlier!
                            sessionStore.saveSession(
                                makeSession(rotatedFreshToken, "ndr_refresh_22222222222222", wallMs + 600_000L)
                            )
                            HttpResponseData(
                                401,
                                emptyMap(),
                                """{"error":{"code":"SESSION_INVALID","message":"stale token","request_id":"req_race"}}""".toByteArray(),
                            )
                        } else {
                            assertEquals("Bearer $rotatedFreshToken", bearer)
                            HttpResponseData(
                                201,
                                emptyMap(),
                                JSONObject().put("authorizationHandle", handle).put("expiresAt", "2026-11-23T02:01:00.000Z").toString().toByteArray(),
                            )
                        }
                    }
                    req.url.endsWith("/tunnel/status") -> {
                        HttpResponseData(200, emptyMap(), """{"status":"running"}""".toByteArray())
                    }
                    else -> error("Unexpected URL: ${req.url}")
                }
            },
            nowProvider = { wallMs },
        )

        val prodClient = ProductionConfigClient(
            transport = {
                HttpResponseData(200, emptyMap(), makeSignedEnvelopeBytes(handle, "binding-5", DateTimeHelper.formatUtcMs(wallMs + 600_000L)))
            },
            nowProvider = { wallMs },
        )

        val engine = TunnelLeaseEngine(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            productionConfigClient = prodClient,
            trustAnchor = trustAnchor,
            coreAdapter = core,
            installedPackagesProvider = { setOf("com.openai.chatgpt") },
            bootstrapDnsResolver = { listOf("93.184.216.34") },
            monotonicClock = monoClock,
            wallClockMillis = { wallMs },
            scheduler = scheduler,
        )

        engine.connect()
        assertEquals(0, refreshEndpointHit)
        assertEquals(rotatedFreshToken, sessionStore.readSession()?.accessToken)
        assertEquals(TunnelLifecycleState.CONNECTED, engine.statusFlow.value.state)
        assertTrue(core.isTunActive())
    }

    @Test
    fun revocation403HardDeadlineRollbackAndUnexpectedCoreCrashTriggerImmediateFailClosed() {
        var wallMs = Instant.parse("2026-11-23T02:00:00.000Z").toEpochMilli()
        val monoClock = FakeMonotonicClock(50_000L)
        val scheduler = ManualLeaseScheduler(monoClock)
        val core = RecordingCoreAdapter()
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore()
        sessionStore.saveSession(makeSession("nda_valid_token_123456789", "ndr_valid_refresh_123456789", wallMs + 600_000L))

        var stopServiceCalls = 0
        var rejectNextAuth403 = false
        var failWith503 = false
        val handle = makeHandle(3)

        val controlClient = DingtuControlClient(
            transport = { req ->
                when {
                    req.url.endsWith("/tunnel/authorizations") -> {
                        when {
                            rejectNextAuth403 -> HttpResponseData(
                                403,
                                emptyMap(),
                                """{"error":{"code":"SUBSCRIPTION_DISABLED","message":"套餐已到期","request_id":"req_403"}}""".toByteArray(),
                            )
                            failWith503 -> HttpResponseData(
                                503,
                                emptyMap(),
                                """{"error":{"code":"BRIDGE_UNAVAILABLE","message":"桥暂不可用","request_id":"req_503"}}""".toByteArray(),
                            )
                            else -> HttpResponseData(
                                201,
                                emptyMap(),
                                JSONObject().put("authorizationHandle", handle).put("expiresAt", DateTimeHelper.formatUtcMs(wallMs + 60_000L)).toString().toByteArray(),
                            )
                        }
                    }
                    else -> HttpResponseData(200, emptyMap(), """{"status":"running"}""".toByteArray())
                }
            },
            nowProvider = { wallMs },
        )

        val prodClient = ProductionConfigClient(
            transport = {
                HttpResponseData(200, emptyMap(), makeSignedEnvelopeBytes(handle, "binding-1", DateTimeHelper.formatUtcMs(wallMs + 600_000L)))
            },
            nowProvider = { wallMs },
        )

        val engine = TunnelLeaseEngine(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            productionConfigClient = prodClient,
            trustAnchor = trustAnchor,
            coreAdapter = core,
            installedPackagesProvider = { setOf("com.openai.chatgpt") },
            bootstrapDnsResolver = { listOf("93.184.216.34") },
            monotonicClock = monoClock,
            wallClockMillis = { wallMs },
            scheduler = scheduler,
            jitterMillisProvider = { 0L },
            onServiceStopRequested = { stopServiceCalls++ },
        )

        // Case A: 403 SUBSCRIPTION_DISABLED on renewal immediately stops VPN & releases TUN
        engine.connect()
        assertTrue(core.isTunActive())
        rejectNextAuth403 = true
        engine.renewLeaseNow()
        assertFalse(core.isTunActive())
        assertEquals(TunnelLifecycleState.FAILED_CLOSED, engine.statusFlow.value.state)
        assertEquals("SUBSCRIPTION_DISABLED", engine.statusFlow.value.lastErrorCode)
        assertEquals(1, stopServiceCalls)

        // Case B: Wall clock rolled BACKWARD by 3 hours during 503 outage -> monotonic clock still cuts off within 600s!
        rejectNextAuth403 = false
        engine.connect()
        assertTrue(core.isTunActive())
        failWith503 = true
        wallMs -= 3 * 3600_000L // Malicious or NTP wall-clock rollback!
        scheduler.advanceBy(500_000L) // Transient 503 retry window still safely inside monotonic lease
        assertTrue(core.isTunActive())
        scheduler.advanceBy(100_001L) // Reaches monotonic cutoff despite 3-hour wall-clock rollback
        assertFalse(core.isTunActive())
        assertEquals(TunnelLifecycleState.FAILED_CLOSED, engine.statusFlow.value.state)
        assertTrue(
            engine.statusFlow.value.lastErrorCode in setOf("BRIDGE_UNAVAILABLE", "LEASE_HARD_DEADLINE_EXCEEDED")
        )

        // Case B2: Direct monotonic hard-deadline watchdog firing when wall clock is rolled back
        failWith503 = false
        wallMs = Instant.parse("2026-11-23T02:10:00.000Z").toEpochMilli()
        sessionStore.saveSession(makeSession("nda_valid_token_888888888", "ndr_valid_refresh_888888888", wallMs + 600_000L))
        engine.connect()
        assertTrue(core.isTunActive())
        // Cancel only the earlier renewal timer (simulating hung renewal network call) and roll back wall clock
        scheduler.queue.filter { !it.cancelled }.minByOrNull { it.triggerAtMonoMs }!!.cancelled = true
        wallMs -= 5 * 3600_000L
        scheduler.advanceBy(600_001L)
        assertFalse(core.isTunActive())
        assertEquals(TunnelLifecycleState.FAILED_CLOSED, engine.statusFlow.value.state)
        assertEquals("LEASE_HARD_DEADLINE_EXCEEDED", engine.statusFlow.value.lastErrorCode)

        // Case C: Unexpected libbox core crash immediately triggers fail-closed TUN release
        failWith503 = false
        wallMs = Instant.parse("2026-11-23T02:15:00.000Z").toEpochMilli()
        sessionStore.saveSession(makeSession("nda_valid_token_999999999", "ndr_valid_refresh_999999999", wallMs + 600_000L))
        engine.connect()
        assertTrue(core.isTunActive())
        engine.onUnexpectedCoreExit("LIBBOX_SERVICE_STOP")
        assertFalse(core.isTunActive())
        assertEquals(TunnelLifecycleState.FAILED_CLOSED, engine.statusFlow.value.state)
        assertEquals("LIBBOX_SERVICE_STOP", engine.statusFlow.value.lastErrorCode)

        // Case D: Service onDestroy() calling shutdown() after fail-closed must NOT erase FAILED_CLOSED or recovery banner
        val recoveryBeforeDestroy = engine.statusFlow.value.userRecoveryMessage
        assertTrue(!recoveryBeforeDestroy.isNullOrBlank())
        engine.shutdown()
        assertEquals(TunnelLifecycleState.FAILED_CLOSED, engine.statusFlow.value.state)
        assertEquals("LIBBOX_SERVICE_STOP", engine.statusFlow.value.lastErrorCode)
        assertEquals(recoveryBeforeDestroy, engine.statusFlow.value.userRecoveryMessage)
    }

    @Test
    fun networkSwitchResetsUnderlyingNetworkAndLogoutStrictlyStopsVpnBefore204RevokeAndWipe() {
        val wallMs = Instant.parse("2026-11-23T02:00:00.000Z").toEpochMilli()
        val monoClock = FakeMonotonicClock(10_000L)
        val scheduler = ManualLeaseScheduler(monoClock)
        val events = mutableListOf<String>()
        val core = RecordingCoreAdapter(events)
        val sessionStore = InMemoryDeviceSessionStore()
        val routingStore = InMemoryRoutingPreferencesStore()
        sessionStore.saveSession(makeSession("nda_logout_token_123456789", "ndr_logout_refresh_123456789", wallMs + 600_000L))

        val handle = makeHandle(9)
        val controlClient = DingtuControlClient(
            transport = { req ->
                when {
                    req.url.endsWith("/tunnel/authorizations") ->
                        HttpResponseData(201, emptyMap(), JSONObject().put("authorizationHandle", handle).put("expiresAt", DateTimeHelper.formatUtcMs(wallMs + 60_000L)).toString().toByteArray())
                    req.method == "DELETE" && req.url.endsWith("/api/v1/client/device/sessions/$deviceId") -> {
                        events.add("DELETE_SESSION_204")
                        HttpResponseData(204, emptyMap(), ByteArray(0))
                    }
                    else -> HttpResponseData(200, emptyMap(), """{"status":"running"}""".toByteArray())
                }
            },
            nowProvider = { wallMs },
        )
        val prodClient = ProductionConfigClient(
            transport = {
                HttpResponseData(200, emptyMap(), makeSignedEnvelopeBytes(handle, "binding-1", DateTimeHelper.formatUtcMs(wallMs + 600_000L)))
            },
            nowProvider = { wallMs },
        )

        val engine = TunnelLeaseEngine(
            sessionStore = sessionStore,
            routingStore = routingStore,
            controlClient = controlClient,
            productionConfigClient = prodClient,
            trustAnchor = trustAnchor,
            coreAdapter = core,
            installedPackagesProvider = { setOf("com.openai.chatgpt") },
            bootstrapDnsResolver = { listOf("93.184.216.34") },
            monotonicClock = monoClock,
            wallClockMillis = { wallMs },
            scheduler = scheduler,
        )

        engine.connect()
        engine.onUnderlyingNetworkChanged("101:wlan0")
        engine.onUnderlyingNetworkChanged("202:rmnet_data0")
        assertEquals(2, core.resetCalls)

        events.clear()
        engine.logoutAndRevoke()
        assertFalse(core.isTunActive())
        assertNull(sessionStore.readSession())
        assertEquals(listOf("STOP_TUN:USER_LOGOUT", "DELETE_SESSION_204"), events)
    }

    private object DateTimeHelper {
        private val fmt = java.time.format.DateTimeFormatter
            .ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .withZone(java.time.ZoneOffset.UTC)

        fun formatUtcMs(epochMs: Long): String = fmt.format(Instant.ofEpochMilli(epochMs))
    }
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.telemetry

import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.HttpRequestSpec
import cn.noyapi.dingtu.network.HttpResponseData
import cn.noyapi.dingtu.storage.InMemoryDeviceSessionStore
import cn.noyapi.dingtu.storage.StoredDeviceSession
import cn.noyapi.dingtu.vpn.LeaseTaskScheduler
import cn.noyapi.dingtu.vpn.ScheduledTaskHandle
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.time.Instant

class TelemetryReporterAndClientTest {

    private class RecordingScheduler : LeaseTaskScheduler {
        data class Entry(val delayMs: Long, val action: () -> Unit, var cancelled: Boolean = false)

        val scheduled = mutableListOf<Entry>()

        override fun scheduleAfterMillis(delayMillis: Long, action: () -> Unit): ScheduledTaskHandle {
            val entry = Entry(delayMillis, action)
            scheduled.add(entry)
            return object : ScheduledTaskHandle {
                override fun cancel() {
                    entry.cancelled = true
                }
            }
        }

        override fun shutdown() {
            scheduled.forEach { it.cancelled = true }
        }

        fun runLatestActive() {
            val active = scheduled.lastOrNull { !it.cancelled }
                ?: error("No active scheduled task")
            active.cancelled = true
            active.action()
        }
    }

    private fun seedActiveSession(store: InMemoryDeviceSessionStore, nowMs: Long) {
        store.saveSession(
            StoredDeviceSession(
                deviceId = "88888888-8888-4888-8888-888888888888",
                platform = "android",
                appVersion = DingtuConstants.APP_VERSION,
                status = "active",
                createdAt = Instant.ofEpochMilli(nowMs).toString(),
                accessToken = "nda_telemetry_valid_token_123456",
                accessExpiresAtMillis = nowMs + 600_000L,
                refreshToken = "ndr_telemetry_refresh_token_123456",
                refreshExpiresAt = Instant.ofEpochMilli(nowMs + 86_400_000L).toString(),
                scopes = listOf("tunnel.heartbeat", "tunnel.read"),
            )
        )
    }

    @Test
    fun allFourteenStagesAndDeterministicSha256FingerprintMatchContract() {
        val expectedStages = setOf(
            "pkce_login",
            "session_refresh",
            "tunnel_authorize",
            "tunnel_config_fetch",
            "config_verify",
            "core_start",
            "tun_setup",
            "dns_probe",
            "exit_probe",
            "lease_renew",
            "core_crash",
            "workbench_launch",
            "account_switch",
            "logout",
        )
        assertEquals(expectedStages, TelemetryStage.entries.map { it.wireValue }.toSet())

        val fp1 = TelemetryEventRecord.computeFingerprint(
            stage = TelemetryStage.TUNNEL_CONFIG_FETCH,
            errorCode = "CONFIG_SIGNATURE_INVALID",
            httpStatus = 502,
            normalizedAction = "tunnel_connect_failed",
        )
        val fp2 = TelemetryEventRecord.computeFingerprint(
            stage = TelemetryStage.TUNNEL_CONFIG_FETCH,
            errorCode = "CONFIG_SIGNATURE_INVALID",
            httpStatus = 502,
            normalizedAction = "TUNNEL_CONNECT_FAILED",
        )
        assertEquals(fp1, fp2)
        assertTrue("Fingerprint must be 64-char lowercase hex", Regex("^[a-f0-9]{64}$").matches(fp1))
    }

    @Test
    fun privacyGuardBlocksForbiddenKeysAndSecretTokenValues() {
        val forbiddenKeys = listOf("exitIp", "accessToken", "prompt", "proxy_password", "upstreamUrl", "cookie")
        for (key in forbiddenKeys) {
            val payload = JSONObject().put("events", org.json.JSONArray().put(JSONObject().put(key, "bad")))
            try {
                TelemetryPrivacyGuard.assertPayloadSafe(payload)
                fail("Expected privacy violation for forbidden key '$key'")
            } catch (expected: IllegalArgumentException) {
                assertTrue(expected.message!!.contains("TELEMETRY_PRIVACY_VIOLATION"))
            }
        }

        val tokenLeakPayload = JSONObject().put("action", "failed with nda_secret123456")
        try {
            TelemetryPrivacyGuard.assertPayloadSafe(tokenLeakPayload)
            fail("Expected privacy violation for secret token marker")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("TELEMETRY_PRIVACY_VIOLATION"))
        }

        assertNull(TelemetryPrivacyGuard.sanitizeRequestId("nda_leaked_token_12345"))
        assertEquals("client_event", TelemetryPrivacyGuard.sanitizeAction("vless://uuid@1.2.3.4:443"))
    }

    @Test
    fun syncTelemetryParsesBoth3KeyLegacyAnd4KeyLatencyResponsesCleanly() {
        val fixedNow = Instant.parse("2026-11-24T05:00:00.000Z").toEpochMilli()
        val capturedBodies = mutableListOf<JSONObject>()
        var callCount = 0

        val client = DingtuControlClient(
            transport = { req: HttpRequestSpec ->
                assertEquals("POST", req.method)
                assertTrue(req.url.endsWith("/api/v1/client/telemetry/sync"))
                assertEquals(DingtuConstants.HEADER_CLIENT_VALUE, req.headers[DingtuConstants.HEADER_CLIENT_NAME])
                assertEquals(DingtuConstants.HEADER_SCHEMA_VALUE, req.headers[DingtuConstants.HEADER_SCHEMA_NAME])
                capturedBodies.add(JSONObject(String(req.bodyBytes!!, StandardCharsets.UTF_8)))
                callCount++
                if (callCount == 1) {
                    // Legacy 3-key server response (events only)
                    HttpResponseData(
                        200,
                        emptyMap(),
                        """{"acceptedBuckets":0,"acceptedEvents":1,"syncedAt":"2026-11-24T05:00:01.000Z"}""".toByteArray(),
                    )
                } else {
                    // Wave 3A+ 4-key response (events + latencySamples)
                    HttpResponseData(
                        200,
                        emptyMap(),
                        """{"acceptedBuckets":0,"acceptedEvents":1,"acceptedLatencySamples":1,"syncedAt":"2026-11-24T05:00:02.000Z"}""".toByteArray(),
                    )
                }
            },
            nowProvider = { fixedNow },
        )

        val evt = TelemetryEventRecord.createSanitized(
            category = TelemetryCategory.TUNNEL,
            stage = TelemetryStage.CORE_START,
            action = "tunnel_connect_failed",
            status = TelemetryEventStatus.ERROR,
            severity = TelemetrySeverity.ERROR,
            occurredAtMillis = fixedNow,
            errorCode = "LIBBOX_START_FAILED",
            durationMs = 450L,
            retryable = true,
        )

        // 1) Without latencySamples -> must omit `latencySamples` key & accept 3-key response
        val res3 = client.syncTelemetry(
            accessToken = "nda_telemetry_valid_token_123456",
            reportedAtUtc = "2026-11-24T05:00:00.000Z",
            events = listOf(evt),
            latencySamples = emptyList(),
        )
        assertFalse(capturedBodies[0].has("latencySamples"))
        assertEquals(0, capturedBodies[0].getJSONArray("usageBuckets").length())
        assertEquals(1, res3.acceptedEvents)
        assertNull(res3.acceptedLatencySamples)

        // 2) With latencySamples -> must send `latencySamples` array & accept 4-key response
        val sample = LatencySampleRecord.createSanitized(
            trigger = LatencySampleTrigger.CONNECT,
            status = LatencySampleStatus.OK,
            sampledAtMillis = fixedNow,
            clientToOriginMs = 120L,
            dnsMs = 35L,
            totalMs = 540L,
        )
        val res4 = client.syncTelemetry(
            accessToken = "nda_telemetry_valid_token_123456",
            reportedAtUtc = "2026-11-24T05:00:00.000Z",
            events = listOf(evt),
            latencySamples = listOf(sample),
        )
        assertTrue(capturedBodies[1].has("latencySamples"))
        assertEquals(1, capturedBodies[1].getJSONArray("latencySamples").length())
        assertEquals(1, res4.acceptedEvents)
        assertEquals(1, res4.acceptedLatencySamples)
    }

    @Test
    fun reporterEnforcesRingBufferCapsDebounceAndExponentialBackoff() {
        var nowMs = Instant.parse("2026-11-24T05:00:00.000Z").toEpochMilli()
        val store = InMemoryDeviceSessionStore()
        seedActiveSession(store, nowMs)
        val scheduler = RecordingScheduler()

        var responseMode = "503"
        val sentBatches = mutableListOf<JSONObject>()

        val client = DingtuControlClient(
            transport = { req ->
                val body = JSONObject(String(req.bodyBytes!!, StandardCharsets.UTF_8))
                sentBatches.add(body)
                when (responseMode) {
                    "503" -> HttpResponseData(
                        503,
                        emptyMap(),
                        """{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"busy"}}""".toByteArray(),
                    )
                    "400" -> HttpResponseData(
                        400,
                        emptyMap(),
                        """{"error":{"code":"TELEMETRY_INVALID","message":"bad payload"}}""".toByteArray(),
                    )
                    else -> HttpResponseData(
                        200,
                        emptyMap(),
                        """{"acceptedBuckets":0,"acceptedEvents":${body.getJSONArray("events").length()},"acceptedLatencySamples":${body.optJSONArray("latencySamples")?.length() ?: 0},"syncedAt":"2026-11-24T05:02:00.000Z"}""".toByteArray(),
                    )
                }
            },
            nowProvider = { nowMs },
        )
        val executor = AuthenticatedSessionExecutor(store, client, wallClockMillis = { nowMs })
        val reporter = AndroidTelemetryReporter(
            sessionStore = store,
            sessionExecutor = executor,
            controlClient = client,
            wallClockMillis = { nowMs },
            scheduler = scheduler,
        )

        // 1) Ring buffer caps: insert 115 events and 70 latency samples -> capped at 100 and 60
        for (i in 1..115) {
            reporter.recordEvent(
                category = TelemetryCategory.TUNNEL,
                stage = TelemetryStage.TUNNEL_CONFIG_FETCH,
                action = "err_$i",
                status = TelemetryEventStatus.ERROR,
                severity = TelemetrySeverity.ERROR,
                errorCode = "ERR_$i",
            )
        }
        for (i in 1..70) {
            reporter.recordLatencySample(
                trigger = LatencySampleTrigger.PERIODIC,
                status = LatencySampleStatus.OK,
                totalMs = if (i == 70) 3200L else 180L,
            )
        }
        assertEquals(100 to 60, reporter.snapshotQueuedCounts())
        // Debounce: all 115 error events coalesced into ONE 30s scheduled flush
        assertEquals(1, scheduler.scheduled.size)
        assertEquals(AndroidTelemetryReporter.FAST_PUSH_DEBOUNCE_MS, scheduler.scheduled[0].delayMs)

        // 2) First flush hits 503 -> items re-queued and exponential backoff scheduled (30s)
        scheduler.runLatestActive()
        assertEquals(100 to 60, reporter.snapshotQueuedCounts())
        assertEquals(30_000L, scheduler.scheduled.last().delayMs)
        // Verify > 2500ms sample auto-upgraded to error_slow / degraded
        val lastSampleJson = sentBatches.last().getJSONArray("latencySamples").getJSONObject(59)
        assertEquals("error_slow", lastSampleJson.getString("trigger"))
        assertEquals("degraded", lastSampleJson.getString("status"))

        // 3) Second 503 -> exponential backoff doubles to 60s
        nowMs += 30_000L
        scheduler.runLatestActive()
        assertEquals(60_000L, scheduler.scheduled.last().delayMs)

        // 4) Third flush succeeds (200) -> ring buffer drained & counters updated
        responseMode = "200"
        nowMs += 60_000L
        scheduler.runLatestActive()
        assertEquals(0 to 0, reporter.snapshotQueuedCounts())
        assertEquals(100, reporter.summaryFlow.value.totalAcceptedEvents)
        assertEquals(60, reporter.summaryFlow.value.totalAcceptedLatencySamples)
        assertNotNull(reporter.summaryFlow.value.lastSyncedAtUtc)

        // 5) Validation error (400) drops poisoned batch cleanly without retry loop
        responseMode = "400"
        reporter.recordEvent(
            category = TelemetryCategory.DIAGNOSTIC,
            stage = TelemetryStage.DNS_PROBE,
            action = "poison_test",
            status = TelemetryEventStatus.ERROR,
            severity = TelemetrySeverity.ERROR,
        )
        val countBefore400 = scheduler.scheduled.size
        reporter.flushNowBestEffort()
        assertEquals(0 to 0, reporter.snapshotQueuedCounts())
        assertEquals(countBefore400, scheduler.scheduled.size)
    }
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.telemetry

import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.storage.DeviceSessionStore
import cn.noyapi.dingtu.vpn.ExecutorLeaseTaskScheduler
import cn.noyapi.dingtu.vpn.LeaseTaskScheduler
import cn.noyapi.dingtu.vpn.ScheduledTaskHandle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant
import java.util.concurrent.Executors

/**
 * Wave 4 (Master Contract v1.26 §20.2) non-blocking client telemetry reporter:
 * - 100-item event ring buffer + 60-item latency sample ring buffer;
 * - 30-second debounce fast-push on error/fatal events and connect/self_check/error_slow samples;
 * - Exponential backoff (30s -> 60s -> 120s -> 240s -> 480s -> 600s) on network/429/5xx failures;
 * - Strict privacy enforcement via `TelemetryPrivacyGuard` before dispatch;
 * - Never blocks or crashes VPN / UI paths.
 */
class AndroidTelemetryReporter(
    private val sessionStore: DeviceSessionStore,
    private val sessionExecutor: AuthenticatedSessionExecutor,
    private val controlClient: DingtuControlClient,
    private val wallClockMillis: () -> Long = System::currentTimeMillis,
    private val scheduler: LeaseTaskScheduler = ExecutorLeaseTaskScheduler(
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "dingtu-telemetry-sync").apply { isDaemon = true }
        }
    ),
) {
    private val lock = Any()
    private val eventBuffer = ArrayDeque<TelemetryEventRecord>(MAX_BUFFERED_EVENTS)
    private val latencyBuffer = ArrayDeque<LatencySampleRecord>(MAX_BUFFERED_LATENCY_SAMPLES)

    private var scheduledFlush: ScheduledTaskHandle? = null
    private var scheduledFlushTargetMillis: Long = Long.MAX_VALUE
    private var flushInFlight: Boolean = false
    private var consecutiveFailures: Int = 0
    private var totalAcceptedEvents: Int = 0
    private var totalAcceptedLatencySamples: Int = 0
    private var lastSyncedAtUtc: String? = null
    private var lastFailureCode: String? = null

    private val _summaryFlow = MutableStateFlow(TelemetryHealthSummary())
    val summaryFlow: StateFlow<TelemetryHealthSummary> = _summaryFlow.asStateFlow()

    fun recordEvent(
        category: TelemetryCategory,
        stage: TelemetryStage,
        action: String,
        status: TelemetryEventStatus,
        severity: TelemetrySeverity,
        errorCode: String? = null,
        requestId: String? = null,
        appId: String? = null,
        durationMs: Long? = null,
        httpStatus: Int? = null,
        retryable: Boolean? = null,
    ) {
        val record = TelemetryEventRecord.createSanitized(
            category = category,
            stage = stage,
            action = action,
            status = status,
            severity = severity,
            occurredAtMillis = wallClockMillis(),
            errorCode = errorCode,
            requestId = requestId,
            appId = appId,
            durationMs = durationMs,
            httpStatus = httpStatus,
            retryable = retryable,
        )
        val needsFastPush = severity == TelemetrySeverity.ERROR ||
            severity == TelemetrySeverity.FATAL ||
            status == TelemetryEventStatus.ERROR

        synchronized(lock) {
            if (eventBuffer.size >= MAX_BUFFERED_EVENTS) {
                eventBuffer.removeFirst()
            }
            eventBuffer.addLast(record)
            publishSummaryLocked()
            scheduleFlushLocked(
                delayMs = if (needsFastPush) FAST_PUSH_DEBOUNCE_MS else NORMAL_FLUSH_DEBOUNCE_MS,
            )
        }
    }

    fun recordLatencySample(
        trigger: LatencySampleTrigger,
        status: LatencySampleStatus,
        clientToOriginMs: Long? = null,
        dnsMs: Long? = null,
        e2eTtfbMs: Long? = null,
        totalMs: Long? = null,
        errorCode: String? = null,
        requestId: String? = null,
    ) {
        val effectiveTrigger = if (
            trigger != LatencySampleTrigger.ERROR_SLOW &&
            totalMs != null &&
            totalMs > SLOW_SAMPLE_THRESHOLD_MS
        ) {
            LatencySampleTrigger.ERROR_SLOW
        } else {
            trigger
        }
        val effectiveStatus = if (
            status == LatencySampleStatus.OK &&
            totalMs != null &&
            totalMs > SLOW_SAMPLE_THRESHOLD_MS
        ) {
            LatencySampleStatus.DEGRADED
        } else {
            status
        }

        val sample = LatencySampleRecord.createSanitized(
            trigger = effectiveTrigger,
            status = effectiveStatus,
            sampledAtMillis = wallClockMillis(),
            clientToOriginMs = clientToOriginMs,
            dnsMs = dnsMs,
            e2eTtfbMs = e2eTtfbMs,
            totalMs = totalMs,
            errorCode = errorCode,
            requestId = requestId,
        )
        val needsFastPush = effectiveTrigger == LatencySampleTrigger.CONNECT ||
            effectiveTrigger == LatencySampleTrigger.SELF_CHECK ||
            effectiveTrigger == LatencySampleTrigger.ERROR_SLOW ||
            effectiveStatus != LatencySampleStatus.OK

        synchronized(lock) {
            if (latencyBuffer.size >= MAX_BUFFERED_LATENCY_SAMPLES) {
                latencyBuffer.removeFirst()
            }
            latencyBuffer.addLast(sample)
            publishSummaryLocked()
            scheduleFlushLocked(
                delayMs = if (needsFastPush) FAST_PUSH_DEBOUNCE_MS else NORMAL_FLUSH_DEBOUNCE_MS,
            )
        }
    }

    /**
     * Triggers an immediate synchronous flush attempt (used before logout or in deterministic tests).
     * Never throws; returns `TelemetrySyncResult` when an HTTP upload succeeded, or `null` if skipped/failed.
     */
    fun flushNowBestEffort(): TelemetrySyncResult? {
        val batchEvents: List<TelemetryEventRecord>
        val batchSamples: List<LatencySampleRecord>

        synchronized(lock) {
            if (flushInFlight) return null
            if (eventBuffer.isEmpty() && latencyBuffer.isEmpty()) return null
            if (sessionStore.readSession() == null) {
                cancelScheduledFlushLocked()
                return null
            }

            cancelScheduledFlushLocked()
            flushInFlight = true
            batchEvents = ArrayList(eventBuffer)
            batchSamples = ArrayList(latencyBuffer)
            eventBuffer.clear()
            latencyBuffer.clear()
            publishSummaryLocked()
        }

        return try {
            val reportedAtUtc = Instant.ofEpochMilli(wallClockMillis()).toString()
            val result = sessionExecutor.execute { session ->
                controlClient.syncTelemetry(
                    accessToken = session.accessToken,
                    reportedAtUtc = reportedAtUtc,
                    events = batchEvents,
                    latencySamples = batchSamples,
                )
            }
            synchronized(lock) {
                flushInFlight = false
                consecutiveFailures = 0
                totalAcceptedEvents += result.acceptedEvents
                totalAcceptedLatencySamples += (result.acceptedLatencySamples ?: 0)
                lastSyncedAtUtc = result.syncedAt
                lastFailureCode = null
                publishSummaryLocked()
                if (eventBuffer.isNotEmpty() || latencyBuffer.isNotEmpty()) {
                    scheduleFlushLocked(FAST_PUSH_DEBOUNCE_MS)
                }
            }
            RedactedLogger.info(
                "Telemetry synced: events=${result.acceptedEvents}, latencySamples=${result.acceptedLatencySamples ?: 0}"
            )
            result
        } catch (err: Exception) {
            val apiErr = err as? DingtuApiException
            val statusCode = apiErr?.statusCode
            val errCode = TelemetryPrivacyGuard.sanitizeErrorCode(apiErr?.errorCode ?: err.javaClass.simpleName)
                ?: "TELEMETRY_SYNC_ERROR"

            synchronized(lock) {
                flushInFlight = false
                lastFailureCode = errCode

                val isValidationPoison = statusCode == 400 || statusCode == 422
                val isAuthInvalid = statusCode == 401 || statusCode == 403

                if (!isValidationPoison) {
                    requeueToFrontLocked(batchEvents, batchSamples)
                }

                if (!isValidationPoison && !isAuthInvalid && sessionStore.readSession() != null) {
                    consecutiveFailures = (consecutiveFailures + 1).coerceAtMost(10)
                    val backoffMs = computeBackoffDelayMs(consecutiveFailures)
                    scheduleFlushLocked(backoffMs)
                } else {
                    consecutiveFailures = 0
                    cancelScheduledFlushLocked()
                }
                publishSummaryLocked()
            }
            RedactedLogger.warn("Telemetry sync deferred ($errCode, status=${statusCode ?: -1})")
            null
        }
    }

    fun clearPendingOnLogout() {
        synchronized(lock) {
            cancelScheduledFlushLocked()
            eventBuffer.clear()
            latencyBuffer.clear()
            consecutiveFailures = 0
            publishSummaryLocked()
        }
    }

    fun snapshotQueuedCounts(): Pair<Int, Int> = synchronized(lock) {
        eventBuffer.size to latencyBuffer.size
    }

    private fun requeueToFrontLocked(
        failedEvents: List<TelemetryEventRecord>,
        failedSamples: List<LatencySampleRecord>,
    ) {
        if (failedEvents.isNotEmpty()) {
            val merged = (failedEvents + eventBuffer).takeLast(MAX_BUFFERED_EVENTS)
            eventBuffer.clear()
            eventBuffer.addAll(merged)
        }
        if (failedSamples.isNotEmpty()) {
            val merged = (failedSamples + latencyBuffer).takeLast(MAX_BUFFERED_LATENCY_SAMPLES)
            latencyBuffer.clear()
            latencyBuffer.addAll(merged)
        }
    }

    private fun scheduleFlushLocked(delayMs: Long) {
        if (sessionStore.readSession() == null) return
        val safeDelay = delayMs.coerceAtLeast(1_000L)
        val now = wallClockMillis()
        val desiredTarget = now + safeDelay

        // Debounce: keep an earlier scheduled flush, only tighten if a more urgent flush is requested.
        if (scheduledFlush != null && scheduledFlushTargetMillis <= desiredTarget) {
            return
        }
        cancelScheduledFlushLocked()
        scheduledFlushTargetMillis = desiredTarget
        scheduledFlush = scheduler.scheduleAfterMillis(safeDelay) {
            flushNowBestEffort()
        }
    }

    private fun cancelScheduledFlushLocked() {
        scheduledFlush?.cancel()
        scheduledFlush = null
        scheduledFlushTargetMillis = Long.MAX_VALUE
    }

    private fun publishSummaryLocked() {
        _summaryFlow.value = TelemetryHealthSummary(
            queuedEvents = eventBuffer.size,
            queuedLatencySamples = latencyBuffer.size,
            totalAcceptedEvents = totalAcceptedEvents,
            totalAcceptedLatencySamples = totalAcceptedLatencySamples,
            lastSyncedAtUtc = lastSyncedAtUtc,
            lastFailureCode = lastFailureCode,
        )
    }

    companion object {
        const val MAX_BUFFERED_EVENTS = 100
        const val MAX_BUFFERED_LATENCY_SAMPLES = 60
        const val FAST_PUSH_DEBOUNCE_MS = 30_000L
        const val NORMAL_FLUSH_DEBOUNCE_MS = 60_000L
        const val MAX_BACKOFF_MS = 600_000L
        const val SLOW_SAMPLE_THRESHOLD_MS = 2_500L

        fun computeBackoffDelayMs(attempt: Int): Long {
            val exp = (attempt - 1).coerceIn(0, 6)
            return (FAST_PUSH_DEBOUNCE_MS shl exp).coerceAtMost(MAX_BACKOFF_MS)
        }
    }
}

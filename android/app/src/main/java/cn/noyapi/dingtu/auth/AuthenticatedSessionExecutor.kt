// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.storage.DeviceSessionStore
import cn.noyapi.dingtu.storage.StoredDeviceSession

class AuthenticatedSessionExecutor(
    private val sessionStore: DeviceSessionStore,
    private val controlClient: DingtuControlClient,
    private val wallClockMillis: () -> Long = System::currentTimeMillis,
    private val onDiagnosticRecorded: (DingtuApiException) -> Unit = {},
    private val onSessionRefreshFailed: (DingtuApiException, Long) -> Unit = { _, _ -> },
) {
    private val refreshLock = Any()

    /**
     * Executes an authenticated operation with:
     * 1) Preemptive single-flight token refresh when `< 180s` remains;
     * 2) 5ms concurrent rotation guard: if `401` occurs after `sessionStore` already rotated
     *    to a newer `accessToken`, transparently retries once with the newer token without
     *    wiping the newly rotated session;
     * 3) Second-401 cleanup: if the retry also fails with `401` and `sessionStore` has not
     *    been concurrently updated to a newer token, wipes the invalid local session.
     */
    fun <T> execute(operation: (StoredDeviceSession) -> T): T {
        var session = sessionStore.readSession()
            ?: throw DingtuApiException(401, "SESSION_INVALID", "未登录设备会话，请先登录。")

        if (session.accessExpiresAtMillis - wallClockMillis() < PREEMPTIVE_REFRESH_THRESHOLD_MS) {
            session = refreshSingleFlight(expectedPreviousAccessToken = session.accessToken)
        }

        val usedAccessToken = session.accessToken
        return try {
            operation(session)
        } catch (firstErr: DingtuApiException) {
            onDiagnosticRecorded(firstErr)
            if (firstErr.statusCode != 401 || firstErr.errorCode in NON_RECOVERABLE_401_CODES) {
                if (firstErr.statusCode == 401 && firstErr.errorCode in NON_RECOVERABLE_401_CODES) {
                    wipeIfStillMatchingToken(usedAccessToken)
                }
                throw firstErr
            }

            val latestStored = sessionStore.readSession()
            val retrySession = if (latestStored != null && latestStored.accessToken != usedAccessToken) {
                latestStored
            } else {
                refreshSingleFlight(expectedPreviousAccessToken = usedAccessToken)
            }

            val retryUsedToken = retrySession.accessToken
            try {
                operation(retrySession)
            } catch (retryErr: DingtuApiException) {
                onDiagnosticRecorded(retryErr)
                if (retryErr.statusCode == 401) {
                    wipeIfStillMatchingToken(retryUsedToken)
                }
                throw retryErr
            }
        }
    }

    fun refreshSingleFlight(expectedPreviousAccessToken: String): StoredDeviceSession =
        synchronized(refreshLock) {
            val current = sessionStore.readSession()
                ?: throw DingtuApiException(401, "SESSION_INVALID", "设备会话不存在，请重新登录。")

            if (current.accessToken != expectedPreviousAccessToken &&
                current.accessExpiresAtMillis - wallClockMillis() >= MIN_FRESH_ROTATED_TOKEN_MS
            ) {
                return@synchronized current
            }

            val refreshStartMs = wallClockMillis()
            try {
                val rotated = controlClient.refreshDeviceSession(
                    deviceId = current.deviceId,
                    refreshToken = current.refreshToken,
                )
                sessionStore.saveSession(rotated)
                rotated
            } catch (err: DingtuApiException) {
                val elapsed = (wallClockMillis() - refreshStartMs).coerceAtLeast(0L)
                onDiagnosticRecorded(err)
                onSessionRefreshFailed(err, elapsed)
                if (err.statusCode == 401 || err.statusCode == 403) {
                    wipeIfStillMatchingToken(current.accessToken)
                }
                throw err
            }
        }

    /**
     * Standalone reliable logout entry that works whether or not `DingtuVpnService` was ever started:
     * 1) Invokes `stopTunnelAction` first to stop any active VPN & release TUN;
     * 2) Calls `DELETE /api/v1/client/device/sessions/{deviceId}` (`204`);
     * 3) Clears `sessionStore` unconditionally.
     */
    fun logoutReliably(stopTunnelAction: () -> Unit) {
        runCatching { stopTunnelAction() }.onFailure { err ->
            RedactedLogger.warn("Stop tunnel action warning during logout: ${err.message}")
        }
        val existing = sessionStore.readSession()
        try {
            if (existing != null) {
                runCatching {
                    controlClient.revokeDeviceSession(
                        deviceId = existing.deviceId,
                        accessToken = existing.accessToken,
                    )
                }.onFailure { err ->
                    RedactedLogger.warn("Remote session revoke non-204 during logout: ${err.message}")
                }
            }
        } finally {
            sessionStore.clearAll()
        }
    }

    private fun wipeIfStillMatchingToken(expectedToken: String) {
        synchronized(refreshLock) {
            val current = sessionStore.readSession()
            if (current != null && current.accessToken == expectedToken) {
                sessionStore.clearAll()
            }
        }
    }

    companion object {
        const val PREEMPTIVE_REFRESH_THRESHOLD_MS = 180_000L
        const val MIN_FRESH_ROTATED_TOKEN_MS = 30_000L

        private val NON_RECOVERABLE_401_CODES = setOf(
            "REFRESH_REPLAY",
            "REFRESH_INVALID",
            "ACCOUNT_DISABLED",
            "DEVICE_REVOKED",
        )
    }
}

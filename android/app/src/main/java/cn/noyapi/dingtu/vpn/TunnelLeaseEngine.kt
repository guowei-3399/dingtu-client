// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import cn.noyapi.dingtu.auth.AuthenticatedSessionExecutor
import cn.noyapi.dingtu.config.AndroidLibboxConfigBuilder
import cn.noyapi.dingtu.config.NetworkAddressPolicy
import cn.noyapi.dingtu.config.VerifiedProductionConfig
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.core.VpnRoutingMode
import cn.noyapi.dingtu.network.DingtuApiException
import cn.noyapi.dingtu.network.DingtuControlClient
import cn.noyapi.dingtu.network.ProductionConfigClient
import cn.noyapi.dingtu.storage.DeviceSessionStore
import cn.noyapi.dingtu.storage.StoredDeviceSession
import cn.noyapi.dingtu.telemetry.AndroidTelemetryReporter
import cn.noyapi.dingtu.telemetry.LatencySampleStatus
import cn.noyapi.dingtu.telemetry.LatencySampleTrigger
import cn.noyapi.dingtu.telemetry.TelemetryCategory
import cn.noyapi.dingtu.telemetry.TelemetryEventStatus
import cn.noyapi.dingtu.telemetry.TelemetrySeverity
import cn.noyapi.dingtu.telemetry.TelemetryStage
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.random.Random

class ExecutorLeaseTaskScheduler(
    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "dingtu-lease-scheduler").apply { isDaemon = true }
    }
) : LeaseTaskScheduler {
    override fun scheduleAfterMillis(delayMillis: Long, action: () -> Unit): ScheduledTaskHandle {
        val safeDelay = delayMillis.coerceAtLeast(0L)
        val future = executor.schedule(
            {
                runCatching { action() }.onFailure { err ->
                    RedactedLogger.error("Lease scheduled task failed", err)
                }
            },
            safeDelay,
            TimeUnit.MILLISECONDS,
        )
        return object : ScheduledTaskHandle {
            override fun cancel() {
                future.cancel(false)
            }
        }
    }

    override fun shutdown() {
        executor.shutdownNow()
    }
}

class TunnelLeaseEngine(
    private val sessionStore: DeviceSessionStore,
    private val routingStore: RoutingPreferencesStore,
    private val controlClient: DingtuControlClient,
    private val productionConfigClient: ProductionConfigClient,
    private val trustAnchor: VerifiedTrustAnchor,
    private val coreAdapter: CoreTunnelAdapter,
    private val installedPackagesProvider: () -> Set<String>,
    private val bootstrapDnsResolver: BootstrapDnsResolver,
    private val monotonicClock: MonotonicClock,
    private val wallClockMillis: () -> Long = System::currentTimeMillis,
    private val scheduler: LeaseTaskScheduler = ExecutorLeaseTaskScheduler(),
    private val jitterMillisProvider: () -> Long = { Random.nextLong(-15_000L, 15_001L) },
    private val onServiceStopRequested: (reasonCode: String) -> Unit = {},
    private val onStatusPublished: (TunnelStatusSnapshot) -> Unit = {},
    sessionExecutorOverride: AuthenticatedSessionExecutor? = null,
    private val telemetryReporter: AndroidTelemetryReporter? = null,
    private val periodicProbeDelayProvider: () -> Long = {
        Random.nextLong(PERIODIC_PROBE_MIN_MS, PERIODIC_PROBE_MAX_MS + 1L)
    },
) {
    private val stateLock = Any()
    private val sessionExecutor: AuthenticatedSessionExecutor =
        sessionExecutorOverride ?: AuthenticatedSessionExecutor(
            sessionStore = sessionStore,
            controlClient = controlClient,
            wallClockMillis = wallClockMillis,
            onDiagnosticRecorded = ::recordApiDiagnostic,
        )

    private var renewalTask: ScheduledTaskHandle? = null
    private var hardDeadlineTask: ScheduledTaskHandle? = null
    private var periodicProbeTask: ScheduledTaskHandle? = null

    private var activeVerifiedConfig: VerifiedProductionConfig? = null
    private var activeBootstrapIps: List<String> = emptyList()
    private var activeHardDeadlineMonoMs: Long = 0L
    private var activeExitContext: ExitContextMetadata? = null
    private var lastPhysicalNetworkKey: String? = null
    private var stoppingIntentionally: Boolean = false

    private val recentErrorCodes = ArrayDeque<String>(MAX_DIAGNOSTIC_ITEMS)
    private val recentRequestIds = ArrayDeque<String>(MAX_DIAGNOSTIC_ITEMS)

    private val _statusFlow = MutableStateFlow(
        TunnelStatusSnapshot(routingMode = routingStore.getRoutingMode())
    )
    val statusFlow: StateFlow<TunnelStatusSnapshot> = _statusFlow.asStateFlow()

    fun connect() {
        val connectStartMonoMs = monotonicClock.elapsedRealtimeMillis()
        synchronized(stateLock) {
            stoppingIntentionally = false
            updateStatusLocked(
                state = TunnelLifecycleState.CONNECTING,
                lastErrorCode = null,
                userRecoveryMessage = null,
            )
        }

        var currentStage = TelemetryStage.TUN_SETUP
        try {
            val routingPlan = resolveEffectiveRoutingPlan()
            currentStage = TelemetryStage.TUNNEL_AUTHORIZE
            val leaseBundle = acquireVerifiedLeaseConfig(onStage = { currentStage = it })
            val exitMeta = fetchOptionalExitContext()
            val regionLabel = exitMeta?.regionLabel

            synchronized(stateLock) {
                if (stoppingIntentionally) return
                currentStage = TelemetryStage.CORE_START
                coreAdapter.startOrReload(
                    closedLibboxConfigJson = leaseBundle.closedLibboxJson,
                    routingPlan = routingPlan,
                    regionLabel = regionLabel,
                )
                activeVerifiedConfig = leaseBundle.verifiedConfig
                activeBootstrapIps = leaseBundle.bootstrapIps
                activeHardDeadlineMonoMs = leaseBundle.hardDeadlineMonoMs
                activeExitContext = exitMeta
                scheduleLeaseTimersLocked(
                    issueMonoMs = leaseBundle.issueStartMonoMs,
                    hardDeadlineMonoMs = leaseBundle.hardDeadlineMonoMs,
                )
                schedulePeriodicProbeLocked()
                updateStatusLocked(
                    state = TunnelLifecycleState.CONNECTED,
                    routingMode = routingPlan.mode,
                    activePackageCount = routingPlan.allowedPackages.size,
                    bindingRevision = leaseBundle.verifiedConfig.bindingRevision,
                    configRevision = leaseBundle.verifiedConfig.configRevision,
                    leaseExpiresAtUtc = leaseBundle.verifiedConfig.expiresAt,
                    exitContext = exitMeta,
                    lastErrorCode = null,
                    userRecoveryMessage = null,
                )
            }
            val totalConnectMs = (monotonicClock.elapsedRealtimeMillis() - connectStartMonoMs).coerceAtLeast(1L)
            telemetryReporter?.recordLatencySample(
                trigger = LatencySampleTrigger.CONNECT,
                status = LatencySampleStatus.OK,
                clientToOriginMs = leaseBundle.authorizeDurationMs,
                dnsMs = leaseBundle.bootstrapDnsDurationMs,
                totalMs = totalConnectMs,
            )
        } catch (err: Exception) {
            val totalConnectMs = (monotonicClock.elapsedRealtimeMillis() - connectStartMonoMs).coerceAtLeast(1L)
            handleFatalOrConnectFailure(
                err = err,
                duringConnect = true,
                stage = refineFailureStage(currentStage, err),
                durationMs = totalConnectMs,
            )
        }
    }

    fun renewLeaseNow() {
        val renewStartMonoMs = monotonicClock.elapsedRealtimeMillis()
        val currentState = synchronized(stateLock) { _statusFlow.value.state }
        if (currentState != TunnelLifecycleState.CONNECTED && currentState != TunnelLifecycleState.RELOADING) {
            return
        }

        // Enforce monotonic hard deadline before attempting renewal.
        val nowMono = monotonicClock.elapsedRealtimeMillis()
        val expiredByMono = synchronized(stateLock) {
            activeHardDeadlineMonoMs in 1..nowMono
        }
        if (expiredByMono) {
            telemetryReporter?.recordEvent(
                category = TelemetryCategory.TUNNEL,
                stage = TelemetryStage.LEASE_RENEW,
                action = "lease_hard_deadline_exceeded",
                status = TelemetryEventStatus.ERROR,
                severity = TelemetrySeverity.ERROR,
                errorCode = "LEASE_HARD_DEADLINE_EXCEEDED",
                retryable = true,
            )
            stopVpnFailClosed(
                reasonCode = "LEASE_HARD_DEADLINE_EXCEEDED",
                userRecoveryMessage = "隧道租约已到达硬截止时间，已安全断开连接，请重新开启。",
            )
            return
        }

        try {
            val routingPlan = resolveEffectiveRoutingPlan()
            val leaseBundle = acquireVerifiedLeaseConfig()
            val exitMeta = fetchOptionalExitContext() ?: synchronized(stateLock) { activeExitContext }

            synchronized(stateLock) {
                if (stoppingIntentionally || _statusFlow.value.state == TunnelLifecycleState.DISCONNECTED) {
                    return
                }
                coreAdapter.startOrReload(
                    closedLibboxConfigJson = leaseBundle.closedLibboxJson,
                    routingPlan = routingPlan,
                    regionLabel = exitMeta?.regionLabel,
                )
                activeVerifiedConfig = leaseBundle.verifiedConfig
                activeBootstrapIps = leaseBundle.bootstrapIps
                activeHardDeadlineMonoMs = leaseBundle.hardDeadlineMonoMs
                activeExitContext = exitMeta
                scheduleLeaseTimersLocked(
                    issueMonoMs = leaseBundle.issueStartMonoMs,
                    hardDeadlineMonoMs = leaseBundle.hardDeadlineMonoMs,
                )
                schedulePeriodicProbeLocked()
                updateStatusLocked(
                    state = TunnelLifecycleState.CONNECTED,
                    routingMode = routingPlan.mode,
                    activePackageCount = routingPlan.allowedPackages.size,
                    bindingRevision = leaseBundle.verifiedConfig.bindingRevision,
                    configRevision = leaseBundle.verifiedConfig.configRevision,
                    leaseExpiresAtUtc = leaseBundle.verifiedConfig.expiresAt,
                    exitContext = exitMeta,
                    lastErrorCode = null,
                    userRecoveryMessage = null,
                )
            }
        } catch (err: Exception) {
            val elapsedMs = (monotonicClock.elapsedRealtimeMillis() - renewStartMonoMs).coerceAtLeast(1L)
            handleRenewalFailure(err, elapsedMs)
        }
    }

    fun updateRoutingConfiguration(
        newMode: VpnRoutingMode,
        selectedPackages: Set<String>? = null,
    ) {
        routingStore.setRoutingMode(newMode)
        if (selectedPackages != null) {
            routingStore.setSelectedPackages(selectedPackages)
        }

        val shouldReloadLive = synchronized(stateLock) {
            val active = _statusFlow.value.state == TunnelLifecycleState.CONNECTED
            if (!active) {
                updateStatusLocked(routingMode = newMode)
            }
            active
        }
        if (!shouldReloadLive) return

        try {
            val newPlan = resolveEffectiveRoutingPlan()
            synchronized(stateLock) {
                val verified = activeVerifiedConfig
                    ?: throw IllegalStateException("MISSING_VERIFIED_CONFIG")
                val nowMono = monotonicClock.elapsedRealtimeMillis()
                if (activeHardDeadlineMonoMs in 1..nowMono) {
                    throw IllegalStateException("LEASE_HARD_DEADLINE_EXCEEDED")
                }
                updateStatusLocked(state = TunnelLifecycleState.RELOADING, routingMode = newPlan.mode)
                val closedJson = AndroidLibboxConfigBuilder.buildClosedConfigJson(
                    verified = verified,
                    resolvedBootstrapIps = activeBootstrapIps,
                )
                coreAdapter.startOrReload(
                    closedLibboxConfigJson = closedJson,
                    routingPlan = newPlan,
                    regionLabel = activeExitContext?.regionLabel,
                )
                updateStatusLocked(
                    state = TunnelLifecycleState.CONNECTED,
                    routingMode = newPlan.mode,
                    activePackageCount = newPlan.allowedPackages.size,
                )
            }
        } catch (err: Exception) {
            val code = when (err) {
                is VpnRoutingException -> err.errorCode
                else -> "ROUTING_RELOAD_FAILED"
            }
            stopVpnFailClosed(
                reasonCode = code,
                userRecoveryMessage = err.message ?: "切换分流模式失败，已自动断开保护流量。",
            )
        }
    }

    fun onUnderlyingNetworkChanged(networkKey: String?) {
        val (shouldReset, shouldRenewSoon) = synchronized(stateLock) {
            val isConnected = _statusFlow.value.state == TunnelLifecycleState.CONNECTED
            val changed = networkKey != null && networkKey != lastPhysicalNetworkKey
            lastPhysicalNetworkKey = networkKey
            val remainingMs = activeHardDeadlineMonoMs - monotonicClock.elapsedRealtimeMillis()
            Pair(isConnected && changed, isConnected && changed && remainingMs < 120_000L)
        }
        if (!shouldReset) return

        try {
            coreAdapter.resetUnderlyingNetwork()
            if (shouldRenewSoon) {
                renewLeaseNow()
            }
        } catch (err: Exception) {
            RedactedLogger.error("Underlying network reset failed", err)
            stopVpnFailClosed(
                reasonCode = "NETWORK_SWITCH_RESET_FAILED",
                userRecoveryMessage = "网络切换重连异常，已安全断开隧道。",
            )
        }
    }

    fun onUnexpectedCoreExit(reasonCode: String = "LIBBOX_UNEXPECTED_EXIT") {
        val shouldFailClosed = synchronized(stateLock) {
            !stoppingIntentionally &&
                _statusFlow.value.state != TunnelLifecycleState.DISCONNECTED &&
                _statusFlow.value.state != TunnelLifecycleState.FAILED_CLOSED
        }
        if (shouldFailClosed) {
            telemetryReporter?.recordEvent(
                category = TelemetryCategory.TUNNEL,
                stage = TelemetryStage.CORE_CRASH,
                action = "libbox_unexpected_exit",
                status = TelemetryEventStatus.ERROR,
                severity = TelemetrySeverity.FATAL,
                errorCode = reasonCode,
                retryable = true,
            )
            stopVpnFailClosed(
                reasonCode = reasonCode,
                userRecoveryMessage = "隧道核心异常退出，已立即阻断保护受管应用不走直连。",
            )
        }
    }

    fun disconnectGracefully(reason: String = "USER_DISCONNECT") {
        synchronized(stateLock) {
            stoppingIntentionally = true
            cancelTimersLocked()
            activeVerifiedConfig = null
            activeBootstrapIps = emptyList()
            activeHardDeadlineMonoMs = 0L
            updateStatusLocked(state = TunnelLifecycleState.DISCONNECTING)
            runCatching { coreAdapter.stopAndReleaseTun(reason) }
            updateStatusLocked(
                state = TunnelLifecycleState.DISCONNECTED,
                activePackageCount = 0,
                bindingRevision = null,
                configRevision = null,
                leaseExpiresAtUtc = null,
                lastErrorCode = null,
                userRecoveryMessage = null,
            )
        }
        onServiceStopRequested(reason)
    }

    fun stopVpnFailClosed(
        reasonCode: String,
        userRecoveryMessage: String,
    ) {
        synchronized(stateLock) {
            stoppingIntentionally = true
            cancelTimersLocked()
            activeVerifiedConfig = null
            activeBootstrapIps = emptyList()
            activeHardDeadlineMonoMs = 0L
            recordErrorCodeLocked(reasonCode)
            runCatching { coreAdapter.stopAndReleaseTun(reasonCode) }
            updateStatusLocked(
                state = TunnelLifecycleState.FAILED_CLOSED,
                activePackageCount = 0,
                bindingRevision = null,
                configRevision = null,
                leaseExpiresAtUtc = null,
                lastErrorCode = reasonCode,
                userRecoveryMessage = RedactedLogger.redact(userRecoveryMessage),
            )
        }
        onServiceStopRequested(reasonCode)
    }

    /**
     * Strict logout sequence:
     * 1) Stop VPN & release TUN fd immediately;
     * 2) Revoke server device session (`DELETE /api/v1/client/device/sessions/{id}` -> `204`);
     * 3) Clear local Keystore EncryptedSharedPreferences session & device seed.
     */
    fun logoutAndRevoke() {
        sessionExecutor.logoutReliably(
            stopTunnelAction = { disconnectGracefully("USER_LOGOUT") }
        )
    }

    fun shutdown() {
        synchronized(stateLock) {
            stoppingIntentionally = true
            cancelTimersLocked()
            activeVerifiedConfig = null
            activeBootstrapIps = emptyList()
            activeHardDeadlineMonoMs = 0L
            runCatching { coreAdapter.stopAndReleaseTun("ENGINE_SHUTDOWN") }
            if (_statusFlow.value.state != TunnelLifecycleState.FAILED_CLOSED) {
                updateStatusLocked(
                    state = TunnelLifecycleState.DISCONNECTED,
                    activePackageCount = 0,
                    bindingRevision = null,
                    configRevision = null,
                    leaseExpiresAtUtc = null,
                    lastErrorCode = null,
                    userRecoveryMessage = null,
                )
            }
        }
        scheduler.shutdown()
    }

    private data class AcquiredLeaseBundle(
        val verifiedConfig: VerifiedProductionConfig,
        val bootstrapIps: List<String>,
        val closedLibboxJson: String,
        val issueStartMonoMs: Long,
        val hardDeadlineMonoMs: Long,
        val authorizeDurationMs: Long,
        val bootstrapDnsDurationMs: Long?,
    )

    private fun acquireVerifiedLeaseConfig(
        onStage: (TelemetryStage) -> Unit = {},
    ): AcquiredLeaseBundle {
        val issueStartMonoMs = monotonicClock.elapsedRealtimeMillis()

        onStage(TelemetryStage.TUNNEL_AUTHORIZE)
        val authStartMono = monotonicClock.elapsedRealtimeMillis()
        val grant = executeAuthenticatedWithRotationGuard { session ->
            controlClient.issueTunnelAuthorization(session.accessToken)
        }
        val authorizeDurationMs = (monotonicClock.elapsedRealtimeMillis() - authStartMono).coerceAtLeast(1L)

        val currentSession = sessionStore.readSession()
            ?: throw DingtuApiException(401, "SESSION_INVALID", "登录状态已失效，请重新登录。")

        onStage(TelemetryStage.TUNNEL_CONFIG_FETCH)
        val seed = sessionStore.getOrCreateDeviceKeySeed()
        val verifiedConfig = try {
            productionConfigClient.fetchAndVerifyTunnelConfig(
                deviceId = currentSession.deviceId,
                deviceSeed32 = seed,
                authorizationHandle = grant.authorizationHandle,
                trustAnchor = trustAnchor,
            )
        } finally {
            seed.fill(0)
        }

        onStage(TelemetryStage.CONFIG_VERIFY)
        val wallAfterVerify = wallClockMillis()
        val conservativeRemainingMs = (verifiedConfig.expiresAtMillis - wallAfterVerify)
            .coerceAtMost(MAX_SERVER_LEASE_MS)
        if (conservativeRemainingMs <= 0L) {
            throw DingtuApiException(401, "CONFIG_EXPIRED", "签发配置剩余有效期不足。")
        }
        val hardDeadlineMonoMs = issueStartMonoMs + conservativeRemainingMs

        var bootstrapDnsDurationMs: Long? = null
        val bootstrapIps = when {
            NetworkAddressPolicy.isIpLiteral(verifiedConfig.outboundServer) ->
                listOf(verifiedConfig.outboundServer)
            verifiedConfig.signedBootstrapIps.isNotEmpty() ->
                verifiedConfig.signedBootstrapIps
            else -> {
                onStage(TelemetryStage.DNS_PROBE)
                val dnsStartMono = monotonicClock.elapsedRealtimeMillis()
                val resolved = bootstrapDnsResolver
                    .resolvePublicUnicastIps(verifiedConfig.outboundServer)
                    .filter(NetworkAddressPolicy::isPublicUnicastIp)
                    .distinct()
                    .take(4)
                bootstrapDnsDurationMs = (monotonicClock.elapsedRealtimeMillis() - dnsStartMono).coerceAtLeast(1L)
                if (resolved.isEmpty()) {
                    throw DingtuApiException(
                        503,
                        "BOOTSTRAP_DNS_UNAVAILABLE",
                        "无法将独享入口解析为有效公网 IP。",
                    )
                }
                resolved
            }
        }

        onStage(TelemetryStage.CONFIG_VERIFY)
        val closedJson = AndroidLibboxConfigBuilder.buildClosedConfigJson(
            verified = verifiedConfig,
            resolvedBootstrapIps = bootstrapIps,
        )

        return AcquiredLeaseBundle(
            verifiedConfig = verifiedConfig,
            bootstrapIps = bootstrapIps,
            closedLibboxJson = closedJson,
            issueStartMonoMs = issueStartMonoMs,
            hardDeadlineMonoMs = hardDeadlineMonoMs,
            authorizeDurationMs = authorizeDurationMs,
            bootstrapDnsDurationMs = bootstrapDnsDurationMs,
        )
    }

    /**
     * Single-flight refresh & 5ms concurrent token-rotation guard:
     * - Proactively refreshes accessToken if `< 180s` remaining.
     * - Binds request to `usedAccessToken`; if a `401` arrives after another thread already
     *   rotated `sessionStore` to a newer `accessToken`, retries transparently once with the
     *   new token and NEVER wipes the newly rotated session.
     */
    internal fun <T> executeAuthenticatedWithRotationGuard(
        operation: (StoredDeviceSession) -> T,
    ): T = sessionExecutor.execute(operation)

    private fun fetchOptionalExitContext(): ExitContextMetadata? =
        runCatching {
            executeAuthenticatedWithRotationGuard { session ->
                val statusJson = controlClient.getTunnelStatus(session.accessToken)
                parseExitContext(statusJson.optJSONObject("exitContext"))
            }
        }.getOrNull()

    private fun parseExitContext(exitObj: JSONObject?): ExitContextMetadata? {
        if (exitObj == null) return null
        val countryCode = exitObj.optString("countryCode", "").trim()
        val timezone = exitObj.optString("timezone", "").trim()
        val locale = exitObj.optString("locale", "").trim()
        val regionLabel = exitObj.optString("regionLabel", "").trim()
        if (countryCode.isEmpty() || regionLabel.isEmpty()) return null
        return ExitContextMetadata(
            countryCode = countryCode,
            timezone = timezone,
            locale = locale,
            regionLabel = regionLabel,
        )
    }

    private fun resolveEffectiveRoutingPlan(): EffectiveVpnApplicationPlan {
        val mode = routingStore.getRoutingMode()
        val explicit = routingStore.hasExplicitSelection()
        val selected = routingStore.getSelectedPackages()
        val installed = installedPackagesProvider()
        return VpnRoutingPolicy.computeEffectivePlan(
            mode = mode,
            userSelectedPackages = selected,
            hasExplicitUserSelection = explicit,
            installedPackages = installed,
            selfPackageName = DingtuConstants.APPLICATION_ID,
        )
    }

    private fun scheduleLeaseTimersLocked(issueMonoMs: Long, hardDeadlineMonoMs: Long) {
        cancelTimersLocked()
        val nowMono = monotonicClock.elapsedRealtimeMillis()
        val hardDelayMs = (hardDeadlineMonoMs - nowMono).coerceAtLeast(1L)

        // Independent conservative monotonic hard-deadline cutoff.
        hardDeadlineTask = scheduler.scheduleAfterMillis(hardDelayMs) {
            val stillPastDeadline = synchronized(stateLock) {
                !stoppingIntentionally &&
                    activeHardDeadlineMonoMs > 0L &&
                    monotonicClock.elapsedRealtimeMillis() >= activeHardDeadlineMonoMs
            }
            if (stillPastDeadline) {
                stopVpnFailClosed(
                    reasonCode = "LEASE_HARD_DEADLINE_EXCEEDED",
                    userRecoveryMessage = "隧道租约到期且未能完成续签，已自动断开避免直连泄漏。",
                )
            }
        }

        // Target 8 minutes ± jitter, bounded strictly by (hardDeadline - 90s).
        val targetRenewMono = (issueMonoMs + DEFAULT_RENEW_INTERVAL_MS + jitterMillisProvider())
            .coerceAtMost(hardDeadlineMonoMs - RENEW_SAFETY_LEAD_MS)
        val renewDelayMs = (targetRenewMono - nowMono).coerceAtLeast(MIN_RENEW_DELAY_MS)
            .coerceAtMost((hardDelayMs - 1_000L).coerceAtLeast(1L))

        renewalTask = scheduler.scheduleAfterMillis(renewDelayMs) {
            renewLeaseNow()
        }
    }

    private fun schedulePeriodicProbeLocked() {
        periodicProbeTask?.cancel()
        periodicProbeTask = null
        if (telemetryReporter == null) return
        val delayMs = periodicProbeDelayProvider().coerceAtLeast(30_000L)
        periodicProbeTask = scheduler.scheduleAfterMillis(delayMs) {
            runPeriodicLatencyProbe()
        }
    }

    private fun runPeriodicLatencyProbe() {
        val stillConnected = synchronized(stateLock) {
            !stoppingIntentionally && _statusFlow.value.state == TunnelLifecycleState.CONNECTED
        }
        if (!stillConnected) return

        val startMono = monotonicClock.elapsedRealtimeMillis()
        try {
            executeAuthenticatedWithRotationGuard { session ->
                controlClient.getTunnelStatus(session.accessToken)
            }
            val elapsedMs = (monotonicClock.elapsedRealtimeMillis() - startMono).coerceAtLeast(1L)
            telemetryReporter?.recordLatencySample(
                trigger = LatencySampleTrigger.PERIODIC,
                status = LatencySampleStatus.OK,
                clientToOriginMs = elapsedMs,
                totalMs = elapsedMs,
            )
        } catch (err: Exception) {
            val elapsedMs = (monotonicClock.elapsedRealtimeMillis() - startMono).coerceAtLeast(1L)
            val apiErr = err as? DingtuApiException
            telemetryReporter?.recordLatencySample(
                trigger = LatencySampleTrigger.PERIODIC,
                status = if (apiErr?.statusCode == 504 || err is java.net.SocketTimeoutException) {
                    LatencySampleStatus.TIMEOUT
                } else {
                    LatencySampleStatus.ERROR
                },
                totalMs = elapsedMs,
                errorCode = apiErr?.errorCode ?: "PERIODIC_PROBE_FAILED",
                requestId = apiErr?.requestId,
            )
        } finally {
            synchronized(stateLock) {
                if (!stoppingIntentionally && _statusFlow.value.state == TunnelLifecycleState.CONNECTED) {
                    schedulePeriodicProbeLocked()
                }
            }
        }
    }

    private fun handleFatalOrConnectFailure(
        err: Exception,
        duringConnect: Boolean,
        stage: TelemetryStage = TelemetryStage.CORE_START,
        durationMs: Long? = null,
    ) {
        val (code, msg) = classifyFailure(err)
        val apiErr = err as? DingtuApiException
        telemetryReporter?.recordEvent(
            category = TelemetryCategory.TUNNEL,
            stage = stage,
            action = if (duringConnect) "tunnel_connect_failed" else "tunnel_fatal_error",
            status = TelemetryEventStatus.ERROR,
            severity = TelemetrySeverity.ERROR,
            errorCode = code,
            requestId = apiErr?.requestId,
            durationMs = durationMs,
            httpStatus = apiErr?.statusCode,
            retryable = apiErr == null || apiErr.statusCode >= 500 || apiErr.statusCode == 429,
        )
        if (duringConnect && durationMs != null) {
            telemetryReporter?.recordLatencySample(
                trigger = LatencySampleTrigger.CONNECT,
                status = LatencySampleStatus.ERROR,
                totalMs = durationMs,
                errorCode = code,
                requestId = apiErr?.requestId,
            )
        }
        RedactedLogger.error("Tunnel connect failure ($code)", err)
        stopVpnFailClosed(
            reasonCode = code,
            userRecoveryMessage = if (duringConnect) msg else "隧道状态异常（$code），已安全断开。",
        )
    }

    private fun handleRenewalFailure(err: Exception, durationMs: Long? = null) {
        val (code, msg) = classifyFailure(err)
        val apiErr = err as? DingtuApiException
        RedactedLogger.error("Tunnel renewal failure ($code)", err)

        // Immediate cutoff on 401/403 revocation, subscription disabled, routing error, or expired hard deadline.
        val isAuthOrPolicyRevoked = when (err) {
            is DingtuApiException -> err.statusCode == 401 || err.statusCode == 403
            is VpnRoutingException -> true
            else -> false
        }
        val nowMono = monotonicClock.elapsedRealtimeMillis()
        val remainingMonoMs = synchronized(stateLock) { activeHardDeadlineMonoMs - nowMono }

        telemetryReporter?.recordEvent(
            category = TelemetryCategory.TUNNEL,
            stage = TelemetryStage.LEASE_RENEW,
            action = if (isAuthOrPolicyRevoked) "lease_renew_revoked" else "lease_renew_failed",
            status = TelemetryEventStatus.ERROR,
            severity = if (isAuthOrPolicyRevoked || remainingMonoMs <= TRANSIENT_RETRY_MIN_REMAINING_MS) {
                TelemetrySeverity.ERROR
            } else {
                TelemetrySeverity.WARN
            },
            errorCode = code,
            requestId = apiErr?.requestId,
            durationMs = durationMs,
            httpStatus = apiErr?.statusCode,
            retryable = !isAuthOrPolicyRevoked,
        )

        if (isAuthOrPolicyRevoked || remainingMonoMs <= TRANSIENT_RETRY_MIN_REMAINING_MS) {
            stopVpnFailClosed(reasonCode = code, userRecoveryMessage = msg)
            return
        }

        // Transient 503/network glitch while still safely within valid monotonic lease: retry before hard deadline!
        synchronized(stateLock) {
            recordErrorCodeLocked(code)
            renewalTask?.cancel()
            val retryDelay = TRANSIENT_RENEW_RETRY_MS.coerceAtMost((remainingMonoMs / 2).coerceAtLeast(1_000L))
            renewalTask = scheduler.scheduleAfterMillis(retryDelay) {
                renewLeaseNow()
            }
        }
    }

    private fun refineFailureStage(fallback: TelemetryStage, err: Exception): TelemetryStage {
        if (err is VpnRoutingException) return TelemetryStage.TUN_SETUP
        val apiCode = (err as? DingtuApiException)?.errorCode?.uppercase().orEmpty()
        return when {
            apiCode.contains("SIGNATURE") || apiCode.contains("TRUST") || apiCode.contains("CLOSED_GRAPH") ||
                apiCode.contains("CONFIG_EXPIRED") || apiCode.contains("CONFIG_SCHEMA") -> TelemetryStage.CONFIG_VERIFY
            apiCode.contains("DNS") -> TelemetryStage.DNS_PROBE
            else -> fallback
        }
    }

    private fun classifyFailure(err: Exception): Pair<String, String> = when (err) {
        is VpnRoutingException -> err.errorCode to err.message
        is DingtuApiException -> {
            recordApiDiagnostic(err)
            val recovery = when (err.statusCode) {
                401 -> "登录授权已失效或已在其他终端登录，请重新授权登录。（${err.errorCode}）"
                403 -> "当前套餐权益或设备权限不可用（${err.errorCode}），已停止隧道。"
                else -> "${err.message}（${err.errorCode}）"
            }
            err.errorCode to recovery
        }
        else -> {
            val code = err.message?.takeIf { it.matches(Regex("^[A-Z0-9_]{3,64}$")) }
                ?: "TUNNEL_CORE_FAILURE"
            code to "隧道核心运行异常，已安全停止避免直连泄漏。"
        }
    }

    private fun recordApiDiagnostic(err: DingtuApiException) {
        synchronized(stateLock) {
            recordErrorCodeLocked(err.errorCode)
            err.requestId?.takeIf { it.isNotBlank() }?.let { reqId ->
                if (recentRequestIds.lastOrNull() != reqId) {
                    if (recentRequestIds.size >= MAX_DIAGNOSTIC_ITEMS) recentRequestIds.removeFirst()
                    recentRequestIds.addLast(reqId)
                }
            }
        }
    }

    private fun recordErrorCodeLocked(code: String) {
        val safeCode = code.replace(Regex("[^A-Z0-9_.-]"), "_").take(64)
        if (safeCode.isNotEmpty() && recentErrorCodes.lastOrNull() != safeCode) {
            if (recentErrorCodes.size >= MAX_DIAGNOSTIC_ITEMS) recentErrorCodes.removeFirst()
            recentErrorCodes.addLast(safeCode)
        }
    }

    private fun cancelTimersLocked() {
        renewalTask?.cancel()
        renewalTask = null
        hardDeadlineTask?.cancel()
        hardDeadlineTask = null
        periodicProbeTask?.cancel()
        periodicProbeTask = null
    }

    private fun updateStatusLocked(
        state: TunnelLifecycleState = _statusFlow.value.state,
        routingMode: VpnRoutingMode = _statusFlow.value.routingMode,
        activePackageCount: Int = _statusFlow.value.activePackageCount,
        bindingRevision: String? = _statusFlow.value.bindingRevision,
        configRevision: String? = _statusFlow.value.configRevision,
        leaseExpiresAtUtc: String? = _statusFlow.value.leaseExpiresAtUtc,
        exitContext: ExitContextMetadata? = _statusFlow.value.exitContext,
        lastErrorCode: String? = _statusFlow.value.lastErrorCode,
        userRecoveryMessage: String? = _statusFlow.value.userRecoveryMessage,
    ) {
        val next = TunnelStatusSnapshot(
            state = state,
            routingMode = routingMode,
            activePackageCount = activePackageCount,
            bindingRevision = bindingRevision,
            configRevision = configRevision,
            leaseExpiresAtUtc = leaseExpiresAtUtc,
            exitContext = exitContext,
            lastErrorCode = lastErrorCode,
            userRecoveryMessage = userRecoveryMessage,
            recentErrorCodes = recentErrorCodes.toList(),
            recentRequestIds = recentRequestIds.toList(),
        )
        _statusFlow.value = next
        onStatusPublished(next)
    }

    companion object {
        const val PREEMPTIVE_REFRESH_THRESHOLD_MS = 180_000L
        const val MIN_FRESH_ROTATED_TOKEN_MS = 30_000L
        const val MAX_SERVER_LEASE_MS = 600_000L
        const val DEFAULT_RENEW_INTERVAL_MS = 8 * 60 * 1_000L
        const val RENEW_SAFETY_LEAD_MS = 90_000L
        const val MIN_RENEW_DELAY_MS = 5_000L
        const val TRANSIENT_RENEW_RETRY_MS = 15_000L
        const val TRANSIENT_RETRY_MIN_REMAINING_MS = 20_000L
        const val PERIODIC_PROBE_MIN_MS = 192_000L // 4 min - 20%
        const val PERIODIC_PROBE_MAX_MS = 288_000L // 4 min + 20%
        private const val MAX_DIAGNOSTIC_ITEMS = 10

        private val NON_RECOVERABLE_401_CODES = setOf(
            "REFRESH_REPLAY",
            "REFRESH_INVALID",
            "ACCOUNT_DISABLED",
            "DEVICE_REVOKED",
        )
    }
}

// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.network

import cn.noyapi.dingtu.config.DeviceProofSigner
import cn.noyapi.dingtu.config.TunnelConfigVerifier
import cn.noyapi.dingtu.config.VerifiedProductionConfig
import cn.noyapi.dingtu.core.DingtuConstants
import cn.noyapi.dingtu.trust.VerifiedTrustAnchor
import org.json.JSONObject
import java.nio.charset.StandardCharsets

class ProductionConfigClient(
    private val transport: HttpTransport = DefaultHttpsTransport(),
    private val productionOrigin: String = DingtuConstants.CONTROL_ORIGIN,
    private val nowProvider: () -> Long = System::currentTimeMillis,
) {
    init {
        require(productionOrigin == DingtuConstants.CONTROL_ORIGIN) {
            "ProductionConfigClient must bind strictly to ${DingtuConstants.CONTROL_ORIGIN}"
        }
    }

    fun fetchAndVerifyTunnelConfig(
        deviceId: String,
        deviceSeed32: ByteArray,
        authorizationHandle: String,
        trustAnchor: VerifiedTrustAnchor,
    ): VerifiedProductionConfig {
        val nowMillis = nowProvider()
        val signedPayload = DeviceProofSigner.createSignedPayload(
            deviceSeed32 = deviceSeed32,
            authorizationHandle = authorizationHandle,
            issuedAtMillis = nowMillis,
            productionOrigin = productionOrigin,
        )

        val requestJson = JSONObject()
            .put("authorizationHandle", signedPayload.authorizationHandle)
            .put("issuedAt", signedPayload.issuedAt)
            .put("deviceProof", signedPayload.deviceProof)

        // §13.1: No query params, no redirects, no Cookie, no Bearer Authorization header.
        val headers = linkedMapOf(
            "Accept" to "application/json",
            "Content-Type" to "application/json",
            DingtuConstants.HEADER_CLIENT_NAME to DingtuConstants.HEADER_CLIENT_VALUE,
            DingtuConstants.HEADER_SCHEMA_NAME to DingtuConstants.HEADER_SCHEMA_VALUE,
            "Cache-Control" to "no-store",
        )

        val response = transport.execute(
            HttpRequestSpec(
                method = "POST",
                url = "$productionOrigin/api/v1/client/tunnel/config",
                headers = headers,
                bodyBytes = requestJson.toString().toByteArray(StandardCharsets.UTF_8),
            )
        )

        if (response.statusCode != 200) {
            DefaultHttpsTransport.parseApiErrorAndThrow(response)
        }

        return TunnelConfigVerifier.verifyEnvelopeAndPolicy(
            rawEnvelopeBytes = response.bodyBytes,
            expectedDeviceId = deviceId,
            expectedAuthorizationHandle = authorizationHandle,
            trustAnchor = trustAnchor,
            nowMillis = nowProvider(),
        )
    }
}

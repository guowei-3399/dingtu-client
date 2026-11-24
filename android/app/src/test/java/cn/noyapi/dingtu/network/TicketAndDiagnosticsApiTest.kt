// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.network

import cn.noyapi.dingtu.core.DingtuConstants
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets

class TicketAndDiagnosticsApiTest {

    @Test
    fun diagnosticSnapshotEnforcesContract17And19SanitizedFields() {
        val snap = DiagnosticSnapshotPayload.fromRawDiagnostics(
            proxyState = "running",
            rawErrorCodes = listOf("BRIDGE_UNAVAILABLE", "invalid lower code!", "CONFIG_EXPIRED"),
            rawRequestIds = listOf("req_123456", "bad space id", "req_abcdef"),
        )
        val json = snap.toJsonObject()
        assertEquals(
            setOf("appVersion", "platform", "environmentMode", "proxyState", "recentErrorCodes", "recentRequestIds"),
            json.keys().asSequence().toSet(),
        )
        assertEquals(DingtuConstants.APP_VERSION, json.getString("appVersion"))
        assertEquals("android", json.getString("platform"))
        assertEquals("tun", json.getString("environmentMode"))
        assertEquals("running", json.getString("proxyState"))
        assertEquals(2, json.getJSONArray("recentErrorCodes").length())
        assertEquals("BRIDGE_UNAVAILABLE", json.getJSONArray("recentErrorCodes").getString(0))
        assertEquals("CONFIG_EXPIRED", json.getJSONArray("recentErrorCodes").getString(1))
        assertEquals(2, json.getJSONArray("recentRequestIds").length())

        assertThrows(IllegalArgumentException::class.java) {
            DiagnosticSnapshotPayload(
                appVersion = "0.2.0",
                proxyState = "running",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            DiagnosticSnapshotPayload(
                environmentMode = "strong_tun",
                proxyState = "running",
            )
        }
    }

    @Test
    fun ticketCreateDetailAndReplyEndpointsEnforceExactContract() {
        val ticketId = "tkt_0123456789abcdef0123456789abcdef"
        val accessToken = "nda_ticket_test_token_1234567890"
        val recordedBodies = mutableListOf<JSONObject>()

        val client = DingtuControlClient(
            transport = { req ->
                assertEquals("android-v1", req.headers["X-Noya-Client"])
                assertEquals("2", req.headers["X-Noya-Schema"])
                assertEquals("Bearer $accessToken", req.headers["Authorization"])
                req.bodyBytes?.let {
                    recordedBodies.add(JSONObject(String(it, StandardCharsets.UTF_8)))
                }

                when {
                    req.method == "POST" && req.url.endsWith("/api/v1/client/tickets") -> {
                        val resp = """{"ticket":{"ticketId":"$ticketId","subject":"连接排查","category":"connection","status":"submitted"},"message":{"messageId":"msg_1"}}"""
                        HttpResponseData(201, emptyMap(), resp.toByteArray())
                    }
                    req.method == "GET" && req.url.endsWith("/api/v1/client/tickets/$ticketId") -> {
                        val resp = """{"data_source":"real","ticket":{"ticketId":"$ticketId","subject":"连接排查","category":"connection","status":"waiting_user"},"messages":[{"messageId":"msg_1","authorRole":"customer","body":"首次提交","createdAt":"2026-11-23T06:00:00.000Z"}]}"""
                        HttpResponseData(200, emptyMap(), resp.toByteArray())
                    }
                    req.method == "POST" && req.url.endsWith("/api/v1/client/tickets/$ticketId/messages") -> {
                        val resp = """{"ticket":{"ticketId":"$ticketId","status":"awaiting_ops"},"message":{"messageId":"msg_2"}}"""
                        HttpResponseData(200, emptyMap(), resp.toByteArray())
                    }
                    else -> error("Unexpected request: ${req.method} ${req.url}")
                }
            }
        )

        val snap = DiagnosticSnapshotPayload.fromRawDiagnostics(
            proxyState = "failed",
            rawErrorCodes = listOf("LEASE_HARD_DEADLINE_EXCEEDED"),
            rawRequestIds = listOf("req_001"),
        )
        val created = client.createTicket(
            accessToken = accessToken,
            subject = "连接排查",
            category = "connection",
            body = "切换网络后断开，请协助确认。",
            diagnosticSnapshot = snap,
        )
        assertEquals(ticketId, created.getJSONObject("ticket").getString("ticketId"))
        val createPayload = recordedBodies[0]
        assertEquals(setOf("subject", "category", "body", "diagnosticSnapshot"), createPayload.keys().asSequence().toSet())
        assertEquals("tun", createPayload.getJSONObject("diagnosticSnapshot").getString("environmentMode"))

        val detail = client.getTicketDetail(accessToken, ticketId)
        assertEquals(1, detail.getJSONArray("messages").length())

        val replied = client.postTicketMessage(accessToken, ticketId, body = "已补充复现时间", action = "reply")
        assertEquals("awaiting_ops", replied.getJSONObject("ticket").getString("status"))

        val closed = client.postTicketMessage(accessToken, ticketId, body = null, action = "close")
        assertTrue(closed.has("ticket"))

        // Validation guards
        assertThrows(IllegalArgumentException::class.java) {
            client.createTicket(accessToken, "标题", "invalid_category", "内容")
        }
        assertThrows(IllegalArgumentException::class.java) {
            client.postTicketMessage(accessToken, ticketId, body = "   ", action = "reply")
        }
        assertThrows(IllegalArgumentException::class.java) {
            client.getTicketDetail(accessToken, "tkt_short")
        }
    }
}

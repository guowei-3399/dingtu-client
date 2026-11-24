// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import java.io.BufferedReader
import java.io.Closeable
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets

class LoopbackCallbackServer private constructor(
    private val serverSocket: ServerSocket,
) : Closeable {

    val port: Int = serverSocket.localPort
    val redirectUri: String = "http://127.0.0.1:$port/callback"

    fun awaitCallbackUri(timeoutMillis: Int = 120_000): String {
        serverSocket.soTimeout = timeoutMillis
        try {
            serverSocket.accept().use { client ->
                client.soTimeout = 5_000
                val reader = BufferedReader(InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII))
                val requestLine = reader.readLine()
                    ?: throw PkceAuthException("LOOPBACK_EMPTY_REQUEST", "Empty HTTP request on loopback callback")
                val parts = requestLine.split(' ')
                if (parts.size < 2 || parts[0] != "GET") {
                    writeHtmlResponse(client.getOutputStream(), 405, "Method Not Allowed", "仅支持 GET 授权回调。")
                    throw PkceAuthException("LOOPBACK_INVALID_METHOD", "Loopback callback only accepts GET")
                }
                val requestTarget = parts[1]
                if (!requestTarget.startsWith("/callback?") && requestTarget != "/callback") {
                    writeHtmlResponse(client.getOutputStream(), 404, "Not Found", "无效的回调路径。")
                    throw PkceAuthException("LOOPBACK_INVALID_PATH", "Unexpected loopback callback path")
                }
                writeHtmlResponse(
                    client.getOutputStream(),
                    200,
                    "OK",
                    "定途授权回调已接收，请返回定途 App 继续连接。",
                )
                return "http://127.0.0.1:$port$requestTarget"
            }
        } catch (timeout: SocketTimeoutException) {
            throw PkceAuthException("LOOPBACK_TIMEOUT", "Timed out waiting for browser authorization callback", timeout)
        } finally {
            close()
        }
    }

    override fun close() {
        runCatching { serverSocket.close() }
    }

    private fun writeHtmlResponse(
        out: java.io.OutputStream,
        statusCode: Int,
        reasonPhrase: String,
        bodyMessage: String,
    ) {
        val html = """
            <!doctype html>
            <html lang="zh-CN">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>定途授权</title></head>
            <body style="font-family:sans-serif;padding:24px;text-align:center;">
            <h3>$bodyMessage</h3>
            </body>
            </html>
        """.trimIndent()
        val htmlBytes = html.toByteArray(StandardCharsets.UTF_8)
        val header = buildString {
            append("HTTP/1.1 $statusCode $reasonPhrase\r\n")
            append("Content-Type: text/html; charset=utf-8\r\n")
            append("Cache-Control: no-store\r\n")
            append("Connection: close\r\n")
            append("Content-Length: ${htmlBytes.size}\r\n\r\n")
        }.toByteArray(StandardCharsets.US_ASCII)
        runCatching {
            out.write(header)
            out.write(htmlBytes)
            out.flush()
        }
    }

    companion object {
        private val FORBIDDEN_PORTS = setOf(7890, 7899, 17899)

        fun bindEphemeral(): LoopbackCallbackServer {
            val loopbackAddr = InetAddress.getByName("127.0.0.1")
            val skippedSockets = mutableListOf<ServerSocket>()
            try {
                repeat(8) {
                    val socket = ServerSocket()
                    socket.reuseAddress = false
                    socket.bind(InetSocketAddress(loopbackAddr, 0), 1)
                    val assignedPort = socket.localPort
                    if (assignedPort in 1024..65535 && assignedPort !in FORBIDDEN_PORTS) {
                        return LoopbackCallbackServer(socket)
                    }
                    skippedSockets.add(socket)
                }
                throw PkceAuthException("LOOPBACK_PORT_UNAVAILABLE", "Unable to allocate permitted ephemeral loopback port")
            } finally {
                skippedSockets.forEach { runCatching { it.close() } }
            }
        }
    }
}

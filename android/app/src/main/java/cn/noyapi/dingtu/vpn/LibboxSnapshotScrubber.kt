// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import android.content.Context
import java.io.File
import java.io.RandomAccessFile

/**
 * Recursively overwrites and removes plaintext JSON configuration snapshots created by
 * `sing-box 1.14.2` `libbox` (`saveConfigSnapshot` writes `basePath/configuration.json`
 * and `archiveCrashReport` may copy it under `work/crash_reports/`).
 *
 * Preserves non-JSON runtime state such as `work/cache.db`.
 */
object LibboxSnapshotScrubber {
    fun scrubAll(appContext: Context) {
        scrubDirectories(
            File(appContext.filesDir, "libbox"),
            File(appContext.cacheDir, "libbox"),
        )
    }

    fun scrubDirectories(vararg roots: File) {
        for (root in roots) {
            if (!root.exists()) continue
            scrubTree(root)
        }
    }

    private fun scrubTree(dir: File) {
        val children = dir.listFiles() ?: return
        for (entry in children) {
            if (entry.isDirectory) {
                scrubTree(entry)
            } else if (entry.isFile && entry.name.endsWith(".json", ignoreCase = true)) {
                overwriteAndDelete(entry)
            }
        }
    }

    private fun overwriteAndDelete(file: File) {
        runCatching {
            val length = file.length()
            if (length > 0L && length <= MAX_WIPE_BYTES) {
                RandomAccessFile(file, "rw").use { raf ->
                    raf.seek(0L)
                    val zeros = ByteArray(minOf(length, 8192L).toInt())
                    var remaining = length
                    while (remaining > 0L) {
                        val chunk = minOf(remaining, zeros.size.toLong()).toInt()
                        raf.write(zeros, 0, chunk)
                        remaining -= chunk
                    }
                    raf.fd.sync()
                }
            }
        }
        runCatching { file.delete() }
    }

    private const val MAX_WIPE_BYTES = 2L * 1024L * 1024L
}

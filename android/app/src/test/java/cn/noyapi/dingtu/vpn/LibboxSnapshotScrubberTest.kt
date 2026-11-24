// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class LibboxSnapshotScrubberTest {

    @Test
    fun scrubsBaseWorkCrashReportAndCacheJsonSnapshotsWhilePreservingCacheDb() {
        val tempRoot = Files.createTempDirectory("dingtu-scrubber-test").toFile()
        try {
            val baseDir = File(tempRoot, "files/libbox").apply { mkdirs() }
            val workDir = File(baseDir, "work").apply { mkdirs() }
            val crashDir = File(workDir, "crash_reports/2026-11-23").apply { mkdirs() }
            val cacheDir = File(tempRoot, "cache/libbox").apply { mkdirs() }

            val baseSnapshot = File(baseDir, "configuration.json").apply {
                writeText("""{"outbounds":[{"type":"vless","uuid":"00000000-0000-0000-0000-000000000000"}]}""")
            }
            val workSnapshot = File(workDir, "configuration.json").apply {
                writeText("""{"secret":"should-be-wiped"}""")
            }
            val crashSnapshot = File(crashDir, "configuration.json").apply {
                writeText("""{"secret":"crash-copy"}""")
            }
            val cacheSnapshot = File(cacheDir, "draft.json").apply {
                writeText("""{"temp":true}""")
            }
            val cacheDb = File(workDir, "cache.db").apply {
                writeBytes(byteArrayOf(1, 2, 3, 4))
            }

            LibboxSnapshotScrubber.scrubDirectories(baseDir, cacheDir)

            assertFalse("basePath/configuration.json must be removed", baseSnapshot.exists())
            assertFalse("work/configuration.json must be removed", workSnapshot.exists())
            assertFalse("crash_reports snapshot must be removed", crashSnapshot.exists())
            assertFalse("cache json snapshot must be removed", cacheSnapshot.exists())
            assertTrue("work/cache.db must be preserved", cacheDb.exists())
        } finally {
            tempRoot.deleteRecursively()
        }
    }
}

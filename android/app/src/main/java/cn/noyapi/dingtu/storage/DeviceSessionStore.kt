// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import cn.noyapi.dingtu.crypto.DevicePublicJwk
import cn.noyapi.dingtu.crypto.Ed25519Crypto
import cn.noyapi.dingtu.trust.ProductionTrustAnchor

data class StoredDeviceSession(
    val deviceId: String,
    val platform: String,
    val appVersion: String,
    val status: String,
    val createdAt: String,
    val accessToken: String,
    val accessExpiresAtMillis: Long,
    val refreshToken: String,
    val refreshExpiresAt: String,
    val scopes: List<String>,
) {
    override fun toString(): String =
        "StoredDeviceSession(deviceId=$deviceId, platform=$platform, appVersion=$appVersion, status=$status, scopes=$scopes)"
}

interface DeviceSessionStore {
    fun getOrCreateDeviceKeySeed(): ByteArray
    fun getDevicePublicKeyJwk(): DevicePublicJwk
    fun saveSession(session: StoredDeviceSession)
    fun readSession(): StoredDeviceSession?
    fun clearAll()
}

@Suppress("DEPRECATION")
class KeystoreEncryptedDeviceSessionStore(context: Context) : DeviceSessionStore {
    private val appContext = context.applicationContext
    private val lock = Any()

    private val encryptedPrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(appContext, MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun getOrCreateDeviceKeySeed(): ByteArray = synchronized(lock) {
        val existing = encryptedPrefs.getString(KEY_DEVICE_SEED_B64, null)
        if (!existing.isNullOrEmpty()) {
            val decoded = Ed25519Crypto.decodeBase64UrlNoPadding(existing)
            if (decoded.size == Ed25519Crypto.SEED_BYTES) {
                return decoded
            }
        }
        val freshSeed = generateAllowedDeviceSeed()
        val encoded = Ed25519Crypto.encodeBase64UrlNoPadding(freshSeed)
        check(encryptedPrefs.edit().putString(KEY_DEVICE_SEED_B64, encoded).commit()) {
            "Failed to persist device Ed25519 seed in EncryptedSharedPreferences"
        }
        return freshSeed
    }

    override fun getDevicePublicKeyJwk(): DevicePublicJwk {
        val seed = getOrCreateDeviceKeySeed()
        return try {
            Ed25519Crypto.exportPublicJwk(seed)
        } finally {
            seed.fill(0)
        }
    }

    override fun saveSession(session: StoredDeviceSession) = synchronized(lock) {
        val scopesJoined = session.scopes.joinToString(",")
        val committed = encryptedPrefs.edit()
            .putString(KEY_DEVICE_ID, session.deviceId)
            .putString(KEY_PLATFORM, session.platform)
            .putString(KEY_APP_VERSION, session.appVersion)
            .putString(KEY_STATUS, session.status)
            .putString(KEY_CREATED_AT, session.createdAt)
            .putString(KEY_ACCESS_TOKEN, session.accessToken)
            .putLong(KEY_ACCESS_EXPIRES_AT_MS, session.accessExpiresAtMillis)
            .putString(KEY_REFRESH_TOKEN, session.refreshToken)
            .putString(KEY_REFRESH_EXPIRES_AT, session.refreshExpiresAt)
            .putString(KEY_SCOPES, scopesJoined)
            .commit()
        check(committed) { "Failed to persist device session in EncryptedSharedPreferences" }
    }

    override fun readSession(): StoredDeviceSession? = synchronized(lock) {
        val deviceId = encryptedPrefs.getString(KEY_DEVICE_ID, null)?.takeIf { it.isNotBlank() } ?: return null
        val accessToken = encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
        val refreshToken = encryptedPrefs.getString(KEY_REFRESH_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
        val platform = encryptedPrefs.getString(KEY_PLATFORM, "android") ?: "android"
        val appVersion = encryptedPrefs.getString(KEY_APP_VERSION, "0.1.0") ?: "0.1.0"
        val status = encryptedPrefs.getString(KEY_STATUS, "active") ?: "active"
        val createdAt = encryptedPrefs.getString(KEY_CREATED_AT, "") ?: ""
        val accessExpiresAtMs = encryptedPrefs.getLong(KEY_ACCESS_EXPIRES_AT_MS, 0L)
        val refreshExpiresAt = encryptedPrefs.getString(KEY_REFRESH_EXPIRES_AT, "") ?: ""
        val scopesRaw = encryptedPrefs.getString(KEY_SCOPES, "") ?: ""
        val scopes = if (scopesRaw.isBlank()) emptyList() else scopesRaw.split(",").filter { it.isNotBlank() }
        StoredDeviceSession(
            deviceId = deviceId,
            platform = platform,
            appVersion = appVersion,
            status = status,
            createdAt = createdAt,
            accessToken = accessToken,
            accessExpiresAtMillis = accessExpiresAtMs,
            refreshToken = refreshToken,
            refreshExpiresAt = refreshExpiresAt,
            scopes = scopes,
        )
    }

    override fun clearAll() = synchronized(lock) {
        check(encryptedPrefs.edit().clear().commit()) {
            "Failed to clear EncryptedSharedPreferences"
        }
    }

    companion object {
        private const val MASTER_KEY_ALIAS = "dingtu_android_keystore_master_v1"
        private const val PREFS_FILE_NAME = "dingtu_device_session_secure_v1"

        private const val KEY_DEVICE_SEED_B64 = "device_ed25519_seed_b64"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_PLATFORM = "device_platform"
        private const val KEY_APP_VERSION = "device_app_version"
        private const val KEY_STATUS = "device_status"
        private const val KEY_CREATED_AT = "device_created_at"
        private const val KEY_ACCESS_TOKEN = "session_access_token"
        private const val KEY_ACCESS_EXPIRES_AT_MS = "session_access_expires_at_ms"
        private const val KEY_REFRESH_TOKEN = "session_refresh_token"
        private const val KEY_REFRESH_EXPIRES_AT = "session_refresh_expires_at"
        private const val KEY_SCOPES = "session_scopes"

        internal fun generateAllowedDeviceSeed(): ByteArray {
            repeat(8) {
                val candidate = Ed25519Crypto.generateSeed()
                val jwk = Ed25519Crypto.exportPublicJwk(candidate)
                if (!ProductionTrustAnchor.isForbiddenTestKey(keyId = null, x = jwk.x)) {
                    return candidate
                }
                candidate.fill(0)
            }
            throw IllegalStateException("Failed to generate valid Ed25519 device key")
        }
    }
}

class InMemoryDeviceSessionStore(initialSeed: ByteArray? = null) : DeviceSessionStore {
    private val lock = Any()
    private var seed: ByteArray? = initialSeed?.copyOf()
    private var session: StoredDeviceSession? = null

    override fun getOrCreateDeviceKeySeed(): ByteArray = synchronized(lock) {
        val current = seed
        if (current != null && current.size == Ed25519Crypto.SEED_BYTES) {
            return current.copyOf()
        }
        val fresh = KeystoreEncryptedDeviceSessionStore.generateAllowedDeviceSeed()
        seed = fresh
        return fresh.copyOf()
    }

    override fun getDevicePublicKeyJwk(): DevicePublicJwk {
        val currentSeed = getOrCreateDeviceKeySeed()
        return try {
            Ed25519Crypto.exportPublicJwk(currentSeed)
        } finally {
            currentSeed.fill(0)
        }
    }

    override fun saveSession(session: StoredDeviceSession) = synchronized(lock) {
        this.session = session
    }

    override fun readSession(): StoredDeviceSession? = synchronized(lock) {
        session
    }

    override fun clearAll() = synchronized(lock) {
        seed?.fill(0)
        seed = null
        session = null
    }
}

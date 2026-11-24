// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.auth

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import cn.noyapi.dingtu.MainActivity

class AuthCallbackActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val forwardIntent = Intent(this, MainActivity::class.java).apply {
            action = intent?.action
            data = intent?.data
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(forwardIntent)
        finish()
    }
}

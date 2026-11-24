// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class DingtuPalette(
    val isDark: Boolean,
    val canvas: Color,
    val canvasGradStart: Color,
    val canvasGradMid: Color,
    val canvasGradEnd: Color,
    val rail: Color,
    val panel: Color,
    val layer: Color,
    val hover: Color,
    val ink: Color,
    val muted: Color,
    val subtle: Color,
    val line: Color,
    val lineStrong: Color,
    val accent: Color,
    val accentSoft: Color,
    val accentInk: Color,
    val btnPrimaryText: Color,
    val good: Color,
    val goodSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val heroScrimBase: Color,
    val heroTitle: Color,
    val heroSubtitle: Color,
)

val DingtuDarkPalette = DingtuPalette(
    isDark = true,
    canvas = Color(0xFF13151E),
    canvasGradStart = Color(0xFF111520),
    canvasGradMid = Color(0xFF141925),
    canvasGradEnd = Color(0xFF101D21),
    rail = Color(0xFF10121A),
    panel = Color(0xFF1C202D),
    layer = Color(0xFF252938),
    hover = Color(0xFF2D3244),
    ink = Color(0xFFF3F5FC),
    muted = Color(0xFFA8AEC4),
    subtle = Color(0xFF8D94AD),
    line = Color(0xFF2D3242),
    lineStrong = Color(0xFF43495E),
    accent = Color(0xFF4698FF),
    accentSoft = Color(0xFF203656),
    accentInk = Color(0xFF9AC8FF),
    btnPrimaryText = Color(0xFF102039),
    good = Color(0xFF4ADE80),
    goodSoft = Color(0xFF19352B),
    warning = Color(0xFFFBBF24),
    warningSoft = Color(0xFF352B1C),
    danger = Color(0xFFFB7185),
    dangerSoft = Color(0xFF3D2029),
    heroScrimBase = Color(0xFF182137),
    heroTitle = Color(0xFFF4F5FD),
    heroSubtitle = Color(0xFFD6DFEF),
)

val DingtuLightPalette = DingtuPalette(
    isDark = false,
    canvas = Color(0xFFF1F6FB),
    canvasGradStart = Color(0xFFEDF3FB),
    canvasGradMid = Color(0xFFF5F9FC),
    canvasGradEnd = Color(0xFFEDF7F5),
    rail = Color(0xFFF6F9FD),
    panel = Color(0xFFFFFFFF),
    layer = Color(0xFFF3F6FB),
    hover = Color(0xFFE9EFF8),
    ink = Color(0xFF1B2437),
    muted = Color(0xFF637089),
    subtle = Color(0xFF7A869D),
    line = Color(0xFFE4EAF4),
    lineStrong = Color(0xFFCDD7E6),
    accent = Color(0xFF2563EB),
    accentSoft = Color(0xFFE8F1FF),
    accentInk = Color(0xFF1D4ED8),
    btnPrimaryText = Color(0xFFFFFFFF),
    good = Color(0xFF16A34A),
    goodSoft = Color(0xFFE7F8EE),
    warning = Color(0xFFD97706),
    warningSoft = Color(0xFFFEF3C7),
    danger = Color(0xFFE11D48),
    dangerSoft = Color(0xFFFFE4EA),
    heroScrimBase = Color(0xFFF1F5FF),
    heroTitle = Color(0xFF27314C),
    heroSubtitle = Color(0xFF4B5772),
)

val LocalDingtuPalette = staticCompositionLocalOf { DingtuDarkPalette }

private val DingtuLightColorScheme = lightColorScheme(
    primary = DingtuLightPalette.accent,
    onPrimary = DingtuLightPalette.btnPrimaryText,
    primaryContainer = DingtuLightPalette.accentSoft,
    onPrimaryContainer = DingtuLightPalette.accentInk,
    secondary = DingtuLightPalette.good,
    onSecondary = Color.White,
    background = DingtuLightPalette.canvas,
    onBackground = DingtuLightPalette.ink,
    surface = DingtuLightPalette.panel,
    onSurface = DingtuLightPalette.ink,
    surfaceVariant = DingtuLightPalette.layer,
    onSurfaceVariant = DingtuLightPalette.muted,
    outline = DingtuLightPalette.line,
    outlineVariant = DingtuLightPalette.lineStrong,
    error = DingtuLightPalette.danger,
    onError = Color.White,
    errorContainer = DingtuLightPalette.dangerSoft,
    onErrorContainer = DingtuLightPalette.danger,
)

private val DingtuDarkColorScheme = darkColorScheme(
    primary = DingtuDarkPalette.accent,
    onPrimary = DingtuDarkPalette.btnPrimaryText,
    primaryContainer = DingtuDarkPalette.accentSoft,
    onPrimaryContainer = DingtuDarkPalette.accentInk,
    secondary = DingtuDarkPalette.good,
    onSecondary = Color(0xFF0A2616),
    background = DingtuDarkPalette.canvas,
    onBackground = DingtuDarkPalette.ink,
    surface = DingtuDarkPalette.panel,
    onSurface = DingtuDarkPalette.ink,
    surfaceVariant = DingtuDarkPalette.layer,
    onSurfaceVariant = DingtuDarkPalette.muted,
    outline = DingtuDarkPalette.line,
    outlineVariant = DingtuDarkPalette.lineStrong,
    error = DingtuDarkPalette.danger,
    onError = Color(0xFF330613),
    errorContainer = DingtuDarkPalette.dangerSoft,
    onErrorContainer = DingtuDarkPalette.danger,
)

@Composable
fun DingtuTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    val palette = if (darkTheme) DingtuDarkPalette else DingtuLightPalette
    val scheme = if (darkTheme) DingtuDarkColorScheme else DingtuLightColorScheme
    CompositionLocalProvider(LocalDingtuPalette provides palette) {
        MaterialTheme(
            colorScheme = scheme,
            content = content,
        )
    }
}

import java.util.Properties

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

val localProps = Properties().apply {
    val propsFile = rootProject.file("local.properties")
    if (propsFile.isFile) {
        propsFile.inputStream().use(::load)
    }
}

val externalBuildRoot = localProps.getProperty("dingtu.buildRoot")?.trim()?.takeIf { it.isNotEmpty() }
if (externalBuildRoot != null) {
    allprojects {
        val projectKey = if (project == rootProject) "root" else project.path.trimStart(':').replace(':', '_')
        layout.buildDirectory.set(file("$externalBuildRoot/$projectKey"))
    }
}

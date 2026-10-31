plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.squiggle.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.squiggle.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/favori"))
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}

/** The bookmark "Analyser avec Squiggle", bundled from the web app's source as /favori bundles it. */
val favori = tasks.register<Exec>("favori") {
    val repo = rootDir.parentFile
    val out = layout.buildDirectory.file("generated/favori/favori.js")
    inputs.dir(File(repo, "web/src/favori"))
    inputs.dir(File(repo, "shared/src"))
    inputs.file(File(rootDir, "favori.mjs"))
    outputs.file(out)
    workingDir = repo
    commandLine("node", File(rootDir, "favori.mjs").path, out.get().asFile.path)
}
tasks.named("preBuild") { dependsOn(favori) }

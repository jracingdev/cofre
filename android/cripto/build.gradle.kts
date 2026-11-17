plugins {
    kotlin("jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("com.goterl:lazysodium-java:5.1.0")
    implementation("net.java.dev.jna:jna:5.14.0")
    implementation("org.json:json:20260719")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    systemProperty("jna.library.path", "/usr/lib/x86_64-linux-gnu")
}

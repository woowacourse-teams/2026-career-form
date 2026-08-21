import org.gradle.testing.jacoco.plugins.JacocoTaskExtension

plugins {
    java
    jacoco
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.sonarqube") version "7.4.0.8496" apply false
}

group = "com.careerform"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(platform("org.springframework.ai:spring-ai-bom:2.0.0"))
    implementation("org.springframework.ai:spring-ai-client-chat")

    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-mongodb")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.0")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
}

jacoco {
    toolVersion = "0.8.15"
}

val coverageClassExclusions = listOf(
    "com/careerform/CareerFormApplication.class",
)
val coverableClassDirectories = sourceSets.named("main").map {
    it.output.classesDirs.asFileTree.matching {
        exclude(coverageClassExclusions)
    }
}
val classesTask = tasks.named("classes")
val testTask = tasks.named<Test>("test")
val jacocoTestExtension = testTask.map {
    it.extensions.getByType<JacocoTaskExtension>()
}
val jacocoTestExecutionData = jacocoTestExtension.map {
    it.destinationFile
}

val verifyCoverageApplicability = tasks.register("verifyCoverageApplicability") {
    group = "verification"
    description = "Fails when coverable production code has no JaCoCo test execution data."
    dependsOn(classesTask, testTask)

    doLast {
        val coverableClasses = coverableClassDirectories.get()
        if (coverableClasses.isEmpty) {
            logger.lifecycle("JaCoCo coverage: N/A (no coverable production classes)")
            return@doLast
        }

        val testState = testTask.get().state
        val hasReusableTestExecution =
            testState.didWork || testState.upToDate || testState.skipMessage == "FROM-CACHE"
        if (
            !jacocoTestExtension.get().isEnabled ||
            !hasReusableTestExecution ||
            !jacocoTestExecutionData.get().isFile
        ) {
            throw GradleException(
                "Coverable production classes require JaCoCo test execution data",
            )
        }
    }
}

tasks.test {
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(verifyCoverageApplicability)
    classDirectories.setFrom(coverableClassDirectories)
    onlyIf("coverable production classes exist") {
        !coverableClassDirectories.get().isEmpty
    }
    reports {
        xml.required = true
        html.required = true
        csv.required = false
    }
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.jacocoTestReport)
    classDirectories.setFrom(coverableClassDirectories)
    onlyIf("coverable production classes exist") {
        !coverableClassDirectories.get().isEmpty
    }
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.80".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestReport, tasks.jacocoTestCoverageVerification)
}

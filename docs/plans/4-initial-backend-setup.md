# 초기 백엔드 세팅 Implementation Plan

> **For agentic workers:** `test-driven-development`로 실행 가능한 동작의 실패를 먼저 확인하고, 커밋 단위마다 관련 테스트를 통과시킨다. 완료 전 `verification-before-completion`과 `code-review`를 적용한다.

**Goal:** `backend/`에 JDK 25, Spring Boot 4.1.0, Gradle 9.6.1 기반의 독립 실행 가능한 Spring MVC 애플리케이션을 만들고 네 환경 프로파일, 상태 확인, 개발용 OpenAPI 문서와 80% 커버리지 검증을 제공한다.

**Architecture:** 루트 하네스와 독립된 단일 Spring Boot 프로젝트를 `backend/`에 둔다. 공통 실행 정책은 `application.yml`에 두고 `local`, `dev`, `staging`, `prod` 프로파일 파일이 환경 차이를 표현한다. OpenAPI는 공통 설정에서 닫고 `local`, `dev`에서만 연다. 실제 HTTP 통합 테스트가 각 프로파일의 health 및 OpenAPI 노출 계약을 검증한다.

**Tech Stack:** Java 25, Spring Boot 4.1.0, Spring MVC, Tomcat 11, Gradle Wrapper 9.6.1, Kotlin DSL, springdoc-openapi 3.0.3, JaCoCo 0.8.15, JUnit 5

## Global Constraints

- 작업 Issue는 #4 하나이며 브랜치는 `CF-4`, PR도 하나만 만든다.
- 기본 패키지는 `com.careerform`, Gradle root project 이름은 `career-form-backend`다.
- 명시적 프로파일은 `local`, `dev`, `staging`, `prod` 네 개뿐이며 `test` 프로파일을 추가하지 않는다.
- Java 가상 스레드는 공통 설정에서 활성화한다.
- OpenAPI와 Swagger UI는 `local`, `dev`에서만 노출하고 프로파일 미지정, `staging`, `prod`에서는 닫는다.
- GPT 연동, 비즈니스 API, 데이터베이스, 인증·인가, 요청 제한, WebFlux, Docker, CI/CD는 구현하지 않는다.
- 루트 하네스와 `docs/conventions/` 등 공유 보호 영역은 수정하지 않는다.
- 로컬 검증은 임시 JDK 25 런타임으로 수행할 수 있지만 저장소에 JDK 바이너리를 포함하지 않는다.

---

### Task 1: 독립 Gradle 실행 기반

**Commit:** `build: Spring Boot 백엔드 실행 기반 구성`

**Files:**
- Create: `backend/settings.gradle.kts`
- Create: `backend/build.gradle.kts`
- Create: `backend/gradlew`
- Create: `backend/gradlew.bat`
- Create: `backend/gradle/wrapper/gradle-wrapper.jar`
- Create: `backend/gradle/wrapper/gradle-wrapper.properties`
- Create: `backend/.gitignore`
- Create: `backend/src/test/java/com/careerform/CareerFormApplicationTest.java`
- Create: `backend/src/main/java/com/careerform/CareerFormApplication.java`
- Create: `docs/plans/4-initial-backend-setup.md`

- [ ] Gradle 9.6.1 Wrapper와 최소 빌드 설정을 생성한다. Java Toolchain은 25, Spring Boot 플러그인은 4.1.0으로 고정한다.
- [ ] `CareerFormApplication`이 없으면 컴파일되지 않는 컨텍스트 테스트를 먼저 작성하고 예상한 컴파일 실패를 확인한다.
- [ ] `@SpringBootApplication` 진입점을 최소 구현해 컨텍스트 테스트를 통과시킨다.
- [ ] `./gradlew test --tests com.careerform.CareerFormApplicationTest`를 JDK 25에서 실행한다.

### Task 2: 네 프로파일과 상태 확인

**Commit:** `feat: 실행 프로필과 상태 확인 구성`

**Files:**
- Modify: `backend/build.gradle.kts`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-local.yml`
- Create: `backend/src/main/resources/application-dev.yml`
- Create: `backend/src/main/resources/application-staging.yml`
- Create: `backend/src/main/resources/application-prod.yml`
- Create: `backend/src/test/java/com/careerform/support/AbstractProfileIntegrationTest.java`
- Create: `backend/src/test/java/com/careerform/LocalProfileIntegrationTest.java`
- Create: `backend/src/test/java/com/careerform/DevProfileIntegrationTest.java`
- Create: `backend/src/test/java/com/careerform/StagingProfileIntegrationTest.java`
- Create: `backend/src/test/java/com/careerform/ProdProfileIntegrationTest.java`

- [ ] 실제 HTTP 요청으로 각 프로파일의 `/actuator/health`를 호출하는 테스트를 먼저 작성하고 Actuator가 없어 404가 되는 RED를 확인한다.
- [ ] Actuator를 추가하고 HTTP 노출 범위를 `health`로 제한해 네 프로파일의 health 응답을 통과시킨다.
- [ ] 공통 설정에서 `spring.threads.virtual.enabled=true`를 적용하고 로딩된 환경 값으로 계약을 검증한다.
- [ ] `application-test.yml` 없이 각 테스트가 검증 대상 프로파일을 직접 활성화한다.
- [ ] `./gradlew test --tests 'com.careerform.*ProfileIntegrationTest'`를 실행한다.

### Task 3: 개발 환경 OpenAPI 문서

**Commit:** `feat: 개발 환경 OpenAPI 문서 제공`

**Files:**
- Modify: `backend/build.gradle.kts`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-local.yml`
- Modify: `backend/src/main/resources/application-dev.yml`
- Modify: `backend/src/test/java/com/careerform/LocalProfileIntegrationTest.java`
- Modify: `backend/src/test/java/com/careerform/DevProfileIntegrationTest.java`
- Modify: `backend/src/test/java/com/careerform/StagingProfileIntegrationTest.java`
- Modify: `backend/src/test/java/com/careerform/ProdProfileIntegrationTest.java`
- Create: `backend/src/test/java/com/careerform/DefaultProfileIntegrationTest.java`

- [ ] `local`, `dev`에서 `/v3/api-docs`와 `/swagger-ui/index.html`을 실제 HTTP로 요청하는 실패 테스트를 먼저 작성한다.
- [ ] springdoc 3.0.3을 추가하고 공통 설정에서는 문서를 비활성화한 뒤 `local`, `dev`에서만 활성화한다.
- [ ] 프로파일 미지정, `staging`, `prod`에서 두 경로가 404임을 검증한다.
- [ ] Spring Boot 4.1.0과 springdoc 3.0.3 조합의 컨텍스트 시작과 실제 문서 응답을 함께 증명한다.
- [ ] `./gradlew test --tests 'com.careerform.*ProfileIntegrationTest'`를 실행한다.

### Task 4: 커버리지 품질 게이트

**Commit:** `test: 백엔드 커버리지 검증 구성`

**Files:**
- Modify: `backend/build.gradle.kts`
- Modify: `backend/src/test/java/com/careerform/CareerFormApplicationTest.java`
- Modify: `docs/plans/4-initial-backend-setup.md`

**Implementation Note:** 부트스트랩 클래스를 JaCoCo 대상에서 제외하면 현재 애플리케이션 코드의 측정 대상이 비어 80% 기준을 형식적으로만 통과한다. 따라서 제외 규칙 대신 Spring Boot의 `SpringApplication.from(...)`으로 실제 `main`을 실행하고 생성된 컨텍스트를 닫는 smoke test를 추가해 전체 애플리케이션 클래스를 측정한다.

- [ ] JaCoCo 0.8.15의 XML·HTML 보고서와 라인 커버리지 80% 검증을 구성한다.
- [ ] 실제 `main` 진입점 smoke test로 부트스트랩을 검증하고 모든 애플리케이션 클래스를 커버리지 대상에 포함한다.
- [ ] `check`가 테스트, 보고서, 커버리지 검증을 모두 실행하도록 연결한다.
- [ ] `./gradlew clean check`로 품질 게이트를 검증한다.

### Task 5: 실행 문서와 최종 빌드

**Commit:** `docs: 백엔드 실행 방법 문서화`

**Files:**
- Create: `backend/README.md`

- [ ] JDK 25 요구사항과 빌드·테스트·실행 명령을 기록한다.
- [ ] 네 프로파일의 목적과 실행 예시를 기록한다.
- [ ] Swagger가 `local`, `dev`에만 노출되는 정책과 접근 경로를 기록한다.
- [ ] `./gradlew clean check`, `./gradlew bootJar`, `git diff --check`를 실행한다.
- [ ] `harness/scripts/verify`와 Issue 인수 조건별 근거를 새로 확인한다.
- [ ] `code-review`로 `origin/develop...HEAD`의 Standards와 Issue #4 계약 일치를 독립 검토한다.

## 보류 및 후속 후보

- JDK 25 설치와 CI 실행 환경은 Infra 범위다. 이번 PR은 Toolchain 요구사항과 로컬 검증 근거만 제공한다.
- 루트 `harness/scripts/verify`의 Gradle 연동과 Java/Spring 컨벤션은 별도 Harness draft 후보로 제안한다.
- GPT 계약, 입력 정제, 인증·인가, 요청 제한과 비용 제한은 별도 BE draft 후보로 제안한다.

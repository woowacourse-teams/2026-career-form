# 초기 백엔드 세팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `executing-plans`와 `test-driven-development`로 실행 가능한 동작의 실패를 먼저 확인하고, 커밋 단위마다 관련 테스트를 통과시킨다. 완료 전 `verification-before-completion`과 `code-review`를 적용한다.

**Goal:** `backend/`에 JDK 21, Spring Boot 4.1.0, Gradle 9.6.1 기반의 독립 실행 가능한 Spring MVC 애플리케이션을 만들고 네 환경 프로파일, OpenAPI 3.0 문서, 80% 커버리지 검증과 로컬 컨테이너 실행 기반을 제공한다.

**Architecture:** 루트 하네스와 독립된 단일 Spring Boot 프로젝트를 `backend/`에 둔다. 공통 실행 정책은 `application.yml`에 두고 `local`, `dev`, `staging`, `prod` 프로파일 파일이 환경 차이를 표현한다. OpenAPI는 공통 설정에서 닫고 `local`, `dev`에서만 열며 실제 HTTP 통합 테스트로 문서 규격과 노출 계약을 검증한다. 환경 중립 멀티 스테이지 Dockerfile과 공통 Compose 파일을 두고, 로컬 override가 빌드·프로파일·호스트 포트를 책임진다.

**Tech Stack:** Java 21, Spring Boot 4.1.0, Spring MVC, Tomcat 11, Gradle Wrapper 9.6.1, Kotlin DSL, springdoc-openapi 3.1.0, OpenAPI 3.0, JaCoCo 0.8.15, SonarQube Gradle Plugin 7.4.0.8496 (`apply false`), Eclipse Temurin 21 Noble, Docker Compose, JUnit 5

## Global Constraints

- 작업 Issue는 #4 하나이며 브랜치는 `CF-4`, PR도 하나만 만든다.
- 기본 패키지는 `com.careerform`, Gradle root project 이름은 `career-form-backend`다.
- 명시적 프로파일은 `local`, `dev`, `staging`, `prod` 네 개뿐이며 `test` 프로파일을 추가하지 않는다.
- Java 가상 스레드는 공통 설정에서 활성화한다.
- OpenAPI와 Swagger UI는 `local`, `dev`에서만 노출하고 프로파일 미지정, `staging`, `prod`에서는 닫는다.
- GPT 연동, 비즈니스 API, 데이터베이스, 인증·인가, 요청 제한, WebFlux, CI/CD와 원격 배포는 구현하지 않는다.
- 루트 하네스와 `docs/conventions/` 등 공유 보호 영역은 수정하지 않는다.
- 로컬 검증은 JDK 21 런타임으로 수행하지만 저장소에 JDK 바이너리를 포함하지 않는다.
- Sonar 플러그인은 버전만 선언하고 적용하지 않으며, Codecov 업로드·토큰·설정 파일은 추가하지 않는다.
- Dockerfile은 `eclipse-temurin:21-jdk-noble`에서 빌드하고 `eclipse-temurin:21-jre-noble`에서 non-root로 실행한다.
- `compose.yaml`은 단독 실행하지 않고 환경별 override와 조합한다. 이번 작업에서는 `compose.local.yaml`만 만든다.
- 로컬 Compose는 소스를 마운트하지 않고 변경 시 `up --build`로 다시 빌드한다.
- 향후 dev, staging, prod는 같은 이미지 digest를 승격하며 환경별로 다시 빌드하지 않는다.

## 진행 현황

- Task 1~5는 커밋 `510f29f`부터 `3dc22c8`까지 완료했다.
- JDK 21 정합화와 로컬 산출물 제외는 커밋 `f782182`, `17aaf2d`로 완료했다.
- 아래 Task 6~10을 승인된 재기획 범위로 이어서 수행한다.

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

- [x] Gradle 9.6.1 Wrapper와 최소 빌드 설정을 생성한다. Java Toolchain은 21, Spring Boot 플러그인은 4.1.0으로 고정한다.
- [x] `CareerFormApplication`이 없으면 컴파일되지 않는 컨텍스트 테스트를 먼저 작성하고 예상한 컴파일 실패를 확인한다.
- [x] `@SpringBootApplication` 진입점을 최소 구현해 컨텍스트 테스트를 통과시킨다.
- [x] `./gradlew test --tests com.careerform.CareerFormApplicationTest`를 JDK 21에서 실행한다.

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

- [x] 실제 HTTP 요청으로 각 프로파일의 `/actuator/health`를 호출하는 테스트를 먼저 작성하고 Actuator가 없어 404가 되는 RED를 확인한다.
- [x] Actuator를 추가하고 HTTP 노출 범위를 `health`로 제한해 네 프로파일의 health 응답을 통과시킨다.
- [x] 공통 설정에서 `spring.threads.virtual.enabled=true`를 적용하고 로딩된 환경 값으로 계약을 검증한다.
- [x] `application-test.yml` 없이 각 테스트가 검증 대상 프로파일을 직접 활성화한다.
- [x] `./gradlew test --tests 'com.careerform.*ProfileIntegrationTest'`를 실행한다.

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

- [x] `local`, `dev`에서 `/v3/api-docs`와 `/swagger-ui/index.html`을 실제 HTTP로 요청하는 실패 테스트를 먼저 작성한다.
- [x] springdoc 3.1.0을 추가하고 공통 설정에서는 문서를 비활성화한 뒤 `local`, `dev`에서만 활성화한다.
- [x] 프로파일 미지정, `staging`, `prod`에서 두 경로가 404임을 검증한다.
- [x] Spring Boot 4.1.0과 springdoc 3.1.0 조합의 컨텍스트 시작과 실제 문서 응답을 함께 증명한다.
- [x] `./gradlew test --tests 'com.careerform.*ProfileIntegrationTest'`를 실행한다.

### Task 4: 커버리지 품질 게이트

**Commit:** `test: 백엔드 커버리지 검증 구성`

**Files:**
- Modify: `backend/build.gradle.kts`
- Modify: `backend/src/test/java/com/careerform/CareerFormApplicationTest.java`
- Modify: `docs/plans/4-initial-backend-setup.md`

**Implementation Note:** 부트스트랩 클래스를 JaCoCo 대상에서 제외하면 현재 애플리케이션 코드의 측정 대상이 비어 80% 기준을 형식적으로만 통과한다. 따라서 제외 규칙 대신 Spring Boot의 `SpringApplication.from(...)`으로 실제 `main`을 실행하고 생성된 컨텍스트를 닫는 smoke test를 추가해 전체 애플리케이션 클래스를 측정한다.

- [x] JaCoCo 0.8.15의 XML·HTML 보고서와 라인 커버리지 80% 검증을 구성한다.
- [x] 실제 `main` 진입점 smoke test로 부트스트랩을 검증하고 모든 애플리케이션 클래스를 커버리지 대상에 포함한다.
- [x] `check`가 테스트, 보고서, 커버리지 검증을 모두 실행하도록 연결한다.
- [x] `./gradlew clean check`로 품질 게이트를 검증한다.

### Task 5: 실행 문서와 최종 빌드

**Commit:** `docs: 백엔드 실행 방법 문서화`

**Files:**
- Create: `backend/README.md`

- [x] JDK 21 요구사항과 빌드·테스트·실행 명령을 기록한다.
- [x] 네 프로파일의 목적과 실행 예시를 기록한다.
- [x] Swagger가 `local`, `dev`에만 노출되는 정책과 접근 경로를 기록한다.
- [x] `./gradlew clean check`, `./gradlew bootJar`, `git diff --check`를 실행한다.
- [x] `harness/scripts/verify`와 Issue 인수 조건별 근거를 새로 확인한다.
- [ ] `code-review`로 `origin/develop...HEAD`의 Standards와 Issue #4 계약 일치를 독립 검토한다.

### Task 6: Springdoc 버전 정합화

**Commit:** `build: Springdoc 버전 정합화`

**Files:**
- Modify: `backend/build.gradle.kts`

- [x] springdoc을 3.1.0으로 갱신한다.
- [x] `dependencyInsight`로 Spring Boot 4.1.0, springdoc 3.1.0과 전이 의존성의 해석 결과를 확인한다.
- [x] 기존 프로파일 통합 테스트를 실행해 local/dev 노출과 default/staging/prod 비노출이 유지되는지 확인한다.
- [x] 변경 파일만 커밋한다.

### Task 7: OpenAPI 3.0 문서 계약

**Commit:** `test: OpenAPI 3.0 문서 계약 검증 보강`

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Create: `backend/src/test/java/com/careerformtest/openapi/OpenApiContractTestConfiguration.java`
- Modify: `backend/src/test/java/com/careerform/support/AbstractOpenApiEnabledProfileIntegrationTest.java`

**Interfaces:**
- Test fixture endpoint: `POST /__test/openapi-contract?count=1`
- Request schema: `OpenApiContractRequest(name, requestedOn, category)`
- Response schema: `OpenApiContractResponse(id, name)`

- [x] JSON 응답의 `openapi` 값이 `3.0`으로 시작하고 대표 path·schema·Validation 제약이 존재해야 한다는 실패 테스트를 먼저 작성한다.
- [x] 기존 기본 OpenAPI 3.1 응답 때문에 RED가 발생하는지 확인한다.
- [x] `springdoc.api-docs.version=OPENAPI_3_0`을 공통 설정에 추가한다.
- [x] 테스트 전용 Controller와 record DTO를 테스트 소스에만 추가해 비즈니스 API를 만들지 않고 문서 생성 계약을 검증한다.
- [x] local/dev 계약 테스트와 전체 프로파일 테스트를 통과시킨다.

### Task 8: 품질 도구 기준 정합화

**Commit:** `build: 백엔드 품질 도구 기준 정합화`

**Files:**
- Modify: `backend/build.gradle.kts`

- [x] `org.sonarqube` 7.4.0.8496을 `apply false`로 선언하고 `sonar` 분석 태스크가 등록되지 않는지 확인한다.
- [x] JaCoCo 보고서와 커버리지 검증이 테스트 실행 결과에 명시적으로 의존하도록 작업 관계를 정리한다.
- [x] XML·HTML 보고서, CSV 비활성화와 전체 라인 80% 기준을 유지한다.
- [x] Codecov 의존성, 설정, 토큰은 추가하지 않고 JaCoCo XML 경로를 유지한다.
- [x] `./gradlew clean check`와 보고서 파일 존재를 확인한다.

### Task 9: 로컬 컨테이너 실행 기반

**Commit:** `build: 로컬 백엔드 컨테이너 실행 기반 구성`

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `compose.yaml`
- Create: `compose.local.yaml`

**Interfaces:**
- Compose service: `backend`
- Local image: `career-form-backend:local`
- Container port: `8080`
- Host port: `${BACKEND_PORT:-8080}`
- Spring profile: `local`
- Health endpoint: `http://localhost:8080/actuator/health`

- [x] 파일이 없는 상태에서 공통·로컬 Compose 조합의 `config` 검증이 실패하는지 확인한다.
- [x] Temurin 21 Noble 빌더에서 Gradle Wrapper `bootJar`를 실행하고 Spring Boot layered JAR를 추출한다.
- [x] Temurin 21 Noble JRE 이미지에 `curl`과 추출 레이어만 복사하고 non-root 사용자로 실행한다.
- [x] 공통 Compose에 내부 포트와 Actuator healthcheck를 구성한다.
- [x] 로컬 override에 build, image, `SPRING_PROFILES_ACTIVE=local`, `${BACKEND_PORT:-8080}:8080`을 구성하고 `container_name`은 지정하지 않는다.
- [x] `docker compose config`, `up --build --detach`, health·OpenAPI·Swagger·non-root smoke 검증을 수행한다.
- [x] `BACKEND_PORT=18080` override를 검증한 뒤 컨테이너를 종료한다.

### Task 10: 계약 문서와 최종 검증

**Commit:** `docs: 백엔드 실행 계약 최신화`

**Files:**
- Modify: `backend/README.md`
- Modify: `docs/plans/4-initial-backend-setup.md`

- [x] JDK 21, springdoc 3.1.0, OpenAPI 3.0, JaCoCo와 Sonar 선언 범위를 기록한다.
- [x] 표준 검증 순서를 `./gradlew clean check` 후 Docker Compose 빌드·실행으로 기록한다.
- [x] 공통 Compose와 local override의 책임, 포트 변경, 향후 동일 이미지 승격과 DB 추가 원칙을 기록한다.
- [x] `./gradlew clean check`, `./gradlew bootJar`, Docker smoke, `harness/scripts/verify`, `git diff --check`를 새로 실행한다.
- [ ] Issue 인수 조건을 근거와 대조하고 `code-review`의 Standards·Spec 결과를 반영한다.

## 보류 및 후속 후보

- JDK 21 CI, Codecov 업로드와 SonarCloud 실제 분석은 후속 Infra 범위다. 이번 PR은 로컬 검증과 후속 연동 준비만 제공한다.
- `compose.dev.yaml`, `compose.staging.yaml`, `compose.prod.yaml`, 이미지 레지스트리와 digest 승격은 배포 환경 확정 후 추가한다.
- DB가 확정되면 로컬 컨테이너 DB 또는 관리형 DB 접속 정책에 맞춰 환경별 Compose 책임을 정한다.
- 루트 `harness/scripts/verify`의 Gradle 연동과 Java/Spring 컨벤션은 별도 Harness draft 후보로 제안한다.
- GPT 계약, 입력 정제, 인증·인가, 요청 제한과 비용 제한은 별도 BE draft 후보로 제안한다.

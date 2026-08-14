# 초기 백엔드 세팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `cf-executing-plans`와 `cf-test-driven-development`로 실행 가능한 동작의 실패를 먼저 확인하고, 커밋 단위마다 관련 테스트를 통과시킨다. 완료 전 `cf-verification-before-completion`과 `cf-code-review`를 적용한다.

**Goal:** `backend/`에 JDK 21, Spring Boot 4.1.0, Gradle 9.6.1 기반의 독립 실행 가능한 Spring MVC 애플리케이션을 만들고 네 환경 프로파일, OpenAPI 3.0 문서, 80% 커버리지 검증과 MongoDB를 포함한 로컬 컨테이너 실행 기반 및 운영체제 공통 실행 진입점을 제공한다.

**Architecture:** 루트 하네스와 독립된 단일 Spring Boot 프로젝트를 `backend/`에 둔다. 공통 실행 정책은 `application.yml`에 두고 `local`, `dev`, `staging`, `prod` 프로파일 파일이 환경 차이를 표현한다. OpenAPI는 공통 설정에서 닫고 `local`, `dev`에서만 열며 실제 HTTP 통합 테스트로 문서 규격과 노출 계약을 검증한다. MongoDB 연결은 Boot 4의 `spring.mongodb.uri`에 `SPRING_MONGODB_URI`를 주입하고, JVM 테스트에서는 실제 DB 연결을 격리한다. 환경 중립 멀티 스테이지 Dockerfile과 공통 Compose 파일을 두고, 로컬 override가 백엔드 빌드·프로파일·호스트 포트와 내부 전용 MongoDB를 책임진다. Python 표준 라이브러리 기반 로컬 스크립트가 공통·로컬 Compose 파일과 Git에서 제외된 `.env.local`을 안전하게 조합한다.

**Tech Stack:** Java 21, Spring Boot 4.1.0, Spring MVC, Spring Data MongoDB, Tomcat 11, Gradle Wrapper 9.6.1, Kotlin DSL, springdoc-openapi 3.1.0, OpenAPI 3.0, JaCoCo 0.8.15, SonarQube Gradle Plugin 7.4.0.8496 (`apply false`), Eclipse Temurin 21 Noble, MongoDB 8.0, Docker Compose, JUnit 5, Python 3.9+

## Global Constraints

- 작업 Issue는 #4 하나이며 브랜치는 `CF-4`, PR도 하나만 만든다.
- 기본 패키지는 `com.careerform`, Gradle root project 이름은 `career-form-backend`다.
- 명시적 프로파일은 `local`, `dev`, `staging`, `prod` 네 개뿐이며 `test` 프로파일을 추가하지 않는다.
- Java 가상 스레드는 공통 설정에서 활성화한다.
- OpenAPI와 Swagger UI는 `local`, `dev`에서만 노출하고 프로파일 미지정, `staging`, `prod`에서는 닫는다.
- MongoDB 연결과 로컬 컨테이너만 구성하며 Repository, 컬렉션 모델, CRUD, 실제 프로필·지원서 정보 저장, 마이그레이션은 구현하지 않는다.
- GPT 연동, 비즈니스 API, 인증·인가, 요청 제한, WebFlux, CI/CD와 원격 배포는 구현하지 않는다.
- 루트 하네스와 `docs/conventions/` 등 공유 보호 영역은 수정하지 않는다.
- 로컬 검증은 JDK 21 런타임으로 수행하지만 저장소에 JDK 바이너리를 포함하지 않는다.
- Sonar 플러그인은 버전만 선언하고 적용하지 않으며, Codecov 업로드·토큰·설정 파일은 추가하지 않는다.
- Dockerfile은 `eclipse-temurin:21-jdk-noble`에서 빌드하고 `eclipse-temurin:21-jre-noble`에서 non-root로 실행한다.
- `compose.yaml`은 단독 실행하지 않고 환경별 override와 조합한다. 이번 작업에서는 `compose.local.yaml`만 만든다.
- 로컬 Compose는 소스를 마운트하지 않고 변경 시 `up --build`로 다시 빌드한다.
- MongoDB 연결은 `SPRING_MONGODB_URI`로만 주입하고 실제 URI와 자격증명을 저장소, 문서, 로그에 남기지 않는다.
- 로컬 MongoDB는 `compose.local.yaml`의 내부 네트워크에만 두고 호스트 27017 포트를 publish하지 않는다.
- 로컬 MongoDB 데이터는 `mongodb-data` named volume에 보존하며 자동 검증에서 volume을 삭제하지 않는다.
- JVM 통합 테스트에서는 비식별 dummy URI와 `management.health.mongodb.enabled=false`만 사용하고, 실제 MongoDB health는 Compose smoke에서 검증한다.
- 향후 dev, staging, prod는 같은 이미지 digest를 승격하며 환경별로 다시 빌드하지 않는다.
- `scripts/local.py`는 Python 표준 라이브러리만 사용하고 로컬 Compose 실행만 책임지며 CI/CD·배포 기능을 포함하지 않는다.
- `.env.local`은 팀 내부에서 별도 공유하고 Git, Issue, PR과 로그에 포함하지 않는다.

## 진행 현황

- Task 1~5는 커밋 `510f29f`부터 `3dc22c8`까지 완료했다.
- JDK 21 정합화와 로컬 산출물 제외는 커밋 `f782182`, `17aaf2d`로 완료했다.
- Task 6~10은 커밋 `f301dac`부터 `ff0195c`까지 완료했다.
- Task 11~13은 2026-08-14에 사람이 승인한 MongoDB 추가 범위로 완료했다.
- 아래 Task 14를 같은 날 사람이 승인한 운영체제 공통 로컬 실행 범위로 이어서 수행한다.

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
- [x] `.venv/bin/python harness/scripts/verify.py`와 Issue 인수 조건별 근거를 새로 확인한다.
- [x] `cf-code-review`로 `origin/develop...HEAD`의 Standards와 Issue #4 계약 일치를 독립 검토한다.

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
- [x] `./gradlew clean check`, `./gradlew bootJar`, Docker smoke, `.venv/bin/python harness/scripts/verify.py`, `git diff --check`를 새로 실행한다.
- [x] Issue 인수 조건을 근거와 대조하고 `cf-code-review`의 Standards·Spec 결과를 반영한다.

### Task 11: Spring Data MongoDB 연결 계약

**Commit:** `build: MongoDB 연결 기반 구성`

**Files:**
- Modify: `backend/build.gradle.kts`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/test/java/com/careerform/support/AbstractProfileIntegrationTest.java`
- Modify: `backend/src/test/java/com/careerform/CareerFormApplicationTest.java`

**Interfaces:**
- Runtime input: `SPRING_MONGODB_URI`
- Spring Boot property: `spring.mongodb.uri`
- Test-only URI: `mongodb://mongo-test.invalid:27017/career-form-test`
- Test-only health isolation: `management.health.mongodb.enabled=false`

- [x] **Step 1: MongoDB 자동 구성 실패 테스트를 작성한다.**

  `AbstractProfileIntegrationTest`가 실제 Spring Boot 연결 상세를 검증하도록 다음 계약을 추가한다. 이 테스트가 실패하게 만들 production change는 MongoDB starter 또는 `SPRING_MONGODB_URI` 바인딩의 누락이다.

  ```java
  @Autowired
  private MongoConnectionDetails mongoConnectionDetails;

  @Test
  void mongoConnectionUsesInjectedUri() {
      ConnectionString connectionString = mongoConnectionDetails.getConnectionString();

      assertEquals(List.of("mongo-test.invalid:27017"), connectionString.getHosts());
      assertEquals("career-form-test", connectionString.getDatabase());
  }
  ```

  `@SpringBootTest`에는 비식별 URI와 MongoDB health 비활성화를 테스트 속성으로만 추가한다.

- [x] **Step 2: RED를 확인한다.**

  ```bash
  cd backend
  ./gradlew test --tests 'com.careerform.*ProfileIntegrationTest' --no-daemon
  ```

  예상 결과: `MongoConnectionDetails`와 MongoDB driver 타입이 classpath에 없어 테스트 컴파일이 실패한다.

- [x] **Step 3: Boot가 관리하는 MongoDB starter와 런타임 URI 계약을 최소 구현한다.**

  `backend/build.gradle.kts`에는 driver 버전을 직접 고정하지 않고 다음 의존성만 추가한다.

  ```kotlin
  implementation("org.springframework.boot:spring-boot-starter-data-mongodb")
  ```

  `backend/src/main/resources/application.yml`에는 외부 입력이 없을 때 localhost로 조용히 폴백하지 않도록 다음 설정을 추가한다.

  ```yaml
  spring:
    mongodb:
      uri: ${SPRING_MONGODB_URI}
  ```

  `CareerFormApplicationTest`의 컨텍스트와 `main` smoke에는 같은 비식별 테스트 URI와 테스트 전용 MongoDB health 비활성화를 전달한다.

- [x] **Step 4: GREEN과 기존 프로파일 계약을 확인한다.**

  ```bash
  cd backend
  ./gradlew test --tests 'com.careerform.*ProfileIntegrationTest' --no-daemon
  ./gradlew test --tests com.careerform.CareerFormApplicationTest --no-daemon
  ```

  예상 결과: dummy host에 실제로 연결하지 않고 `MongoConnectionDetails`, health, OpenAPI 프로파일 테스트가 모두 통과한다.

- [x] **Step 5: Boot BOM 의존성 해석을 확인한다.**

  ```bash
  cd backend
  ./gradlew dependencyInsight \
    --dependency spring-boot-starter-data-mongodb \
    --configuration runtimeClasspath
  ./gradlew dependencyInsight \
    --dependency mongodb-driver-sync \
    --configuration runtimeClasspath
  ```

  예상 결과: starter와 동기식 MongoDB driver가 Spring Boot 4.1.0 의존성 관리로 해석되고 별도 driver 버전 선언은 없다.

- [x] **Step 6: 연결 기반 변경만 커밋한다.**

  ```bash
  git add backend/build.gradle.kts \
    backend/src/main/resources/application.yml \
    backend/src/test/java/com/careerform/support/AbstractProfileIntegrationTest.java \
    backend/src/test/java/com/careerform/CareerFormApplicationTest.java
  git commit -m "build: MongoDB 연결 기반 구성"
  ```

### Task 12: 로컬 MongoDB Compose 서비스

**Commit:** `build: 로컬 MongoDB 컨테이너 구성`

**Files:**
- Modify: `compose.local.yaml`

**Interfaces:**
- Compose service: `mongodb`
- Image: `mongo:8.0-noble`
- Internal address: `mongodb:27017`
- Local database: `career-form`
- Backend environment: `SPRING_MONGODB_URI=mongodb://mongodb:27017/career-form`
- Persistent volume: `mongodb-data:/data/db`

- [x] **Step 1: 병합된 Compose 모델의 MongoDB 계약 RED를 확인한다.**

  ```bash
  docker compose -f compose.yaml -f compose.local.yaml config --format json |
    jq -e '
      .services.mongodb.image == "mongo:8.0-noble" and
      .services.backend.environment.SPRING_MONGODB_URI == "mongodb://mongodb:27017/career-form" and
      .services.backend.depends_on.mongodb.condition == "service_healthy"
    '
  ```

  예상 결과: 현재 병합 모델에는 `mongodb` 서비스가 없어 `jq`가 종료 코드 1을 반환한다.

- [x] **Step 2: 로컬 override에 내부 전용 MongoDB를 최소 구성한다.**

  `compose.local.yaml`에 다음 책임을 추가하고 공통 `compose.yaml`은 변경하지 않는다.

  ```yaml
  services:
    backend:
      environment:
        SPRING_PROFILES_ACTIVE: local
        SPRING_MONGODB_URI: mongodb://mongodb:27017/career-form
      depends_on:
        mongodb:
          condition: service_healthy
    mongodb:
      image: mongo:8.0-noble
      expose:
        - "27017"
      volumes:
        - mongodb-data:/data/db
      healthcheck:
        test:
          - CMD
          - mongosh
          - --quiet
          - --eval
          - "quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)"
        start_period: 10s
        interval: 5s
        timeout: 5s
        retries: 10

  volumes:
    mongodb-data:
  ```

- [x] **Step 3: 병합 모델 계약을 GREEN으로 확인한다.**

  Step 1의 `jq` 검증을 다시 실행하고 다음 조건도 확인한다.

  ```bash
  docker compose -f compose.yaml -f compose.local.yaml config --format json |
    jq -e '
      (.services.mongodb.ports == null) and
      any(.services.mongodb.volumes[]; .target == "/data/db")
    '
  ```

  예상 결과: 두 검증 모두 성공하고 MongoDB 27017의 host publish가 없다.

- [x] **Step 4: 실제 로컬 스택을 빌드하고 기다린다.**

  ```bash
  docker compose -f compose.yaml -f compose.local.yaml \
    up --build --detach --wait
  ```

  예상 결과: MongoDB가 먼저 healthy가 되고 그 뒤 backend가 기동해 두 서비스 모두 healthy가 된다.

- [x] **Step 5: 실제 MongoDB 연결과 기존 백엔드 계약을 검증한다.**

  ```bash
  docker compose -f compose.yaml -f compose.local.yaml \
    exec -T mongodb mongosh --quiet \
    --eval 'quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)'
  curl --fail --silent http://127.0.0.1:8080/actuator/health
  curl --fail --silent http://127.0.0.1:8080/v3/api-docs
  curl --fail --silent http://127.0.0.1:8080/swagger-ui/index.html
  docker compose -f compose.yaml -f compose.local.yaml exec -T backend id -un
  docker compose -f compose.yaml -f compose.local.yaml ps -q mongodb |
    xargs docker inspect |
    jq -e '.[0].NetworkSettings.Ports["27017/tcp"] == null'
  ```

  예상 결과: MongoDB ping, backend health/OpenAPI/Swagger가 성공하고 backend 사용자는 `careerform`이다. 마지막 단언은 published port가 없어 성공한다.

- [x] **Step 6: named volume을 보존한 채 컨테이너와 네트워크만 종료한다.**

  ```bash
  docker compose -f compose.yaml -f compose.local.yaml down
  ```

  `--volumes` 또는 `-v`는 사용하지 않는다.

- [x] **Step 7: Compose 변경만 커밋한다.**

  ```bash
  git add compose.local.yaml
  git commit -m "build: 로컬 MongoDB 컨테이너 구성"
  ```

### Task 13: MongoDB 실행 문서와 최종 검증

**Commit:** `docs: MongoDB 실행 계약 반영`

**Files:**
- Modify: `backend/README.md`
- Modify: `docs/plans/4-initial-backend-setup.md`

- [x] **Step 1: 실행·보안·데이터 보존 계약을 문서화한다.**

  README에서 “데이터베이스 미포함” 문구를 제거하고 다음을 명시한다.

  - 로컬 표준 실행은 backend와 MongoDB를 함께 시작한다.
  - MongoDB 27017은 Compose 내부 전용이며 호스트에 publish하지 않는다.
  - 일반 `down`은 `mongodb-data`를 보존하고 volume 삭제는 사용자가 별도로 판단한다.
  - `dev`·`staging`·`prod`는 secret manager 또는 런타임 환경에서 `SPRING_MONGODB_URI`를 주입한다.
  - 실제 URI와 자격증명, 프로필·지원서 데이터는 저장소와 로그에 남기지 않는다.
  - MongoDB 중단 시 전역 `/actuator/health`와 backend 컨테이너 health도 DOWN이 된다.

- [x] **Step 2: 전체 JVM 검증과 실행 JAR를 새로 확인한다.**

  ```bash
  cd backend
  ./gradlew clean check --no-daemon
  ./gradlew bootJar --no-daemon
  cd ..
  ```

- [x] **Step 3: Task 12의 Compose config와 실제 smoke를 새로 반복한다.**

  기본 8080과 `BACKEND_PORT=18080`에서 MongoDB ping, backend health, OpenAPI, Swagger, non-root와 MongoDB host port 비노출을 확인한다. 두 실행 모두 종료 시 named volume을 삭제하지 않는다.

- [x] **Step 4: 저장소 전체 검증과 diff 검사를 실행한다.**

  ```bash
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

  2026-08-14 검증에서 Gradle `clean check`와 `bootJar`, 기본 포트와
  `BACKEND_PORT=18080`의 실제 Compose smoke, 하네스 195개 테스트와
  87% 커버리지, `git diff --check`가 모두 통과했다. 일반 `down` 뒤에도
  `cf-4_mongodb-data` named volume이 보존됨을 확인했다.

- [x] **Step 5: 문서와 완료된 계획을 커밋한다.**

  ```bash
  git add backend/README.md docs/plans/4-initial-backend-setup.md
  git commit -m "docs: MongoDB 실행 계약 반영"
  ```

- [x] **Step 6: Issue #4 인수 조건과 두 축 코드 리뷰를 통과시킨다.**

  문서 커밋까지 포함된 `origin/develop...HEAD`의 Standards와 갱신된 Issue #4 Spec을 독립 sub-agent로 검토하고 높은 위험 문제를 수정한 뒤 관련 검증을 다시 실행한다.

  최종 리뷰에서 현재 코드·문서의 Standards hard violation과 Spec finding은
  각각 0건이었다. 원격에 이미 게시된 두 기존 커밋 제목은 컨벤션에 맞지 않지만
  하네스가 force push를 금지하므로 이력을 재작성하지 않는다. 두 제목은
  `CF-*` 브랜치를 `develop`에 Squash Merge할 때 최종 이력에 남지 않는다.

- [x] **Step 7: 기존 Draft PR #7을 갱신한다.**

  최신 커밋을 `CF-4`에 push하고 PR 본문의 자동·수동 검증, MongoDB health 영향, named volume과 외부 URI 한계를 새 결과로 교체한다. PR은 Draft를 유지하고 Issue는 `status:review`, Project는 `On Review`로 복귀한다.

  최종 상태는 Draft PR #7, Issue `status:review`, Project `On Review`이며
  새 Issue·Sub-issue·PR을 만들지 않고 기존 작업 단위를 유지했다.

### Task 14: 운영체제 공통 로컬 Compose 실행 진입점

**Commit:** `feat: 로컬 Compose 실행 스크립트 추가`

**Files:**
- Create: `scripts/local.py`
- Create: `scripts/tests/test_local.py`
- Modify: `.gitignore`
- Modify: `compose.local.yaml`
- Modify: `README.md`
- Modify: `backend/README.md`
- Modify: `docs/plans/4-initial-backend-setup.md`

**Interfaces:**
- macOS entrypoint: `python3 scripts/local.py [up|down|logs|status]`
- Windows entrypoint: `py scripts/local.py [up|down|logs|status]`
- Default action: `up`
- Runtime env file: repository root `.env.local`
- Compose inputs: `compose.yaml`, `compose.local.yaml`
- Local services: `backend`, `mongodb`

- [x] **Step 1: 실제 스크립트 프로세스의 실패 테스트를 작성한다.**

  `scripts/tests/test_local.py`는 production 스크립트를 임시 프로젝트로 복사하고 외부 Docker CLI만 기록 가능한 fake 실행 파일로 대체한다. 테스트는 소스 문자열이 아니라 프로세스 종료 코드와 Docker 경계 호출을 검증한다.

  ```python
  result = self._run_local("up")

  self.assertEqual(0, result.returncode, result.stderr)
  self.assertEqual(
      [
          [*compose_prefix, "config", "--quiet"],
          [*compose_prefix, "up", "--build", "--detach", "--wait"],
      ],
      self._docker_calls(),
  )
  ```

  다음 파손을 각각 잡는다.

  - `.env.local` 누락인데 Docker를 실행하는 동작
  - `config --quiet` 실패 뒤에도 `up`을 실행하는 동작
  - 기본 동작 또는 `up`, `down`, `logs`, `status` 분기 오류
  - 저장소 루트가 아닌 현재 디렉터리를 Compose 기준으로 사용하는 동작

- [x] **Step 2: RED를 확인한다.**

  ```bash
  python3 -m unittest discover -s scripts/tests -v
  ```

  예상 결과: `scripts/local.py`가 없어 모든 실행 계약 테스트가 실패한다.

- [x] **Step 3: 최소 로컬 실행 스크립트를 구현한다.**

  `scripts/local.py`는 `pathlib`, `argparse`, `subprocess`만 사용한다. `.env.local`의 내용은 읽거나 shell에서 실행하지 않고 파일 존재만 확인한다. Docker는 인자 배열과 `shell=False` 기본값으로 호출한다.

  ```python
  compose = [
      "docker",
      "compose",
      "--env-file",
      str(root / ".env.local"),
      "--project-directory",
      str(root),
      "-f",
      str(root / "compose.yaml"),
      "-f",
      str(root / "compose.local.yaml"),
  ]
  ```

  `up`만 값 노출 없는 `config --quiet` 사전 검증을 수행하며 실패 코드를 그대로 반환한다. 일반 `down`에는 volume 삭제 옵션을 추가하지 않는다.

- [x] **Step 4: GREEN과 실패 경계를 확인한다.**

  ```bash
  python3 -m unittest discover -s scripts/tests -v
  docker compose --env-file .env.local \
    -f compose.yaml -f compose.local.yaml config --quiet
  ```

  예상 결과: 스크립트 테스트와 실제 Compose 병합 검증이 모두 성공하고 `.env.local` 값은 출력되지 않는다.

- [x] **Step 5: 로컬 사용법과 보안 경계를 문서화한다.**

  루트 README와 백엔드 README에 macOS·Windows 실행 명령, `up`, `down`, `logs`, `status`, `.env.local` 전달 위치, named volume 보존과 CI/CD 비범위를 기록한다. 긴 Compose 원본 명령은 장애 진단용으로만 남기고 `config --quiet`를 사용한다.

- [x] **Step 6: 실제 smoke와 전체 검증을 실행한다.**

  ```bash
  python3 scripts/local.py up
  python3 scripts/local.py status
  curl --fail --silent --show-error http://127.0.0.1:8080/actuator/health
  python3 scripts/local.py down
  cd backend && ./gradlew clean check --no-daemon && cd ..
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

  일반 `down` 뒤 `mongodb-data` named volume이 보존되고 MongoDB 27017이 호스트에 publish되지 않는지 확인한다.

  2026-08-14 검증에서 Python 3.9의 스크립트 테스트 5개, 실제 Compose
  build와 MongoDB·backend health, MongoDB ping, health `UP`, OpenAPI 3.0.1,
  non-root 사용자와 27017 미게시를 확인했다. `local.py down` 뒤
  `cf-4_mongodb-data` volume이 보존됐다. Gradle `clean check`, 하네스 195개
  테스트와 87% 커버리지, Compose `config --quiet`, `git diff --check`도
  통과했다.

- [ ] **Step 7: 독립 리뷰와 기존 Draft PR 갱신을 수행한다.**

  `origin/develop...HEAD`의 Standards와 갱신된 Issue #4 계약을 각각 독립 검토한다. 높은 위험 문제를 수정하고 최신 검증을 반복한 뒤 논리적 커밋을 `CF-4`에 push한다. 기존 Draft PR #7 본문과 Issue/Project 검토 상태만 갱신하고 새 PR은 만들지 않는다.

## 보류 및 후속 후보

- JDK 21 CI, Codecov 업로드와 SonarCloud 실제 분석은 후속 Infra 범위다. 이번 PR은 로컬 검증과 후속 연동 준비만 제공한다.
- `compose.dev.yaml`, `compose.staging.yaml`, `compose.prod.yaml`, 이미지 레지스트리와 digest 승격은 배포 환경 확정 후 추가한다.
- MongoDB Repository, 컬렉션 모델, 인덱스, CRUD와 실제 데이터 저장은 별도 BE 범위다.
- 외부 MongoDB 프로비저닝, TLS·네트워크·자격증명·백업 정책은 별도 Infra 범위다.
- liveness는 외부 의존성을 제외하고 readiness에 MongoDB를 포함하는 상태 확인 분리는 배포 환경 확정 뒤 다룬다.
- 루트 `harness/scripts/verify.py`의 Gradle 연동과 Java/Spring 컨벤션은 별도 Harness draft 후보로 제안한다.
- GPT 계약, 입력 정제, 인증·인가, 요청 제한과 비용 제한은 별도 BE draft 후보로 제안한다.

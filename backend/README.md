# Career Form Backend

Career Form의 독립 실행형 Spring MVC 백엔드 프로젝트다. 현재 범위는 이후 API 구현을 위한 실행 기반과 MongoDB 연결 기반이다. 비즈니스 API, GPT 연동, MongoDB Repository·컬렉션 모델과 실제 프로필·지원서 정보 저장은 포함하지 않는다.

## 기술 기준

- Java 21 LTS
- Spring Boot 4.1.0
- Gradle Wrapper 9.6.1
- Spring MVC와 내장 Tomcat 11
- Spring Data MongoDB
- springdoc-openapi 3.1.0
- OpenAPI 3.0.1 문서 규격
- JaCoCo 0.8.15
- SonarQube Gradle Plugin 7.4.0.8496 버전 선언
- Eclipse Temurin 21 Noble 컨테이너 이미지
- MongoDB 8.0 Noble 컨테이너 이미지

시스템 Gradle 설치는 필요하지 않다. 모든 명령은 저장소에 포함된 Gradle Wrapper로 실행한다. Java Toolchain이 21로 고정되어 있으므로 JDK 21이 설치되어 있어야 한다.

macOS에서 현재 셸이 JDK 21을 사용하도록 설정하는 예시는 다음과 같다.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

## 빌드와 검증

`backend/` 디렉터리에서 실행한다.

```bash
./gradlew --version
./gradlew clean check
./gradlew bootJar
```

`check`는 전체 테스트, JaCoCo 보고서 생성과 프로젝트 전체 라인 커버리지 80% 검증을 수행한다.

- XML 보고서: `build/reports/jacoco/test/jacocoTestReport.xml`
- HTML 보고서: `build/reports/jacoco/test/html/index.html`

XML 보고서는 후속 CI에서 Codecov와 SonarCloud가 사용할 수 있다. 현재는 Codecov 업로드 설정과 토큰이 없으며, Codecov를 Java 런타임 의존성으로 추가하지 않는다. SonarQube Gradle Plugin도 `apply false`로 버전만 고정했기 때문에 `sonar` 태스크와 외부 분석은 활성화되지 않는다.

실행 가능한 JAR는 `build/libs/career-form-backend-0.0.1-SNAPSHOT.jar`에 생성된다.

## 실행 프로파일

명시적 실행 프로파일은 다음 네 개다.

| 프로파일 | 용도 | Swagger/OpenAPI | MongoDB |
|---|---|---|---|
| `local` | 로컬 개발 | 활성화 | Compose 내부 MongoDB |
| `dev` | 공용 개발 환경 | 활성화 | 외부 MongoDB |
| `staging` | 출시 전 검증 | 비활성화 | 외부 MongoDB |
| `prod` | 운영 | 비활성화 | 외부 MongoDB |

표준 로컬 실행은 다음 절의 Docker Compose를 사용한다. JVM을 직접 실행하려면 별도로 접근 가능한 MongoDB가 있어야 하며 `SPRING_MONGODB_URI`를 함께 전달한다.

```bash
SPRING_MONGODB_URI=mongodb://127.0.0.1:27017/career-form \
  ./gradlew bootRun --args='--spring.profiles.active=local'
```

다른 환경은 `local`을 `dev`, `staging` 또는 `prod`로 바꾸고 해당 환경의 secret manager나 런타임 환경에서 외부 MongoDB URI를 주입한다. 프로파일을 지정하지 않으면 Swagger와 OpenAPI는 비활성화된다.

JAR로 실행할 수도 있다.

```bash
SPRING_MONGODB_URI=mongodb://127.0.0.1:27017/career-form \
  java -jar build/libs/career-form-backend-0.0.1-SNAPSHOT.jar \
    --spring.profiles.active=local
```

예시 URI에는 자격증명이 없다. 실제 외부 URI와 사용자명·비밀번호는 저장소, 문서, Issue, PR과 로그에 기록하지 않는다.

## 로컬 컨테이너 실행

Dockerfile은 JDK 21 빌드 단계와 JRE 21 실행 단계를 분리한다. Spring Boot layered JAR를 사용하며 최종 컨테이너는 `careerform` non-root 사용자로 실행된다. Dockerfile에는 Spring 프로파일과 비밀값을 넣지 않는다.

저장소 루트에서 품질 검증을 먼저 수행한다.

```bash
cd backend
./gradlew clean check
cd ..
```

공통 Compose와 로컬 override의 병합 결과를 확인한 뒤 실행한다.

```bash
docker compose \
  -f compose.yaml \
  -f compose.local.yaml \
  config

docker compose \
  -f compose.yaml \
  -f compose.local.yaml \
  up --build --detach --wait
```

`compose.yaml`은 환경 중립 기반 파일이므로 단독 실행하지 않는다. `compose.local.yaml`이 다음 로컬 설정을 제공한다.

- 이미지 이름 `career-form-backend:local`
- `SPRING_PROFILES_ACTIVE=local`
- `SPRING_MONGODB_URI=mongodb://mongodb:27017/career-form`
- Dockerfile 빌드 설정
- 호스트 loopback 포트와 컨테이너 8080 포트 연결
- `mongo:8.0-noble` 기반 `mongodb` 서비스
- `mongosh` ping healthcheck 성공 뒤 backend 시작
- 호스트에 publish하지 않는 MongoDB 27017 포트
- `/data/db`를 보존하는 `mongodb-data` named volume

기본 호스트 포트는 8080이다. 다른 worktree나 프로세스와 충돌하면 다음처럼 변경한다.

```bash
BACKEND_PORT=18080 docker compose \
  -f compose.yaml \
  -f compose.local.yaml \
  up --build --detach --wait
```

변경된 소스는 컨테이너에 마운트하지 않는다. 코드를 변경한 뒤 같은 `up --build` 명령으로 이미지를 다시 만든다.

종료할 때는 이 Compose 프로젝트가 만든 컨테이너와 네트워크를 제거한다.

```bash
docker compose \
  -f compose.yaml \
  -f compose.local.yaml \
  down
```

일반 `down`은 `mongodb-data` named volume을 삭제하지 않으므로 다음 실행에서도 데이터를 보존한다. volume 삭제는 로컬 데이터를 제거하는 파괴적 작업이므로 초기화가 필요할 때 사용자가 별도로 판단한다.

`compose.yaml`은 공통 내부 포트와 Actuator healthcheck를 책임진다. `compose.local.yaml`만 MongoDB 컨테이너, 내부 연결 URI, healthcheck 의존성과 named volume을 책임진다. `dev`, `staging`, `prod`는 DB 컨테이너를 추가하지 않고 외부 연결 정보만 안전하게 주입한다.

향후 `compose.dev.yaml`, `compose.staging.yaml`, `compose.prod.yaml`은 레지스트리에서 동일한 이미지 digest를 받아 프로파일과 환경값만 다르게 적용한다. 환경마다 소스를 다시 빌드하지 않는다.

공개 Temurin 이미지 pull이 레이어 출력 전에 멈추고 `error getting credentials`를 반환하면 Dockerfile 문제가 아니라 Docker Desktop credential store 문제일 수 있다. Docker Desktop과 credential helper 상태를 복구한 뒤 다시 실행하며, 인증값이나 임시 우회 설정을 저장소에 기록하지 않는다.

## MongoDB 연결

Spring Boot 4.1의 연결 속성은 `spring.mongodb.uri`이며 `application.yml`은 이를 필수 환경 변수 `SPRING_MONGODB_URI`에서 읽는다. 과거 Boot 버전의 `spring.data.mongodb.uri`는 사용하지 않는다.

- `local`: Compose가 자격증명 없는 내부 URI를 주입하고 MongoDB 포트를 호스트에 공개하지 않는다.
- `dev`, `staging`, `prod`: 관리형 또는 외부 MongoDB의 URI를 secret manager나 런타임 환경에서 주입한다.
- 저장소는 외부 MongoDB 인스턴스, 계정, TLS, 네트워크와 백업을 생성하거나 관리하지 않는다.
- 현재는 연결 기반만 제공하며 실제 프로필·지원서 데이터를 MongoDB에 저장하거나 전송하지 않는다.

MongoDB URI가 없으면 애플리케이션 설정 해석이 실패한다. URI, DNS, 네트워크 또는 자격증명이 잘못되거나 MongoDB가 중단되면 MongoDB health indicator 때문에 전역 `/actuator/health`와 backend 컨테이너 health가 `DOWN`이 된다.

## 상태 확인과 API 문서

애플리케이션 실행 후 다음 경로를 확인한다.

- 상태 확인: `http://localhost:8080/actuator/health`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`
- Swagger UI: `http://localhost:8080/swagger-ui/index.html`

Actuator의 HTTP 노출 범위는 모든 프로파일에서 `health`로 제한한다. OpenAPI JSON은 3.0.1 규격으로 생성된다. OpenAPI JSON과 Swagger UI는 `local`, `dev`에서만 노출되며 `staging`, `prod` 및 프로파일 미지정 실행에서는 404를 반환한다.

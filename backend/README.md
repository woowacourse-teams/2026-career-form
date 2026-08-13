# Career Form Backend

Career Form의 독립 실행형 Spring MVC 백엔드 프로젝트다. 현재 범위는 이후 API 구현을 위한 실행 기반이며 비즈니스 API, GPT 연동과 데이터베이스는 포함하지 않는다.

## 기술 기준

- Java 21 LTS
- Spring Boot 4.1.0
- Gradle Wrapper 9.6.1
- Spring MVC와 내장 Tomcat 11
- springdoc-openapi 3.0.3
- JaCoCo 0.8.15

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

`check`는 전체 테스트, JaCoCo 보고서 생성과 라인 커버리지 80% 검증을 수행한다. HTML 커버리지 보고서는 `build/reports/jacoco/test/html/index.html`에 생성된다.

실행 가능한 JAR는 `build/libs/career-form-backend-0.0.1-SNAPSHOT.jar`에 생성된다.

## 실행 프로파일

명시적 실행 프로파일은 다음 네 개다.

| 프로파일 | 용도 | Swagger/OpenAPI |
|---|---|---|
| `local` | 로컬 개발 | 활성화 |
| `dev` | 공용 개발 환경 | 활성화 |
| `staging` | 출시 전 검증 | 비활성화 |
| `prod` | 운영 | 비활성화 |

로컬 실행 예시는 다음과 같다.

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

다른 환경은 `local`을 `dev`, `staging` 또는 `prod`로 바꾼다. 프로파일을 지정하지 않으면 Swagger와 OpenAPI는 비활성화된다.

JAR로 실행할 수도 있다.

```bash
java -jar build/libs/career-form-backend-0.0.1-SNAPSHOT.jar \
  --spring.profiles.active=local
```

## 상태 확인과 API 문서

애플리케이션 실행 후 다음 경로를 확인한다.

- 상태 확인: `http://localhost:8080/actuator/health`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`
- Swagger UI: `http://localhost:8080/swagger-ui/index.html`

Actuator의 HTTP 노출 범위는 모든 프로파일에서 `health`로 제한한다. OpenAPI JSON과 Swagger UI는 `local`, `dev`에서만 노출되며 `staging`, `prod` 및 프로파일 미지정 실행에서는 404를 반환한다.

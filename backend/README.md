# Career Form Backend

Career Form의 독립 실행형 Spring MVC 백엔드 프로젝트다. 비식별 필드 메타데이터를
매핑하는 선택적 LLM API와 MongoDB 연결 기반을 제공한다. MongoDB Repository, 컬렉션
모델과 실제 프로필, 지원서 정보 저장은 포함하지 않는다.

## 기술 기준

- Java 21 LTS
- Spring Boot 4.1.0
- Gradle Wrapper 9.6.1
- Spring MVC와 내장 Tomcat 11
- Spring Data MongoDB
- Spring AI 2.0.0의 공급자 중립 chat client와 OpenAI provider
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

## 지원서 분석 API

schema v2 지원서 분석은 항상 노출되는 두 전용 endpoint로 나뉜다.

- `POST /api/v1/preparation/analyze`: 모든 action candidate를 `ACTION | NO_ACTION`으로
  분석하고 검증된 준비 plan만 반환한다. Backend는 클릭하지 않으며 실행 횟수 산정,
  사용자 승인, 실행, 기대 효과 확인과 새 DOM 수집은 browser가 담당한다.
- `POST /api/v1/fields/analyze`: 준비가 끝난 모든 field candidate를 canonical 77개
  프로필 필드 키의 `MATCH | NO_MATCH`로 분석한다. 상호작용 상태와 제한된 write command는
  Backend의 결정론적 정책이 만들고 실제 값 연결과 입력은 browser가 담당한다.

두 API와 Resolver 확장 경계는 다음 18개 production class가 소유한다. 현재 구현은 범용
LLM Resolver 두 개뿐이며 회사별 정적 Resolver, DB mapping과 Resolver router는 후속
범위다. 요청·응답의 하위 record와 enum은 해당 DTO 안에 함께 둔다.

```text
com.careerform.formanalysis
├── api/
│   ├── PreparationAnalysisController
│   └── FieldsAnalysisController
├── dto/
│   ├── PreparationAnalysisRequest
│   ├── PreparationAnalysisResponse
│   ├── FieldsAnalysisRequest
│   └── FieldsAnalysisResponse
├── application/
│   ├── PreparationAnalysisService
│   ├── FieldsAnalysisService
│   ├── FieldInteractionPolicy
│   ├── SupportedProfileFields
│   └── port/
│       ├── ActionResolver
│       └── FieldMappingResolver
├── exception/
│   ├── FormAnalysisExceptionHandler
│   ├── InvalidSnapshotException
│   └── ResolverException
└── infrastructure/adapter/openai/
    ├── OpenAiClient
    ├── OpenAiActionResolver
    └── OpenAiFieldMappingResolver
```

LLM은 외부 snapshot 전체를 그대로 받지 않는다. field 분석에는 section/item 관계,
candidate ID, 표시명, element/control과 option 표시명만 전달한다. action 분석에는 같은
구조와 candidate 표시명, element/control/visibility, domId/domName 및 true 상태 flag를
전달한다. 두 경로 모두 실제 프로필/control 값, HTML, 전체 URL·query·fragment,
cookie/session/account/authorization, selector·실행 코드와 DOM handle을 보내지 않는다.
Spring AI prompt/completion/error logging과 provider-side 저장도 비활성화한다.

LLM Resolver는 기본 비활성화되지만 두 HTTP endpoint는 숨지 않는다. 비활성 상태,
공급자 실행 장애 또는 출력 전체 계약 위반이면 `200 + GENERIC + PARTIAL +
[LLM_UNAVAILABLE]`와 빈 결과를 반환한다. 유효한 all-`NO_ACTION`과 all-`NO_MATCH`는
`COMPLETE`다. 잘못된 필수 요청은 400, 예상하지 않은 로컬 오류는 500이며 413과 502를
애플리케이션 계약으로 사용하지 않는다.

선택 속성의 명시적 `null`은 생략과 같게 취급하지만 필수 속성의 `null`과 빈 문자열은
허용하지 않는다. ID는 최대 128자, displayName/domId/domName/placeholder는 최대 120자,
site host는 253자, path pattern은 512자다. Backend는 candidate ID와 preparation
section ID의 중복, action target처럼 분석에 꼭 필요한 무결성만 검사한다. section parent
graph와 item/option ID의 정합성은 snapshot을 만드는 Frontend가 책임진다. Resolver 결과는
candidate exact set, snapshot/schema header와 field key를 검증한 뒤 원자적으로 채택하고,
실행 command와 상호작용 상태는 Backend의 결정론적 정책이 만든다.

LLM Resolver를 활성화할 때는 다음 값을 프로세스 실행 환경에 주입한다. 실제 값이 담긴
`.env`와 `.env.local`은 Git에 추가하지 않는다.

| 환경 변수 | 기본값 | 설명 |
|---|---:|---|
| `CAREER_FORM_LLM_ENABLED` | `false` | `true`일 때 범용 LLM Resolver 두 개를 활성화한다. |
| `CAREER_FORM_LLM_MODEL` | `gpt-5.6-luna` | Spring AI OpenAI chat model 이름이다. |
| `OPENAI_API_KEY` | 빈 값 | 활성화 시 공백이 아닌 실행 환경 시크릿이어야 한다. |
| `CAREER_FORM_LLM_TIMEOUT` | `10s` | OpenAI 요청 timeout이다. |
| `CAREER_FORM_LLM_MAX_RETRIES` | `1` | OpenAI client 최대 retry 횟수다. |
| `CAREER_FORM_LLM_MAX_OUTPUT_TOKENS` | `2048` | completion token 상한이다. |

모델 호출은 Spring AI의 OpenAI structured output을 사용한다. 데모 설정은
`gpt-5.6-luna`, reasoning effort `none`, completion 상한 2,048 tokens를 사용한다.
로컬 Compose에서는 [`.env.example`](../.env.example)을 `.env.local`의 출발점으로
사용할 수 있다.

```dotenv
CAREER_FORM_LLM_ENABLED=true
CAREER_FORM_LLM_MODEL=gpt-5.6-luna
OPENAI_API_KEY=<실행 환경에서만 설정>
```

자동 테스트는 fake Resolver 또는 fake `ChatModel`만 사용하며 실제 OpenAI 호출을 하지
않는다. 실제 API key를 넣은 연결 smoke test는 사람이 비식별 합성 snapshot으로 두
endpoint를 각각 한 번 호출해 수행한다. 성공 여부와 비식별 검증 결과만 기록하고 요청
본문, 공급자 원문 응답과 key는 로그·Issue·PR에 남기지 않는다. 실제 지원서 클릭과 입력도
smoke test 범위에 포함하지 않는다.

원격 `development`, `staging`, `production` 배포는 `.env.local`을 사용하지 않는다.
세 deploy job만 공용 GitHub Repository Secret `OPENAI_API_KEY`를 프로세스 환경에
주입하고, `infra/compose.deploy.yaml`이 이를 backend 컨테이너에 전달한다. 원격 Compose는
LLM을 항상 활성화하며, 별도 모델 환경 변수가 없으면 위 기본 모델을 사용한다. key의 실제
값은 이미지, 저장소, 문서, Issue·PR, workflow 출력이나 Compose 설정 출력에 기록하지 않는다.

현재 모델 선택은 세로 단면 데모를 위한 잠정값이다. 후속 평가는 동일한 비식별 사례에서
Mistral Small 4, GPT-5.6 Luna, GPT-5.4 nano, Gemini 3.1 Flash-Lite의 비용, 오매핑,
매핑 범위와 응답 속도를 비교하고 모델 선택 ADR을 작성한다.

## 빌드와 검증

`backend/` 디렉터리에서 실행한다.

```bash
./gradlew --version
./gradlew clean check
./gradlew bootJar
```

`check`는 전체 테스트와 JaCoCo 검증을 수행한다. 프레임워크 부트스트랩인
`CareerFormApplication`은 커버리지 대상에서 제외한다. 그 밖의 측정 가능한 production
class가 없으면 `JaCoCo coverage: N/A`를 명시한다. 측정 가능한 class가 하나라도 생기면
테스트 실행 데이터가 없을 때 빌드가 실패하고, 실행 데이터가 있으면 XML, HTML 보고서와
전체 라인 커버리지 80%를 검증한다.

커버리지 검증 증거는 과거 보고서가 남지 않는 fresh `./gradlew clean check` 결과를 기준으로
판단한다.

- XML 보고서(측정 대상이 있을 때): `build/reports/jacoco/test/jacocoTestReport.xml`
- HTML 보고서(측정 대상이 있을 때): `build/reports/jacoco/test/html/index.html`

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

예시 URI에는 자격증명이 없다. 실제 외부 URI와 사용자명, 비밀번호는 저장소, 문서, Issue, PR과 로그에 기록하지 않는다.

## 로컬 컨테이너 실행

Dockerfile은 JDK 21 빌드 단계와 JRE 21 실행 단계를 분리한다. Spring Boot layered JAR를 사용하며 최종 컨테이너는 `careerform` non-root 사용자로 실행된다. Dockerfile에는 Spring 프로파일과 비밀값을 넣지 않는다.

팀 내부의 승인된 비공개 채널에서 공유받은 `.env.local`을 저장소 루트에 둔다. 이 파일은 Git ignore 대상이므로 Issue, PR, 커밋 또는 로그에 첨부하지 않는다. 로컬 실행에는 다음 환경 변수가 필요하다.

- `SPRING_PROFILES_ACTIVE`
- `SPRING_MONGODB_URI`

저장소 루트에서 운영체제에 맞는 Python 명령으로 로컬 Spring과 MongoDB를 함께 실행한다. 인자 없는 실행은 `up`과 같다.

```bash
# macOS
python3 scripts/local.py

# Windows PowerShell
py scripts/local.py
```

스크립트는 `.env.local` 존재 여부와 `docker compose config --quiet`을 먼저 확인하고, 값은 출력하지 않은 채 공통 Compose와 로컬 override를 조합한다. 검증이 성공하면 이미지를 빌드하고 backend와 MongoDB가 healthy가 될 때까지 기다린다.

상태, 로그, 종료도 같은 진입점을 사용한다.

```bash
python3 scripts/local.py status
python3 scripts/local.py logs
python3 scripts/local.py down
```

Windows에서는 `python3` 대신 `py`를 사용한다. 이 스크립트는 로컬 개발 전용이며 CI/CD, staging 또는 prod 배포를 수행하지 않는다.

Compose 문제를 직접 진단해야 할 때만 다음 원본 검증 명령을 사용한다. `config`는 해석된 환경값을 출력할 수 있으므로 `--quiet`을 생략하지 않는다.

```bash
docker compose \
  --env-file .env.local \
  --project-directory . \
  -f compose.yaml \
  -f compose.local.yaml \
  config --quiet
```

`compose.yaml`은 환경 중립 기반 파일이므로 단독 실행하지 않는다. `compose.local.yaml`과 팀에서 공유하는 `.env.local`이 다음 로컬 설정을 제공한다.

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
# macOS
BACKEND_PORT=18080 python3 scripts/local.py up

# Windows PowerShell
$env:BACKEND_PORT=18080
py scripts/local.py up
```

변경된 소스는 컨테이너에 마운트하지 않는다. 코드를 변경한 뒤 `local.py up`으로 이미지를 다시 만든다.

`local.py down`은 Compose의 일반 `down`만 실행하므로 `mongodb-data` named volume을 삭제하지 않고 다음 실행에서도 데이터를 보존한다. volume 삭제는 로컬 데이터를 제거하는 파괴적 작업이므로 초기화가 필요할 때 사용자가 별도로 판단한다.

`compose.yaml`은 공통 내부 포트와 Actuator healthcheck를 책임진다. `compose.local.yaml`만 MongoDB 컨테이너, 내부 연결 URI, healthcheck 의존성과 named volume을 책임진다. `dev`, `staging`, `prod`는 `infra/compose.deploy.yaml`을 조합해 외부 MongoDB URI, 공용 OpenAI key, 환경별 loopback port와 registry digest를 주입하며 DB 컨테이너를 추가하지 않는다.

공개 Temurin 이미지 pull이 레이어 출력 전에 멈추고 `error getting credentials`를 반환하면 Dockerfile 문제가 아니라 Docker Desktop credential store 문제일 수 있다. Docker Desktop과 credential helper 상태를 복구한 뒤 다시 실행하며, 인증값이나 임시 우회 설정을 저장소에 기록하지 않는다.

## MongoDB 연결

Spring Boot 4.1의 연결 속성은 `spring.mongodb.uri`이며 `application.yml`은 이를 필수 환경 변수 `SPRING_MONGODB_URI`에서 읽는다. 과거 Boot 버전의 `spring.data.mongodb.uri`는 사용하지 않는다.

- `local`: Compose가 `.env.local`의 자격증명 없는 내부 URI를 주입하고 MongoDB 포트를 호스트에 공개하지 않는다.
- `dev`, `staging`, `prod`: 관리형 또는 외부 MongoDB의 URI를 secret manager나 런타임 환경에서 주입한다.
- 원격 application 배포는 MongoDB를 함께 기동하지 않는다. DB host의 Docker bootstrap과
  Compose 계약은 `infra/mongodb/`와 [CI/CD 설정 Wiki](../llm-wiki/wiki/topics/cicd-setup.md)에 분리되어 있으며,
  실제 계정, 네트워크, backup, restore 작업은 관리자가 수행한다.
- 현재는 연결 기반만 제공하며 실제 프로필, 지원서 데이터를 MongoDB에 저장하거나 전송하지 않는다.

MongoDB URI가 없거나 connection string 형식이 잘못되면 설정 해석 또는 MongoDB client 생성 중 애플리케이션 기동이 실패하므로 health 엔드포인트가 생성되지 않는다. URI 형식은 유효하지만 DNS, 네트워크, 자격증명 문제로 연결할 수 없거나 MongoDB가 중단되면 애플리케이션 기동 후 전역 `/actuator/health`가 HTTP 503과 `DOWN`을 반환하고 backend 컨테이너도 unhealthy 상태가 된다.

## 상태 확인과 API 문서

애플리케이션 실행 후 다음 경로를 확인한다.

- 상태 확인: `http://localhost:8080/actuator/health`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`
- Swagger UI: `http://localhost:8080/swagger-ui/index.html`

Actuator의 HTTP 노출 범위는 모든 프로파일에서 `health`로 제한한다. OpenAPI JSON은 3.0.1 규격으로 생성된다. OpenAPI JSON과 Swagger UI는 `local`, `dev`에서만 노출되며 `staging`, `prod` 및 프로파일 미지정 실행에서는 404를 반환한다.

## CI/CD와 원격 배포

PR 백엔드 검증, development, staging, production digest 배포, release, hotfix 승격과
readiness rollback은 저장소 루트의 `.github/workflows/`와 `infra/`가 담당한다.
애플리케이션 프로젝트는 환경 credential이나 원격 host 정보를 포함하지 않는다.

- 최초 GitHub Environment, runner, Docker Hub와 host 설정:
  [CI/CD 설정 Wiki](../llm-wiki/wiki/topics/cicd-setup.md)
- 배포, hotfix, 자동 rollback과 Draft revert 대응:
  [배포 Runbook Wiki](../llm-wiki/wiki/topics/deployment-runbook.md)

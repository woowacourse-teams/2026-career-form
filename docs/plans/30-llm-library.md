# LLM 라이브러리 기반 도입 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring AI 2.0.0의 공급자 중립 모듈만 백엔드에 도입하고, 공급자와 런타임 설정을 후속 작업으로 남긴 선택 경계를 문서화한다.

**Architecture:** Gradle의 Spring AI BOM으로 버전을 한곳에서 관리하고 `spring-ai-client-chat`만 컴파일·런타임 classpath에 추가한다. 실제 `ChatModel` bean은 공급자 starter가 들어오는 후속 Issue에서 구성하며, 장기 결정은 ADR로 고정한다.

**Tech Stack:** Java 21, Spring Boot 4.1.0, Gradle Kotlin DSL, Spring AI 2.0.0

## Global Constraints

- 공급자 후보는 OpenAI 또는 Gemini이지만 이 Issue에서는 선택하지 않는다.
- OpenAI, Gemini, Ollama 공급자 starter를 추가하지 않는다.
- API 키, 모델명, base URL, timeout, retry, token 제한과 빈 문자열 placeholder를 추가하지 않는다.
- 실제 LLM 호출, 프롬프트, 구조화 출력과 매핑 동작을 추가하지 않는다.
- 로컬 LLM은 향후 JVM 내장 방식이 아니라 별도 추론 서비스 API로 연결한다.
- 이 작업은 승인된 계약대로 의존성 메타데이터와 문서만 변경하므로 새 동작 테스트를 만들지 않는다.

---

### Task 1: Spring AI 공급자 중립 의존성

**Files:**

- Modify: `backend/build.gradle.kts`

**Interfaces:**

- Consumes: Maven Central과 Spring Boot 4.1.0의 기존 dependency management
- Produces: Spring AI 2.0.0으로 해석되는 `org.springframework.ai:spring-ai-client-chat` classpath

- [ ] **Step 1: 변경 전 의존성 부재 확인**

Run:

```bash
cd backend
./gradlew dependencyInsight --dependency spring-ai-client-chat --configuration runtimeClasspath --no-daemon
```

Expected: `No dependencies matching given input were found`가 출력되어 현재 classpath에 Spring AI chat client가 없음을 확인한다.

- [ ] **Step 2: 최소 의존성 추가**

`backend/build.gradle.kts`의 `dependencies` 블록 첫 부분을 다음처럼 만든다.

```kotlin
dependencies {
    implementation(platform("org.springframework.ai:spring-ai-bom:2.0.0"))
    implementation("org.springframework.ai:spring-ai-client-chat")

    implementation("org.springframework.boot:spring-boot-starter-actuator")
```

- [ ] **Step 3: 의존성 해석과 빌드 확인**

Run:

```bash
cd backend
./gradlew dependencyInsight --dependency spring-ai-client-chat --configuration runtimeClasspath --no-daemon
./gradlew clean check --no-daemon
./gradlew bootJar --no-daemon
```

Expected: dependency insight가 `spring-ai-client-chat:2.0.0`을 보여주고 세 명령이 모두 종료 코드 0으로 끝난다.

- [ ] **Step 4: 공급자 및 설정 비포함 확인**

Run:

```bash
git diff -- backend/build.gradle.kts backend/src/main/resources
rg -n "spring-ai-starter-model|api[-_.]?key|model-name|base-url" backend/build.gradle.kts backend/src/main/resources
```

Expected: diff에는 BOM과 `spring-ai-client-chat` 두 줄만 추가되고, 검색 결과에는 새 LLM 공급자 starter나 런타임 설정이 없다.

- [ ] **Step 5: 의존성 변경 커밋**

```bash
git add backend/build.gradle.kts
git commit -m "build: Spring AI 의존성 기반 구성"
```

---

### Task 2: 공급자 미설정 경계와 아키텍처 결정

**Files:**

- Modify: `backend/README.md`
- Create: `docs/adr/30-spring-ai-library.md`
- Create: `docs/plans/30-llm-library.md`

**Interfaces:**

- Consumes: Issue #30에서 승인된 ADR 전문과 제품의 로컬 우선·비식별 데이터 원칙
- Produces: 후속 공급자 도입 작업이 따라야 할 Spring AI 공통 경계와 설정 책임

- [ ] **Step 1: README에 현재 연동 상태 기록**

`backend/README.md`의 기술 기준에 `Spring AI 2.0.0의 공급자 중립 chat client`를 추가하고, 기술 기준 아래에 다음 내용을 추가한다.

```markdown
## LLM 연동 기반

현재 백엔드는 Spring AI 2.0.0 BOM과 공급자 중립 `spring-ai-client-chat`만 포함한다.
OpenAI, Gemini, Ollama용 starter와 API 키·모델·base URL 같은 런타임 설정은 아직
추가하지 않았으므로 실제 LLM bean이나 외부 호출은 생성되지 않는다.

공급자 선택과 런타임 설정, 구조화 출력 및 설정 검증은 비식별 데이터 기반 매핑을
구현하는 후속 Issue에서 함께 추가한다. 로컬 LLM을 채택하면 JVM에 모델을 내장하지 않고
Ollama 같은 별도 추론 서비스의 API로 연결한다.
```

- [ ] **Step 2: 승인된 ADR 생성**

`docs/adr/30-spring-ai-library.md`를 다음 구조와 결정으로 작성한다.

```markdown
# Spring AI 기반의 공급자 중립 LLM 연동

## 상태

승인됨

## 날짜

2026-08-20

## 관련 Issue

- #30

## 배경

백엔드는 Java 21과 Spring Boot 4.1.0을 사용한다. 제품의 LLM 매핑은 실제 지원서 값이 아니라 비식별 데이터만 다뤄야 한다. 첫 공급자는 OpenAI 또는 Gemini 중 후속 작업에서 선택하며, 장기적으로는 Ollama 같은 로컬 모델도 별도 추론 서비스로 연결할 수 있어야 한다.

사전 spike에서 Spring AI와 LangChain4j 모두 샘플 컴파일과 OpenAI/Gemini 교체 가능성을 확인했다. 그러나 표본이 1회이고 실행 로그와 자동 단언이 보존되지 않았으며 구조화 출력 조건도 같지 않았다. 특히 LangChain4j의 OpenAI 실험은 네이티브 strict JSON Schema를 사용했지만 Gemini Boot4 starter 실험은 같은 보장을 설정만으로 활성화하지 못했다. 그러므로 spike는 가능성과 통합 마찰을 찾은 탐색 근거로만 사용하고 성공률이나 변경 줄 수를 비교 지표로 사용하지 않는다.

## 검토한 대안

1. Spring AI 2.0.0
   - Spring Boot 4.0/4.1을 정식 지원하고 안정 버전으로 제공된다.
   - `ChatModel`과 `ChatClient`를 중심으로 공급자 중립 경계를 둘 수 있다.
   - OpenAI, Google Gemini, Ollama 연동을 같은 생태계에서 후속 추가할 수 있다.
2. LangChain4j 1.19.0 및 Boot4 starter 1.19.0-beta29
   - `AiServices`와 구조화 출력 기능이 편리하고 spike에서 공급자 교체를 확인했다.
   - 다만 현재 Boot4 starter가 beta 계열이고 Gemini starter의 구조화 출력 설정 노출이 OpenAI starter와 비대칭이었다.
3. 공급자 공식 SDK 직접 사용
   - 공급자 고유 기능을 가장 빠르게 사용할 수 있다.
   - 공통 오류·설정·관측 경계를 직접 설계해야 하고 공급자 교체 비용이 커진다.

## 결정

- Spring AI 2.0.0 BOM과 공급자 중립 `spring-ai-client-chat`을 LLM 연동 기반으로 사용한다.
- 이 Issue에서는 공급자별 starter와 API 키·모델·base URL 같은 런타임 설정을 추가하지 않는다.
- 후속 애플리케이션 코드는 Spring AI의 공통 `ChatModel`/`ChatClient` 경계에 의존한다. 공급자 고유 기능이 필요하면 경계 밖 adapter로 격리한다.
- OpenAI 또는 Gemini 선택, 구조화 출력 보장, timeout/retry, 설정 검증은 실제 매핑 구현의 후속 Issue에서 결정한다.
- 로컬 LLM은 JVM 프로세스에 내장하지 않고 Ollama 같은 별도 추론 서비스의 API로 연결한다.

## 결과

- Spring Boot 생태계와 버전 정렬된 공통 LLM 추상화를 얻는다.
- 공급자 미선택 상태에서는 실제 LLM bean이나 외부 호출이 생기지 않는다.
- 공급자 고유 기능은 공통 추상화만으로 충분하지 않을 수 있으며 adapter와 별도 검증이 필요하다.
- Spring AI 업그레이드와 공급자 starter 도입 시 호환성, 구조화 출력, 오류 모델을 다시 검증해야 한다.
- 런타임 설정 테스트는 공급자 starter를 도입하는 후속 Issue에서 추가한다.
```

- [ ] **Step 3: 문서 계약 확인**

Run:

```bash
rg -n "Spring AI 2\.0\.0|spring-ai-client-chat|별도 추론 서비스" backend/README.md docs/adr/30-spring-ai-library.md
rg -n "API 키|모델|base URL|후속 Issue" backend/README.md docs/adr/30-spring-ai-library.md
git diff --check
```

Expected: 선택 버전, 공급자 중립 모듈, 후속 설정 경계와 로컬 추론 서비스 경계가 모두 검색되고 whitespace 오류가 없다.

- [ ] **Step 4: 문서 변경 커밋**

```bash
git add backend/README.md docs/adr/30-spring-ai-library.md docs/plans/30-llm-library.md
git commit -m "docs: LLM 라이브러리 선택 기록"
```

---

### Task 3: 전체 검증과 리뷰

**Files:**

- Verify: `backend/build.gradle.kts`
- Verify: `backend/README.md`
- Verify: `docs/adr/30-spring-ai-library.md`
- Verify: `docs/plans/30-llm-library.md`

**Interfaces:**

- Consumes: Task 1과 Task 2의 두 논리적 커밋
- Produces: Draft PR 게시에 사용할 최신 자동·수동 검증 근거

- [ ] **Step 1: Issue 자동 검증 전체 실행**

```bash
cd backend
./gradlew dependencyInsight --dependency spring-ai-client-chat --configuration runtimeClasspath --no-daemon
./gradlew clean check --no-daemon
./gradlew bootJar --no-daemon
cd ..
.venv/bin/python harness/scripts/verify.py
git diff --check
```

- [ ] **Step 2: 범위와 시크릿 수동 점검**

```bash
git diff origin/develop...HEAD -- backend/build.gradle.kts backend/src/main/resources
git diff --name-only origin/develop...HEAD
rg -n "spring-ai-starter-model|api[-_.]?key|model-name|base-url" backend/build.gradle.kts backend/src/main/resources
```

Expected: 변경 파일은 계획된 네 파일뿐이고 공급자 starter·API 키·모델·base URL 설정은 없다. 실제 외부 LLM 호출은 수행하지 않는다.

- [ ] **Step 3: 두 축 코드 리뷰**

`origin/develop...HEAD`를 기준으로 저장소 Standards와 Issue #30 계약을 각각 검토한다. 치명적이거나 높은 위험의 문제가 있으면 수정 후 Task 3 검증을 처음부터 다시 실행한다.

# 비식별 LLM 매핑 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비식별 페이지 필드 메타데이터를 받아 OpenAI `gpt-5.6-luna`의 네이티브 structured output으로 미해결 필드를 프로필 키 또는 `NO_MATCH`에 매핑하는 백엔드 v1 API를 만든다.

**Architecture:** LLM 매핑 기능 안을 `domain`, `application`, `api`, `infrastructure.openai`, `config`로 나눈다. `POST /api/v1/llm/mappings`의 DTO와 애플리케이션 검증기는 HTTP 및 공급자와 분리하고, `MappingModelClient` 포트 뒤에 Spring AI `ChatClient` 기반 OpenAI 어댑터를 둔다. 모델 응답 전체가 target 집합·허용 키·confidence 계약을 만족할 때만 반환한다. 기능 플래그가 꺼져 있으면 LLM용 빈이 생성되지 않으며, 켜진 경우에는 시크릿 값을 출력하지 않는 설정 검증을 먼저 통과해야 한다. 특정 회사 페이지 어댑터는 LLM 공급자 어댑터와 다른 확장 축이므로 이 패키지에 섞지 않는다.

**Tech Stack:** Java 21, Spring Boot 4.1.0, Spring MVC, Bean Validation, Spring AI 2.0.0, OpenAI Chat model starter, JUnit 5, MockMvc, JaCoCo

## Global Constraints

- Issue #40의 제목, 본문, 인수 조건을 변경하지 않는다.
- 실제 프로필 값, 원본 DOM, URL, 쿠키, 계정·세션·인증 정보와 실제 API 키를 코드, fixture, 로그, 문서, Issue, PR에 기록하지 않는다.
- 입력에는 `contextFields`와 `targetFields`의 허용된 메타데이터만 둔다. 휴리스틱 매핑, 숨김 필드와 미지원 필드는 호출자가 제외한다.
- 출력 `profileFieldKey`는 `docs/PROFILE_FIELDS.md`의 MVP `허용`, `조건부`, `민감 확인` 필드의 범주 한정 키 또는 `NO_MATCH`만 허용한다. `미입력`, 후속 지원 후보와 저장 금지 정보는 제외한다.
- 모델은 `gpt-5.6-luna`, reasoning effort는 `none`, Spring AI는 `2.0.0`을 유지한다.
- OpenAI 호출은 공급자 네이티브 strict JSON Schema를 사용하고 프롬프트 텍스트 파싱에 의존하지 않는다.
- LLM 기능은 기본 비활성화한다. 활성화 시 API 키 또는 모델이 없거나 공백이면 값 자체를 노출하지 않고 기동 실패한다.
- request byte 수, context/target 필드 수, 필드 문자열 길이와 모델 completion token 수에 유한한 상한을 둔다.
- 공급자 오류나 출력 계약 위반은 HTTP 502의 일반화된 오류로 반환하고 원문 응답이나 시크릿을 노출하지 않는다.
- 자동 검증은 fake 모델만 사용하고 실제 OpenAI 네트워크 호출은 사람이 수동 smoke test로 수행한다.
- 인증, rate limit, 동시 호출 제한, 예산 경보, 모델 비교 평가, confidence 임계값과 자동 채택은 이 Issue에 추가하지 않는다.

---

### Task 1: v1 매핑 계약과 전체 응답 검증

**Files:**

- Create: `backend/src/main/java/com/careerform/llm/mapping/domain/LlmMappingRequest.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/domain/LlmMappingResponse.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/domain/ProfileFieldKeys.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/application/MappingModelClient.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/application/LlmMappingValidator.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/application/LlmMappingService.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/application/InvalidLlmMappingRequestException.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/application/LlmUpstreamException.java`
- Test: `backend/src/test/java/com/careerform/llm/mapping/application/LlmMappingServiceTest.java`

- [x] **Step 1: 정상 결과와 잘못된 공급자 결과를 표현하는 실패 테스트 작성**

`LlmMappingServiceTest`에 합성 메타데이터만 사용해 정상 경로와 각 전체 거부 조건을 고정한다.

```java
class LlmMappingServiceTest {

    private static final LlmMappingRequest REQUEST = new LlmMappingRequest(
        List.of(new LlmMappingRequest.ContextField(
            "context-1", "input", "text", "known-email", "email",
            "이메일", true, "contact.email"
        )),
        List.of(
            new LlmMappingRequest.TargetField(
                "target-1", "input", "text", "unknown-a", "field-a",
                "연락 항목", true
            ),
            new LlmMappingRequest.TargetField(
                "target-2", "select", "select-one", "unknown-b", "field-b",
                "선택 항목", false
            )
        )
    );

    @Test
    void acceptsEveryTargetExactlyOnce() {
        MappingModelClient model = ignored -> new LlmMappingResponse(1, List.of(
            new LlmMappingResponse.Mapping("target-1", "contact.phoneNumber", 0.91),
            new LlmMappingResponse.Mapping("target-2", "NO_MATCH", 0.64)
        ));

        LlmMappingResponse response = service(model).map(REQUEST);

        assertThat(response.mappings()).hasSize(2);
    }

    @ParameterizedTest
    @MethodSource("invalidResponses")
    void rejectsTheWholeInvalidProviderResponse(LlmMappingResponse response) {
        MappingModelClient model = ignored -> response;

        assertThatThrownBy(() -> service(model).map(REQUEST))
            .isInstanceOf(LlmUpstreamException.class)
            .hasMessage("LLM 매핑 응답 계약을 확인할 수 없습니다");
    }

    static Stream<LlmMappingResponse> invalidResponses() {
        return Stream.of(
            new LlmMappingResponse(2, List.of(valid("target-1"), valid("target-2"))),
            new LlmMappingResponse(1, List.of(valid("target-1"))),
            new LlmMappingResponse(1, List.of(valid("target-1"), valid("target-1"))),
            new LlmMappingResponse(1, List.of(valid("target-1"), valid("unknown"))),
            new LlmMappingResponse(1, List.of(valid("target-1"), valid("context-1"))),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "career.companyName", 0.5)
            )),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "NO_MATCH", 1.01)
            )),
            null
        );
    }
}
```

- [x] **Step 2: Task 1 테스트가 계약 타입 부재로 실패하는지 확인**

Run:

```bash
cd backend
./gradlew test --tests com.careerform.llm.mapping.application.LlmMappingServiceTest
```

Expected: 새 DTO와 서비스가 없어서 컴파일 실패한다.

- [x] **Step 3: v1 DTO와 모델 포트 구현**

요청 record에는 Bean Validation을 선언하고 DOM 식별자와 표시명은 빈 문자열을 허용하되 null과 과도한 길이는 거부한다. `fieldId`, `element`, `control`, context의 `profileFieldKey`는 공백일 수 없다.

```java
public record LlmMappingRequest(
    @NotNull @Size(max = 100) List<@Valid ContextField> contextFields,
    @NotNull @Size(min = 1, max = 100) List<@Valid TargetField> targetFields
) {
    public record ContextField(
        @NotBlank @Size(max = 128) String fieldId,
        @NotBlank @Size(max = 32) String element,
        @NotBlank @Size(max = 32) String control,
        @NotNull @Size(max = 120) String domId,
        @NotNull @Size(max = 120) String domName,
        @NotNull @Size(max = 120) String displayName,
        boolean required,
        @NotBlank @Size(max = 80) String profileFieldKey
    ) {}

    public record TargetField(
        @NotBlank @Size(max = 128) String fieldId,
        @NotBlank @Size(max = 32) String element,
        @NotBlank @Size(max = 32) String control,
        @NotNull @Size(max = 120) String domId,
        @NotNull @Size(max = 120) String domName,
        @NotNull @Size(max = 120) String displayName,
        boolean required
    ) {}
}

public record LlmMappingResponse(
    int schemaVersion,
    List<Mapping> mappings
) {
    public record Mapping(
        String targetFieldId,
        String profileFieldKey,
        Double confidence
    ) {}
}

@FunctionalInterface
public interface MappingModelClient {
    LlmMappingResponse map(LlmMappingRequest request);
}
```

- [x] **Step 4: PROFILE_FIELDS 기반 허용 목록 구현**

`ProfileFieldKeys`는 아래 범주 키를 정확히 보유하고 `evidenceDocumentPath`, 경력, 논문, 해외경험, 수상, 자기소개서와 저장 금지 필드를 넣지 않는다.

```java
static final Set<String> ALLOWED = Set.of(
    "personal.koreanFamilyName", "personal.koreanGivenName",
    "personal.hanjaFamilyName", "personal.hanjaGivenName",
    "personal.englishFamilyName", "personal.englishGivenName",
    "personal.gender", "personal.birthDate", "personal.nationality",
    "contact.email", "contact.phoneNumber", "contact.postalCode",
    "contact.addressLine1", "contact.addressLine2",
    "education.degreeLevel", "education.country", "education.schoolName",
    "education.startDate", "education.endDate", "education.admissionType",
    "education.completionStatus", "education.gpaScore", "education.gpaScale",
    "education.majorClassification", "education.majorField", "education.majorName",
    "education.additionalMajorClassification", "education.additionalMajorField",
    "education.additionalMajorName",
    "languages.language", "languages.testName", "languages.registrationNo",
    "languages.acquisitionDate", "languages.grade", "languages.conversationalLevel",
    "certifications.name", "certifications.grade", "certifications.registrationNo",
    "certifications.issuer", "certifications.acquisitionDate",
    "projects.startDate", "projects.endDate", "projects.projectName",
    "projects.role", "projects.activityDetails",
    "military.militaryStatus", "military.militaryBranch",
    "military.militarySpecialty", "military.militaryRank",
    "military.serviceStartDate", "military.serviceEndDate",
    "military.dischargeType", "military.exemptionReason",
    "veteran.veteranStatus", "veteran.veteranType",
    "veteran.veteranRelation", "veteran.veteranNumber",
    "disability.disabilityStatus", "disability.disabilityType",
    "disability.disabilityGrade", "disability.disabilityRegistrationDate",
    "health.healthItemName", "health.healthStatusOrValue",
    "health.healthDate", "health.healthDetails"
);
```

- [x] **Step 5: 입력과 공급자 응답의 집합 계약 구현**

`LlmMappingValidator`는 context와 target ID의 각 집합 내부 중복 및 두 집합 교집합을 입력 오류로 처리한다. context 키가 허용 목록 밖이면 입력 오류다. 응답은 v1, non-null mappings, target 수와 동일한 크기, 모든 target의 정확히 한 번 등장, context/unknown ID 부재, 허용 키 또는 `NO_MATCH`, 유한한 0.0~1.0 confidence를 모두 만족해야 한다.

```java
void validateResponse(LlmMappingRequest request, LlmMappingResponse response) {
    if (response == null || response.schemaVersion() != 1 || response.mappings() == null) {
        throw invalidUpstream();
    }
    Set<String> expected = request.targetFields().stream()
        .map(LlmMappingRequest.TargetField::fieldId)
        .collect(Collectors.toUnmodifiableSet());
    Set<String> contextIds = request.contextFields().stream()
        .map(LlmMappingRequest.ContextField::fieldId)
        .collect(Collectors.toUnmodifiableSet());
    Set<String> seen = new HashSet<>();
    for (LlmMappingResponse.Mapping mapping : response.mappings()) {
        if (mapping == null
            || !expected.contains(mapping.targetFieldId())
            || contextIds.contains(mapping.targetFieldId())
            || !seen.add(mapping.targetFieldId())
            || !(ProfileFieldKeys.isAllowed(mapping.profileFieldKey())
                || "NO_MATCH".equals(mapping.profileFieldKey()))
            || mapping.confidence() == null
            || !Double.isFinite(mapping.confidence())
            || mapping.confidence() < 0.0
            || mapping.confidence() > 1.0) {
            throw invalidUpstream();
        }
    }
    if (!seen.equals(expected) || response.mappings().size() != expected.size()) {
        throw invalidUpstream();
    }
}
```

- [x] **Step 6: 모델 예외와 검증 실패를 원문 없는 upstream 오류로 감싸는 서비스 구현**

```java
public LlmMappingResponse map(LlmMappingRequest request) {
    validator.validateRequest(request);
    try {
        LlmMappingResponse response = modelClient.map(request);
        validator.validateResponse(request, response);
        return new LlmMappingResponse(1, List.copyOf(response.mappings()));
    }
    catch (InvalidLlmMappingRequestException | LlmUpstreamException exception) {
        throw exception;
    }
    catch (RuntimeException exception) {
        throw new LlmUpstreamException(
            "LLM 매핑 응답 계약을 확인할 수 없습니다", exception
        );
    }
}
```

- [x] **Step 7: Task 1 단위 테스트 통과 확인**

Run:

```bash
cd backend
./gradlew test --tests com.careerform.llm.mapping.application.LlmMappingServiceTest
```

Expected: 정상, 누락, 중복, unknown/context ID, 허용 목록 밖 키, `NO_MATCH`, confidence 경계와 모델 예외 테스트가 모두 통과한다.

- [x] **Step 8: Task 1 커밋**

```bash
git add backend/src/main/java/com/careerform/llm/mapping backend/src/test/java/com/careerform/llm/mapping/application/LlmMappingServiceTest.java
git commit -m "feat: LLM 매핑 계약과 전체 응답 검증 추가"
```

---

### Task 2: 기능 플래그와 fake 모델 HTTP 세로 단면

**Files:**

- Create: `backend/src/main/java/com/careerform/llm/mapping/config/LlmMappingProperties.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/config/LlmMappingConfiguration.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/api/LlmMappingController.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/api/LlmMappingExceptionHandler.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/api/LlmMappingRequestBodyAdvice.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/api/LlmRequestLimits.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/api/LlmRequestTooLargeException.java`
- Create: `backend/src/test/resources/llm/mapping-request-v1.json`
- Test: `backend/src/test/java/com/careerform/llm/mapping/api/LlmMappingApiTest.java`
- Test: `backend/src/test/java/com/careerform/llm/mapping/api/LlmMappingRequestBodyAdviceTest.java`
- Modify: `backend/src/main/resources/application.yml`

- [x] **Step 1: fake 모델을 거치는 실패하는 MockMvc 테스트 작성**

테스트 설정은 `career-form.llm.enabled=true`, 합성 API 설정과 `@Primary MappingModelClient` fake를 제공한다. fixture에는 프로필 값, URL, 원본 HTML, 계정·세션 정보가 없다.

```java
@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "career-form.llm.model=gpt-5.6-luna",
    "spring.ai.openai.api-key=not-a-secret"
})
@AutoConfigureMockMvc
class LlmMappingApiTest {

    @Test
    void mapsSyntheticMetadataThroughFakeModel() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("/llm/mapping-request-v1.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.schemaVersion").value(1))
            .andExpect(jsonPath("$.mappings[0].targetFieldId").value("target-1"))
            .andExpect(jsonPath("$.mappings[0].profileFieldKey").value("contact.phoneNumber"));
    }

    @TestConfiguration
    static class FakeModelConfiguration {
        @Bean
        @Primary
        MappingModelClient fakeModel() {
            return ignored -> new LlmMappingResponse(1, List.of(
                new LlmMappingResponse.Mapping(
                    "target-1", "contact.phoneNumber", 0.91
                )
            ));
        }
    }
}
```

- [x] **Step 2: HTTP 테스트가 endpoint 부재로 실패하는지 확인**

Run:

```bash
cd backend
./gradlew test --tests com.careerform.llm.mapping.api.LlmMappingApiTest
```

Expected: `/api/v1/llm/mappings` handler가 없어 테스트가 실패한다.

- [x] **Step 3: 기능 설정과 request 상한 구현**

```java
@Validated
@ConfigurationProperties("career-form.llm")
public record LlmMappingProperties(
    boolean enabled,
    String model,
    @Min(1) @Max(100) int maxContextFields,
    @Min(1) @Max(100) int maxTargetFields,
    @Min(1024) @Max(262144) int maxRequestBytes,
    @Min(128) @Max(8192) int maxOutputTokens
) {}
```

`application.yml`에는 아래 안전한 기본값을 둔다. 역직렬화 전 원문 stream과 accepted request의 canonical JSON byte 수를 각각 확인하고 `max-request-bytes`를 넘으면 413용 예외를 던진다. context/target 개수는 properties 값과 DTO의 절대 상한을 모두 확인한다.

```yaml
career-form:
  llm:
    enabled: ${CAREER_FORM_LLM_ENABLED:false}
    provider: ${CAREER_FORM_LLM_PROVIDER:openai}
    model: ${CAREER_FORM_LLM_MODEL:}
    max-context-fields: 50
    max-target-fields: 50
    max-request-bytes: 65536
    max-output-tokens: ${CAREER_FORM_LLM_MAX_OUTPUT_TOKENS:2048}

spring:
  jackson:
    deserialization:
      fail-on-unknown-properties: true
```

- [x] **Step 4: 조건부 controller와 값 비노출 예외 응답 구현**

```java
@RestController
@ConditionalOnProperty(
    prefix = "career-form.llm", name = "enabled", havingValue = "true"
)
final class LlmMappingController {

    @PostMapping("/api/v1/llm/mappings")
    LlmMappingResponse map(@Valid @RequestBody LlmMappingRequest request) {
        return service.map(request);
    }
}

@RestControllerAdvice
@ConditionalOnProperty(
    prefix = "career-form.llm", name = "enabled", havingValue = "true"
)
final class LlmMappingExceptionHandler {

    @ExceptionHandler(LlmUpstreamException.class)
    ResponseEntity<ApiError> upstream() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
            .body(new ApiError("llm_upstream_error", "LLM 매핑을 완료하지 못했습니다"));
    }
}
```

같은 advice에서 Bean Validation, JSON 해석/unknown property, 입력 집합 오류는 값 없는 400, request byte 상한은 값 없는 413으로 반환한다. 공급자 예외 메시지와 cause는 HTTP body에 넣지 않는다.

- [x] **Step 5: 오류와 비활성화 HTTP 테스트 보강**

`LlmMappingApiTest`에 다음 요청을 추가한다.

```java
mockMvc.perform(post("/api/v1/llm/mappings")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
            {"contextFields":[],"targetFields":[],"url":"https://invalid.example"}
            """))
    .andExpect(status().isBadRequest())
    .andExpect(content().string(not(containsString("invalid.example"))));
```

별도 비활성 property test는 API key 없이 애플리케이션 context가 성공하고 endpoint bean이 없음을 확인한다. 과대 필드 수, 과대 문자열, context/target 중복 ID, 허용 목록 밖 context 키, canonical request byte 상한과 upstream 오류의 502 전체 거부도 검증한다.

- [x] **Step 6: Task 2 HTTP 및 단위 테스트 통과 확인**

Run:

```bash
cd backend
./gradlew test --tests 'com.careerform.llm.mapping.*'
```

Expected: fake 모델 요청-응답 한 사이클, 비활성 context, 입력 오류, 413와 502 오류 계약이 실제 네트워크 호출 없이 모두 통과한다.

- [x] **Step 7: Task 2 커밋**

```bash
git add backend/src/main/java/com/careerform/llm/mapping backend/src/main/resources/application.yml backend/src/test/java/com/careerform/llm/mapping/api/LlmMappingApiTest.java backend/src/test/resources/llm/mapping-request-v1.json
git commit -m "feat: 비식별 LLM 매핑 HTTP API 추가"
```

---

### Task 3: OpenAI 네이티브 structured output 연결과 설정 실패 경계

**Files:**

- Modify: `backend/build.gradle.kts`
- Create: `backend/src/main/java/com/careerform/llm/mapping/infrastructure/openai/LlmProviderSettings.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/infrastructure/openai/OpenAiMappingConfiguration.java`
- Create: `backend/src/main/java/com/careerform/llm/mapping/infrastructure/openai/OpenAiMappingModelClient.java`
- Modify: `backend/src/main/java/com/careerform/llm/mapping/config/LlmMappingConfiguration.java`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/careerform/llm/mapping/infrastructure/openai/OpenAiMappingModelClientTest.java`
- Test: `backend/src/test/java/com/careerform/llm/mapping/config/LlmConfigurationContextTest.java`

- [x] **Step 1: OpenAI starter 부재와 실패하는 adapter 테스트 작성**

먼저 현재 classpath에 provider starter가 없음을 확인한다.

```bash
cd backend
./gradlew dependencyInsight --dependency spring-ai-starter-model-openai --configuration runtimeClasspath
```

Expected: matching dependency가 없다고 출력한다.

`OpenAiMappingModelClientTest`는 캡처 fake `ChatModel`이 합성 JSON을 반환하도록 하고, 실제 `ChatClient` entity 변환을 거친 결과와 provider 옵션을 검사한다.

```java
@Test
void usesNativeSchemaAndPinnedOpenAiOptions() {
    CapturingChatModel chatModel = new CapturingChatModel("""
        {"schemaVersion":1,"mappings":[
          {"targetFieldId":"target-1","profileFieldKey":"NO_MATCH","confidence":0.4}
        ]}
        """);
    OpenAiMappingModelClient client = new OpenAiMappingModelClient(
        ChatClient.builder(chatModel),
        new LlmProviderSettings("gpt-5.6-luna", "none", 2048),
        new ObjectMapper()
    );

    LlmMappingResponse response = client.map(singleTargetRequest());

    OpenAiChatOptions options = (OpenAiChatOptions) chatModel.lastPrompt().getOptions();
    assertThat(options.getModel()).isEqualTo("gpt-5.6-luna");
    assertThat(options.getReasoningEffort()).isEqualTo("none");
    assertThat(options.getMaxCompletionTokens()).isEqualTo(2048);
    assertThat(options.getResponseFormat().getType())
        .isEqualTo(OpenAiChatModel.ResponseFormat.Type.JSON_SCHEMA);
    assertThat(options.getResponseFormat().getJsonSchema())
        .contains("schemaVersion", "mappings", "targetFieldId");
    assertThat(response.mappings()).hasSize(1);
}
```

- [x] **Step 2: adapter 테스트가 provider 타입 부재로 실패하는지 확인**

Run:

```bash
cd backend
./gradlew test --tests com.careerform.llm.mapping.infrastructure.openai.OpenAiMappingModelClientTest
```

Expected: OpenAI starter/options 또는 adapter 타입이 없어 컴파일 실패한다.

- [x] **Step 3: OpenAI provider starter 추가**

기존 공급자 중립 client 의존성은 유지하고 같은 BOM의 provider starter만 추가한다.

```kotlin
implementation(platform("org.springframework.ai:spring-ai-bom:2.0.0"))
implementation("org.springframework.ai:spring-ai-client-chat")
implementation("org.springframework.ai:spring-ai-starter-model-openai")
```

- [x] **Step 4: 활성 설정 검증과 provider 옵션 구현**

`LlmMappingConfiguration`의 enabled configuration은 API key와 model에 `StringUtils.hasText`를 적용한다. 오류 메시지는 이름만 말하고 값을 연결하지 않는다. 모델은 Issue 계약의 정확한 ID만 허용한다.

```java
@Bean
LlmProviderSettings llmProviderSettings(
    LlmMappingProperties properties,
    @Value("${spring.ai.openai.api-key:}") String apiKey
) {
    if (!StringUtils.hasText(apiKey)) {
        throw new IllegalStateException(
            "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
        );
    }
    if (!"gpt-5.6-luna".equals(properties.model())) {
        throw new IllegalStateException(
            "LLM 활성화에는 gpt-5.6-luna model 설정이 필요합니다"
        );
    }
    return new LlmProviderSettings(
        properties.model(), "none", properties.maxOutputTokens()
    );
}
```

어댑터는 입력 record만 JSON으로 직렬화하며 시스템 프롬프트에 허용 키 목록과 `NO_MATCH` 원칙을 넣는다. `.entity(..., spec -> spec.useProviderStructuredOutput())`가 전달한 schema를 provider API의 strict JSON Schema로 설정하도록 한다.

```java
public LlmMappingResponse map(LlmMappingRequest request) {
    try {
        LlmMappingResponse response = chatClient.prompt()
            .system(systemPrompt())
            .user(objectMapper.writeValueAsString(request))
            .options(OpenAiChatOptions.builder()
                .model(settings.model())
                .reasoningEffort(settings.reasoningEffort())
                .maxCompletionTokens(settings.maxOutputTokens())
                .store(false)
                .build())
            .call()
            .entity(
                LlmMappingResponse.class,
                spec -> spec.useProviderStructuredOutput()
            );
        if (response == null) {
            throw new LlmUpstreamException(
                "LLM 매핑 응답 계약을 확인할 수 없습니다"
            );
        }
        return response;
    }
    catch (LlmUpstreamException exception) {
        throw exception;
    }
    catch (RuntimeException exception) {
        throw new LlmUpstreamException(
            "LLM 매핑 응답 계약을 확인할 수 없습니다", exception
        );
    }
}
```

- [x] **Step 5: timeout, retry, 출력 상한과 로그 비노출 설정 추가**

```yaml
spring:
  ai:
    chat:
      observations:
        log-prompt: false
        log-completion: false
        include-error-logging: false
    openai:
      api-key: ${OPENAI_API_KEY:}
      timeout: ${CAREER_FORM_LLM_TIMEOUT:10s}
      max-retries: ${CAREER_FORM_LLM_MAX_RETRIES:1}
      chat:
        model: ${CAREER_FORM_LLM_MODEL:}
        reasoning-effort: none
        max-completion-tokens: ${CAREER_FORM_LLM_MAX_OUTPUT_TOKENS:2048}
        store: false
```

- [x] **Step 6: 비활성/설정 누락/유효 설정 context 테스트 작성**

`LlmConfigurationContextTest`는 `WebApplicationContextRunner`와 fake `ChatModel`을 사용한다.

```java
@Test
void disabledStartsWithoutApiKey() {
    baseRunner.withPropertyValues("career-form.llm.enabled=false")
        .run(context -> assertThat(context)
            .hasNotFailed()
            .doesNotHaveBean(LlmMappingController.class));
}

@Test
void enabledWithoutApiKeyFailsWithoutPrintingAValue() {
    baseRunner.withPropertyValues(
            "career-form.llm.enabled=true",
            "career-form.llm.model=gpt-5.6-luna")
        .run(context -> assertThat(context)
            .hasFailed()
            .getFailure()
            .hasRootCauseMessage(
                "LLM 활성화에는 OpenAI API key 설정이 필요합니다"
            ));
}

@Test
void enabledWithValidSettingsStartsWithoutCallingNetwork() {
    baseRunner.withPropertyValues(
            "career-form.llm.enabled=true",
            "career-form.llm.model=gpt-5.6-luna",
            "spring.ai.openai.api-key=not-a-secret")
        .run(context -> assertThat(context)
            .hasNotFailed()
            .hasSingleBean(MappingModelClient.class));
}
```

모델 누락과 공백도 별도 케이스로 실패시키며 failure message에 입력한 합성 key가 나타나지 않는지 확인한다.

- [x] **Step 7: Task 3 테스트와 provider dependency 해석 확인**

Run:

```bash
cd backend
./gradlew dependencyInsight --dependency spring-ai-starter-model-openai --configuration runtimeClasspath
./gradlew test --tests com.careerform.llm.mapping.infrastructure.openai.OpenAiMappingModelClientTest --tests com.careerform.llm.mapping.config.LlmConfigurationContextTest
```

Expected: `spring-ai-starter-model-openai:2.0.0`, native JSON Schema와 고정 옵션, 세 설정 context가 확인되고 실제 외부 호출은 없다.

- [x] **Step 8: Task 3 커밋**

```bash
git add backend/build.gradle.kts backend/src/main/java/com/careerform/llm/mapping backend/src/main/resources/application.yml backend/src/test/java/com/careerform/llm/mapping/infrastructure/openai/OpenAiMappingModelClientTest.java backend/src/test/java/com/careerform/llm/mapping/config/LlmConfigurationContextTest.java
git commit -m "feat: OpenAI 구조화 매핑 호출 연결"
```

---

### Task 4: 안전한 환경 예시와 운영 문서

**Files:**

- Create: `.env.example`
- Modify: `backend/README.md`
- Modify: `docs/plans/40-llm-mapping.md`

- [x] **Step 1: 빈 시크릿과 안전한 기본값만 있는 환경 예시 작성**

```dotenv
SPRING_PROFILES_ACTIVE=local
SPRING_MONGODB_URI=mongodb://mongodb:27017/career-form
CAREER_FORM_LLM_ENABLED=false
CAREER_FORM_LLM_PROVIDER=openai
CAREER_FORM_LLM_MODEL=gpt-5.6-luna
CAREER_FORM_LLM_TIMEOUT=10s
CAREER_FORM_LLM_MAX_RETRIES=1
CAREER_FORM_LLM_MAX_OUTPUT_TOKENS=2048
OPENAI_API_KEY=
```

`.gitignore`의 `.env`, `.env.*`, `!.env.example` 계약을 유지하고 `.env.local`과 실제 key는 추적하지 않는다.

- [x] **Step 2: README의 LLM 기반 설명을 실제 설정과 사람 담당 절차로 교체**

README에는 다음 사실을 한 번씩만 기록한다.

```markdown
## LLM 매핑 API

LLM 매핑은 기본 비활성화되어 API key 없이도 애플리케이션과 CI가 기동한다.
활성화할 때는 `CAREER_FORM_LLM_ENABLED=true`, `CAREER_FORM_LLM_PROVIDER=openai`,
`CAREER_FORM_LLM_MODEL=gpt-5.6-luna`, `OPENAI_API_KEY`를 실행 환경에 주입한다.
운영 프로파일도 같은 명시적 설정으로 활성화할 수 있지만 인증, rate limit,
동시 호출 제한과 비용 경보는 아직 없으므로 공개 인터넷 노출 여부는 사람이 판단한다.

현재 `gpt-5.6-luna`와 reasoning effort `none`은 세로 단면 데모를 위한 잠정값이다.
후속 평가는 동일한 비식별 사례에서 Mistral Small 4, GPT-5.6 Luna,
GPT-5.4 nano, Gemini 3.1 Flash-Lite의 비용, 오매핑, 매핑 범위,
confidence 보정과 응답 속도를 비교하고 모델 선택 ADR을 작성한다.
```

실제 key를 넣은 1회 OpenAI smoke test는 사람 담당이며 요청 본문, 공급자 원문과 key를 로그·Issue·PR에 남기지 않는다고 명시한다.

- [x] **Step 3: 문서와 시크릿 추적 경계 검증**

Run:

```bash
git check-ignore .env.local
test -z "$(git check-ignore .env.example)"
rg -n "CAREER_FORM_LLM_ENABLED|gpt-5\.6-luna|reasoning effort|Mistral Small 4|Gemini 3\.1 Flash-Lite" .env.example backend/README.md
git grep -nE 'sk-[A-Za-z0-9_-]{16,}' -- . ':!docs/plans/40-llm-mapping.md'
```

Expected: `.env.local`은 ignored, `.env.example`은 negation으로 추적 가능, 설정과 후속 평가 설명은 검색되고 실제 key 형태는 없다.

- [x] **Step 4: Task 4 커밋**

```bash
git add .env.example backend/README.md docs/plans/40-llm-mapping.md
git commit -m "docs: LLM 매핑 설정과 평가 계획 기록"
```

---

### Task 5: 전체 검증과 독립 코드 리뷰

**Files:**

- Verify: `backend/build.gradle.kts`
- Verify: `backend/src/main/java/com/careerform/llm/mapping/`
- Verify: `backend/src/main/resources/application.yml`
- Verify: `backend/src/test/java/com/careerform/llm/mapping/`
- Verify: `backend/src/test/resources/llm/mapping-request-v1.json`
- Verify: `.env.example`
- Verify: `backend/README.md`
- Verify: `docs/plans/40-llm-mapping.md`

- [x] **Step 1: 관련 테스트와 clean backend 검증 실행**

```bash
cd backend
./gradlew test --tests 'com.careerform.llm.mapping.*'
./gradlew clean check
./gradlew bootJar
```

Expected: 네트워크 호출 없이 모든 테스트, JaCoCo 80% 검증과 bootJar가 종료 코드 0으로 끝난다.

- [x] **Step 2: 저장소 전체 검증 실행**

```bash
cd ..
.venv/bin/python harness/scripts/verify.py
git diff --check
```

Expected: 하네스 전체 검증과 whitespace 검사가 종료 코드 0으로 끝난다.

- [x] **Step 3: 개인정보, 출력 계약과 범위 점검**

```bash
git diff --name-only origin/develop...HEAD
git grep -nE 'sk-[A-Za-z0-9_-]{16,}' -- . ':!docs/plans/40-llm-mapping.md'
rg -n "evidenceDocumentPath|career\.|essay|URL|cookie|session" backend/src/main backend/src/test
rg -n "gpt-5\.6-luna|reasoning-effort|max-completion-tokens|max-retries|timeout|log-prompt|log-completion" backend/src/main/resources/application.yml backend/src/main/java/com/careerform/llm/mapping
```

Expected: 변경은 Issue #40 파일에 한정되고 실제 시크릿이 없으며, 금지된 프로필 키가 allowlist에 없고 고정 모델·reasoning·상한·로그 비노출 설정이 확인된다.

- [x] **Step 4: Standards와 Issue spec 두 축 코드 리뷰**

`origin/develop...HEAD`를 기준으로 `cf-code-review`를 실행한다. 저장소 규칙, 경계 검증, 개인정보/시크릿 비노출, Issue #40의 정상·실패·설정 인수 조건을 각각 추적한다. 치명적 또는 높은 위험 finding은 수정하고 Task 5 검증을 처음부터 다시 실행한다.

- [x] **Step 5: 최종 Git 상태 확인**

```bash
git status --short
git log --oneline origin/develop..HEAD
git diff --stat origin/develop...HEAD
```

Expected: worktree가 깨끗하고 커밋은 Task 1~4의 논리적 변경만 포함한다.

package com.careerform.llm.mapping.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.llm.mapping.domain.LlmMappingRequest;
import com.careerform.llm.mapping.domain.LlmMappingResponse;

class LlmMappingServiceTest {

    private static final String UPSTREAM_ERROR = "LLM 매핑 응답 계약을 확인할 수 없습니다";

    private static final LlmMappingRequest REQUEST = new LlmMappingRequest(
        List.of(new LlmMappingRequest.ContextField(
            "context-1",
            "input",
            "text",
            "known-email",
            "email",
            "이메일",
            true,
            "contact.email"
        )),
        List.of(
            new LlmMappingRequest.TargetField(
                "target-1",
                "input",
                "text",
                "unknown-a",
                "field-a",
                "연락 항목",
                true
            ),
            new LlmMappingRequest.TargetField(
                "target-2",
                "select",
                "select-one",
                "unknown-b",
                "field-b",
                "선택 항목",
                false
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

        assertThat(response).isEqualTo(new LlmMappingResponse(1, List.of(
            new LlmMappingResponse.Mapping("target-1", "contact.phoneNumber", 0.91),
            new LlmMappingResponse.Mapping("target-2", "NO_MATCH", 0.64)
        )));
    }

    @ParameterizedTest
    @MethodSource("invalidResponses")
    void rejectsTheWholeInvalidProviderResponse(LlmMappingResponse response) {
        MappingModelClient model = ignored -> response;

        assertThatThrownBy(() -> service(model).map(REQUEST))
            .isInstanceOf(LlmUpstreamException.class)
            .hasMessage(UPSTREAM_ERROR);
    }

    @Test
    void wrapsProviderFailuresWithoutExposingTheirMessage() {
        MappingModelClient model = ignored -> {
            throw new IllegalStateException("provider-private-response");
        };

        assertThatThrownBy(() -> service(model).map(REQUEST))
            .isInstanceOf(LlmUpstreamException.class)
            .hasMessage(UPSTREAM_ERROR)
            .hasCauseInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @MethodSource("invalidRequests")
    void rejectsAmbiguousOrUnsupportedRequestsBeforeCallingTheModel(LlmMappingRequest request) {
        MappingModelClient model = ignored -> {
            throw new AssertionError("잘못된 요청으로 모델을 호출하면 안 됩니다");
        };

        assertThatThrownBy(() -> service(model).map(request))
            .isInstanceOf(InvalidLlmMappingRequestException.class)
            .hasMessage("LLM 매핑 요청 계약이 올바르지 않습니다");
    }

    private static Stream<LlmMappingResponse> invalidResponses() {
        Stream<LlmMappingResponse> malformed = Stream.of(
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
                new LlmMappingResponse.Mapping("target-2", "languages.evidenceDocumentPath", 0.5)
            )),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "NO_MATCH", -0.01)
            )),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "NO_MATCH", 1.01)
            )),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "NO_MATCH", Double.NaN)
            )),
            new LlmMappingResponse(1, List.of(
                valid("target-1"),
                new LlmMappingResponse.Mapping("target-2", "NO_MATCH", null)
            )),
            new LlmMappingResponse(1, null)
        );
        return Stream.concat(malformed, Stream.of((LlmMappingResponse) null));
    }

    private static Stream<LlmMappingRequest> invalidRequests() {
        LlmMappingRequest.ContextField context = REQUEST.contextFields().getFirst();
        LlmMappingRequest.TargetField firstTarget = REQUEST.targetFields().getFirst();
        LlmMappingRequest.TargetField secondTarget = REQUEST.targetFields().get(1);
        return Stream.of(
            new LlmMappingRequest(List.of(context, context), REQUEST.targetFields()),
            new LlmMappingRequest(
                REQUEST.contextFields(),
                List.of(firstTarget, firstTarget)
            ),
            new LlmMappingRequest(
                REQUEST.contextFields(),
                List.of(new LlmMappingRequest.TargetField(
                    "context-1",
                    secondTarget.element(),
                    secondTarget.control(),
                    secondTarget.domId(),
                    secondTarget.domName(),
                    secondTarget.displayName(),
                    secondTarget.required()
                ))
            ),
            new LlmMappingRequest(
                List.of(new LlmMappingRequest.ContextField(
                    context.fieldId(),
                    context.element(),
                    context.control(),
                    context.domId(),
                    context.domName(),
                    context.displayName(),
                    context.required(),
                    "career.companyName"
                )),
                REQUEST.targetFields()
            ),
            new LlmMappingRequest(
                List.of(new LlmMappingRequest.ContextField(
                    context.fieldId(),
                    context.element(),
                    context.control(),
                    context.domId(),
                    context.domName(),
                    context.displayName(),
                    context.required(),
                    null
                )),
                REQUEST.targetFields()
            )
        );
    }

    private static LlmMappingResponse.Mapping valid(String targetFieldId) {
        return new LlmMappingResponse.Mapping(targetFieldId, "NO_MATCH", 0.5);
    }

    private static LlmMappingService service(MappingModelClient model) {
        return new LlmMappingService(model, new LlmMappingValidator());
    }
}

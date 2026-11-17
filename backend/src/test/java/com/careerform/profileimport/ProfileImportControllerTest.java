package com.careerform.profileimport;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;

import com.careerform.address.AddressRateLimiter;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;

@ExtendWith(OutputCaptureExtension.class)
@DisplayName("이력서 글자 프로필 초안 API 요청 제한과 미구성")
class ProfileImportControllerTest {
    private static final String TEXT = "합성 이력서 SYNTHETIC-CONTROLLER-469";
    private static final String REPLY = """
        {"model":"gpt-synthetic-469","choices":[{"finish_reason":"stop","message":{"content":"{}"}}]}
        """;

    private static ProfileImportService service(OpenAiChoiceModel.Transport transport) {
        var schema = new ProfileDraftSchema();
        var model = transport == null ? null
            : new ResumeExtractionModel(transport, "gpt-synthetic-469", "none", 1024, schema);
        return new ProfileImportService(model, schema, 20_000, "gpt-synthetic-469", null, null);
    }

    private static MockHttpServletRequest client(String address) {
        var request = new MockHttpServletRequest("POST", "/api/v1/profile-import/resume");
        request.setRemoteAddr(address);
        return request;
    }

    @Test
    @DisplayName("주소 검색과 같은 고정 창 제한을 넘으면 모델을 부르지 않고 429와 Retry-After를 돌려준다")
    void limitsRequestsPerClient(CapturedOutput output) {
        var calls = new AtomicInteger();
        var controller = new ProfileImportController(service(body -> {
            calls.incrementAndGet();
            return new OpenAiChoiceModel.Reply(200, REPLY);
        }), new AddressRateLimiter(1, Duration.ofHours(1), 100));

        var first = controller.importResume(new ProfileImportController.ResumeRequest(TEXT), client("192.0.2.1"));
        var limited = controller.importResume(new ProfileImportController.ResumeRequest(TEXT), client("192.0.2.1"));
        var other = controller.importResume(new ProfileImportController.ResumeRequest(TEXT), client("192.0.2.2"));

        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(limited.getStatusCode().value()).isEqualTo(429);
        assertThat(limited.getHeaders().getFirst("Retry-After")).isEqualTo("3600");
        assertThat(limited.getBody()).isEqualTo(Map.of("error", "RATE_LIMITED"));
        assertThat(other.getStatusCode().value()).isEqualTo(200);
        assertThat(calls).hasValue(2);
        assertThat(output.getOut()).contains("PROFILE_IMPORT_RESULT result=RATE_LIMITED");
        assertThat(output.getAll()).doesNotContain("SYNTHETIC-CONTROLLER-469");
    }

    @Test
    @DisplayName("OpenAI 키가 없으면 503 PROFILE_IMPORT_NOT_CONFIGURED로 알린다")
    void reportsMissingConfiguration(CapturedOutput output) {
        var controller = new ProfileImportController(service(null), new AddressRateLimiter(10, Duration.ofHours(1), 100));

        var response = controller.importResume(new ProfileImportController.ResumeRequest(TEXT), client("192.0.2.1"));

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "PROFILE_IMPORT_NOT_CONFIGURED"));
        assertThat(output.getOut()).contains("PROFILE_IMPORT_RESULT result=NOT_CONFIGURED");
    }

    @Test
    @DisplayName("요청과 응답 객체의 문자열 표현에는 원문과 추출 값이 없다")
    void redactsRequestAndResponseText() {
        assertThat(new ProfileImportController.ResumeRequest(TEXT).toString()).doesNotContain(TEXT);
        var draft = new ProfileImportController.DraftResponse(1, Map.of("personal", Map.of("koreanFamilyName", "홍합성")));
        assertThat(draft.toString()).doesNotContain("홍합성");
    }
}

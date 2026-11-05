package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.exception.TokenLimitExceeded;
import com.careerform.monitoring.ModelCallRecording;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("OpenAI 선택 모델: 질문마다 선택지 하나와 확신도를 엄격 JSON으로 받는다")
class OpenAiChoiceModelTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Map<String, ChoiceModel.Question> QUESTIONS = questions();

    /** 보낸 본문을 기록하고 정해진 응답을 순서대로 돌려준다. */
    static final class FakeTransport implements OpenAiChoiceModel.Transport {
        final List<String> bodies = new ArrayList<>();
        private final List<OpenAiChoiceModel.Reply> replies;

        FakeTransport(OpenAiChoiceModel.Reply... replies) {
            this.replies = new ArrayList<>(List.of(replies));
        }

        @Override
        public OpenAiChoiceModel.Reply send(String body) {
            bodies.add(body);
            return replies.removeFirst();
        }
    }

    private static Map<String, ChoiceModel.Question> questions() {
        Map<String, String> criteria = new LinkedHashMap<>();
        criteria.put("personal.personal.birthDate", "Applicant birth date");
        criteria.put(ChoiceModel.ABSTAIN, "No supported field");
        return Map.of("field_0", new ChoiceModel.Question("Map fields.field_0 to one profile field.", criteria));
    }

    private static OpenAiChoiceModel.Reply ok(String content) {
        String body = JSON.createObjectNode()
            .put("model", "gpt-6-luna-2026-09-22")
            .set("choices", JSON.createArrayNode().add(JSON.createObjectNode()
                .put("finish_reason", "stop")
                .set("message", JSON.createObjectNode().put("role", "assistant").put("content", content))))
            .toString();
        JsonNode node = JSON.readTree(body);
        ((tools.jackson.databind.node.ObjectNode) node).set("usage", JSON.createObjectNode()
            .put("prompt_tokens", 1200).put("completion_tokens", 40));
        return new OpenAiChoiceModel.Reply(200, node.toString());
    }

    private static OpenAiChoiceModel model(FakeTransport transport) {
        return new OpenAiChoiceModel(transport, "gpt-6-luna", "none", 0.8, 1, delay -> { });
    }

    @Test
    @DisplayName("모델·추론 강도·시스템 문구·상태·질문을 보내고, 질문별 선택지 enum 엄격 스키마로 답을 받는다")
    void sendsStrictSchemaAndParsesJudgement() {
        var transport = new FakeTransport(ok("{\"field_0\":{\"choice\":\"personal.personal.birthDate\",\"confidence\":0.93}}"));
        List<ModelCallRecording.Attempt> attempts = new ArrayList<>();

        var answers = ModelCallRecording.within(attempts::add,
            () -> model(transport).answer(Map.of("fields", Map.of("field_0", Map.of("label", "생년월일"))), QUESTIONS));

        assertThat(answers.get("field_0").choice()).isEqualTo("personal.personal.birthDate");
        assertThat(answers.get("field_0").confidence()).isEqualTo(0.93);
        assertThat(answers.get("field_0").probabilities()).isEmpty();
        JsonNode sent = JSON.readTree(transport.bodies.getFirst());
        assertThat(sent.path("model").asString()).isEqualTo("gpt-6-luna");
        assertThat(sent.path("reasoning_effort").asString()).isEqualTo("none");
        assertThat(sent.path("store").asBoolean(true)).isFalse();
        assertThat(sent.path("messages").get(0).path("role").asString()).isEqualTo("system");
        assertThat(sent.path("messages").get(0).path("content").asString()).isEqualTo(OpenAiChoiceModel.SYSTEM_PROMPT);
        JsonNode user = JSON.readTree(sent.path("messages").get(1).path("content").asString());
        assertThat(user.path("state").path("fields").path("field_0").path("label").asString()).isEqualTo("생년월일");
        assertThat(user.path("questions").path("field_0").path("criteria").path("ABSTAIN").asString())
            .isEqualTo("No supported field");
        JsonNode schema = sent.path("response_format").path("json_schema");
        assertThat(schema.path("strict").asBoolean()).isTrue();
        JsonNode choice = schema.path("schema").path("properties").path("field_0").path("properties").path("choice");
        assertThat(choice.path("enum")).extracting(JsonNode::asString)
            .containsExactlyInAnyOrder("personal.personal.birthDate", "ABSTAIN");
        assertThat(attempts).singleElement().satisfies(attempt -> {
            assertThat(attempt.provider()).isEqualTo("openai");
            assertThat(attempt.operation()).isEqualTo("answer");
            assertThat(attempt.httpStatus()).isEqualTo(200);
            assertThat(attempt.outcome()).isEqualTo(ModelCallRecording.Outcome.SUCCESS);
            assertThat(attempt.inputTokens()).isEqualTo(1200L);
            assertThat(attempt.outputTokens()).isEqualTo(40L);
            assertThat(attempt.observedModel()).isEqualTo("gpt-6-luna-2026-09-22");
        });
    }

    @Test
    @DisplayName("choose는 확신도 기준 미만의 답을 ABSTAIN으로 바꾼다")
    void chooseAppliesConfidenceCut() {
        var high = new FakeTransport(ok("{\"field_0\":{\"choice\":\"personal.personal.birthDate\",\"confidence\":0.8}}"));
        var low = new FakeTransport(ok("{\"field_0\":{\"choice\":\"personal.personal.birthDate\",\"confidence\":0.79}}"));

        assertThat(model(high).choose(Map.of(), QUESTIONS)).containsEntry("field_0", "personal.personal.birthDate");
        assertThat(model(low).choose(Map.of(), QUESTIONS)).containsEntry("field_0", ChoiceModel.ABSTAIN);
    }

    @Test
    @DisplayName("선택지 밖의 답, 빠진 질문, 범위 밖 확신도는 응답 전체를 쓰지 않고 사용량은 남긴다")
    void rejectsInvalidAnswersButKeepsUsage() {
        for (String content : List.of(
            "{\"field_0\":{\"choice\":\"invented.key\",\"confidence\":0.9}}",
            "{}",
            "{\"field_0\":{\"choice\":\"ABSTAIN\",\"confidence\":1.5}}",
            "not json")) {
            List<ModelCallRecording.Attempt> attempts = new ArrayList<>();
            assertThatThrownBy(() -> ModelCallRecording.within(attempts::add,
                () -> model(new FakeTransport(ok(content))).answer(Map.of(), QUESTIONS)))
                .isInstanceOf(ResolverException.class);
            assertThat(attempts).singleElement().satisfies(attempt -> {
                assertThat(attempt.outcome()).isEqualTo(ModelCallRecording.Outcome.INVALID_RESPONSE);
                assertThat(attempt.inputTokens()).isEqualTo(1200L);
            });
        }
    }

    @Test
    @DisplayName("429는 정해진 횟수만큼 다시 보내고 시도마다 기록한다")
    void retriesRateLimit() {
        var transport = new FakeTransport(new OpenAiChoiceModel.Reply(429, "{\"error\":{\"code\":\"rate_limit_exceeded\"}}"),
            ok("{\"field_0\":{\"choice\":\"ABSTAIN\",\"confidence\":0.6}}"));
        List<ModelCallRecording.Attempt> attempts = new ArrayList<>();

        var answers = ModelCallRecording.within(attempts::add, () -> model(transport).answer(Map.of(), QUESTIONS));

        assertThat(answers.get("field_0").choice()).isEqualTo(ChoiceModel.ABSTAIN);
        assertThat(attempts).extracting(ModelCallRecording.Attempt::outcome)
            .containsExactly(ModelCallRecording.Outcome.HTTP_ERROR, ModelCallRecording.Outcome.SUCCESS);
        assertThat(attempts.getFirst().httpStatus()).isEqualTo(429);
    }

    @Test
    @DisplayName("입력 길이 초과는 토큰 한도 예외로 알려 범용 로직이 배치를 나누게 한다")
    void contextLengthIsTokenLimit() {
        var transport = new FakeTransport(new OpenAiChoiceModel.Reply(400,
            "{\"error\":{\"code\":\"context_length_exceeded\",\"message\":\"too long\"}}"));

        var seen = new java.util.ArrayList<com.careerform.monitoring.ModelCallRecording.Attempt>();

        assertThatThrownBy(() -> com.careerform.monitoring.ModelCallRecording.within(seen::add,
            () -> model(transport).answer(Map.of(), QUESTIONS))).isInstanceOf(TokenLimitExceeded.class);
        assertThat(seen).singleElement().satisfies(attempt -> assertThat(attempt.outcome())
            .isEqualTo(com.careerform.monitoring.ModelCallRecording.Outcome.TOKEN_LIMIT));
    }

    @Test
    @DisplayName("다른 오류와 잘림(finish_reason=length)은 사용할 수 없는 응답이다")
    void otherFailuresAreUnavailable() {
        String truncated = ok("{\"field_0\":").body().replace("\"stop\"", "\"length\"");
        assertThatThrownBy(() -> model(new FakeTransport(new OpenAiChoiceModel.Reply(500, "{}"))).answer(Map.of(), QUESTIONS))
            .isInstanceOf(ResolverException.class);
        assertThatThrownBy(() -> model(new FakeTransport(new OpenAiChoiceModel.Reply(200, truncated))).answer(Map.of(), QUESTIONS))
            .isInstanceOf(ResolverException.class);
    }

    @Test
    @DisplayName("OpenAI 호환 공급자: json_object 형식이면 스키마 대신 답 모양을 시스템 문구로 알리고 추론 옵션을 빼며 공급자 이름으로 기록한다")
    void compatibleProtocolUsesJsonObjectAndProviderName() {
        var transport = new FakeTransport(ok("{\"field_0\":{\"choice\":\"ABSTAIN\",\"confidence\":0.4}}"));
        var protocol = new OpenAiChoiceModel.Protocol("deepseek", OpenAiChoiceModel.ResponseFormat.JSON_OBJECT, null);
        var model = new OpenAiChoiceModel(transport, protocol, "deepseek-chat", 0.8, 1, delay -> { });
        List<ModelCallRecording.Attempt> attempts = new ArrayList<>();

        var answers = ModelCallRecording.within(attempts::add, () -> model.answer(Map.of(), QUESTIONS));

        assertThat(answers.get("field_0").choice()).isEqualTo("ABSTAIN");
        JsonNode sent = JSON.readTree(transport.bodies.getFirst());
        assertThat(sent.has("reasoning_effort")).isFalse();
        assertThat(sent.path("response_format").path("type").asString()).isEqualTo("json_object");
        assertThat(sent.path("response_format").has("json_schema")).isFalse();
        String system = sent.path("messages").get(0).path("content").asString();
        assertThat(system).startsWith(OpenAiChoiceModel.SYSTEM_PROMPT).contains("Return only a JSON object");
        assertThat(model.provider()).isEqualTo("deepseek");
        assertThat(model.promptParts()).containsEntry("system", system);
        assertThat(attempts).singleElement().extracting(ModelCallRecording.Attempt::provider).isEqualTo("deepseek");
    }

    @Test
    @DisplayName("HTTP 요청은 등록한 주소로 보내고 키가 없으면 인증 헤더를 붙이지 않는다")
    void httpRequestUsesEndpointAndOptionalKey() {
        var endpoint = java.net.URI.create("https://api.deepseek.com/v1/chat/completions");

        var withKey = OpenAiChoiceModel.request(endpoint, "secret-key", 1000, "{}");
        var withoutKey = OpenAiChoiceModel.request(endpoint, null, 1000, "{}");

        assertThat(withKey.uri()).isEqualTo(endpoint);
        assertThat(withKey.headers().firstValue("Authorization")).contains("Bearer secret-key");
        assertThat(withoutKey.headers().firstValue("Authorization")).isEmpty();
    }

    @Test
    @DisplayName("시스템 문구는 프롬프트 조각으로 버전 해시에 들어간다")
    void systemPromptIsPromptSource() {
        var model = model(new FakeTransport());

        assertThat(model.provider()).isEqualTo("openai");
        assertThat(model.model()).isEqualTo("gpt-6-luna");
        assertThat(model.promptSourceId()).isEqualTo("openai-choice-protocol");
        assertThat(model.promptParts()).containsEntry("system", OpenAiChoiceModel.SYSTEM_PROMPT);
    }
}

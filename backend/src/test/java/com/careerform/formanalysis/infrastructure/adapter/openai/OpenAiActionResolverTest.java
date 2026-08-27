package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Item;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Site;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@DisplayName("OpenAI 액션 해석기")
class OpenAiActionResolverTest {

    private static final String PRIVATE_SITE_MARKER =
        "private-site.example.test";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("액션 판단에는 승인된 표시 문맥과 true 상태만 전달한다")
    void sendsOnlyApprovedActionMetadata() {
        CapturingChatModel model = new CapturingChatModel("""
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "revealSections": [{
                "candidateId": "action-reveal",
                "targetSectionId": "section-target"
              }],
              "addRepeatableGroups": [{"candidateId": "action-add"}],
              "noActions": [{"candidateId": "action-direct"}]
            }
            """);
        OpenAiActionResolver resolver = resolver(model);

        ActionResolver.Resolution resolution = resolver.resolve(request());

        assertThat(resolution).isEqualTo(new ActionResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolver.RevealAction(
                    "action-reveal",
                    "section-target"
                ),
                new ActionResolver.AddAction("action-add"),
                new ActionResolver.NoAction("action-direct")
            )
        ));
        assertThat(model.lastPrompt().getUserMessage().getText()).isEqualTo(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"sections\":["
                + "{\"sectionId\":\"section-actions\",\"displayName\":\"학력\","
                + "\"actionCandidates\":[{\"candidateId\":\"action-direct\","
                + "\"displayName\":\"학력 펼치기\",\"element\":\"button\","
                + "\"control\":\"button\",\"visibility\":\"hidden\","
                + "\"domId\":\"synthetic-action-id\","
                + "\"domName\":\"synthetic-action-name\",\"disabled\":true}],"
                + "\"items\":[{\"itemId\":\"item-1\",\"actionCandidates\":[{"
                + "\"candidateId\":\"action-add\",\"element\":\"input\","
                + "\"control\":\"button\",\"visibility\":\"visible\"}]}]},"
                + "{\"sectionId\":\"section-target\","
                + "\"parentSectionId\":\"section-actions\","
                + "\"actionCandidates\":[{\"candidateId\":\"action-reveal\","
                + "\"displayName\":\"합성 버튼\",\"element\":\"custom\","
                + "\"control\":\"custom\",\"visibility\":\"visible\"}]}]}"
        );
        assertThat(model.lastPrompt().getUserMessage().getText())
            .doesNotContain(
                "site",
                PRIVATE_SITE_MARKER,
                "value",
                "html",
                "url",
                "account",
                "session",
                "selector",
                "executionCount",
                "readonly",
                "inert"
            );
    }

    @Test
    @DisplayName("액션 판단 결과는 실행 정보가 없는 세 가지 목록으로만 받는다")
    void requestsDecisionOnlyBuckets() {
        CapturingChatModel model = new CapturingChatModel("""
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "revealSections": [],
              "addRepeatableGroups": [],
              "noActions": [
                {"candidateId": "action-direct"},
                {"candidateId": "action-add"},
                {"candidateId": "action-reveal"}
              ]
            }
            """);

        resolver(model).resolve(request());

        Prompt prompt = model.lastPrompt();
        assertThat(prompt.getSystemMessage().getText()).contains(
            "schemaVersion 2",
            "every candidate exactly once",
            "revealSections",
            "addRepeatableGroups",
            "noActions",
            "Do not click",
            "execution count"
        );
        OpenAiChatOptions options = (OpenAiChatOptions) prompt.getOptions();
        assertThat(options.getStore()).isTrue();
        assertThat(options.getResponseFormat()).isNotNull();
        String schema = options.getResponseFormat().getJsonSchema();
        assertThat(schema).contains(
            "revealSections",
            "addRepeatableGroups",
            "noActions"
        ).doesNotContain("command", "expectedEffect");
        JsonNode root = objectMapper.readTree(schema);
        assertThat(root.get("additionalProperties").asBoolean()).isFalse();
        assertThat(root.get("required").values().stream()
            .map(JsonNode::asString))
            .containsExactlyInAnyOrder(
                "schemaVersion",
                "snapshotId",
                "revealSections",
                "addRepeatableGroups",
                "noActions"
            );
    }

    private OpenAiActionResolver resolver(ChatModel model) {
        return new OpenAiActionResolver(new OpenAiClient(
            ChatClient.builder(model),
            objectMapper
        ));
    }

    private static PreparationAnalysisRequest request() {
        return new PreparationAnalysisRequest(
            2,
            "snapshot-1",
            new Site(PRIVATE_SITE_MARKER, "/private-path-marker/*"),
            List.of(
                new Section(
                    "section-actions",
                    null,
                    "학력",
                    List.of(new ActionCandidate(
                        "action-direct",
                        FormElement.BUTTON,
                        FormControl.BUTTON,
                        Visibility.HIDDEN,
                        "학력 펼치기",
                        "synthetic-action-id",
                        "synthetic-action-name",
                        true,
                        false,
                        null
                    )),
                    List.of(new Item(
                        "item-1",
                        List.of(new ActionCandidate(
                            "action-add",
                            FormElement.INPUT,
                            FormControl.BUTTON,
                            Visibility.VISIBLE,
                            null,
                            null,
                            null,
                            false,
                            false,
                            false
                        ))
                    ))
                ),
                new Section(
                    "section-target",
                    "section-actions",
                    null,
                    List.of(new ActionCandidate(
                        "action-reveal",
                        FormElement.CUSTOM,
                        FormControl.CUSTOM,
                        Visibility.VISIBLE,
                        "합성 버튼",
                        null,
                        null,
                        null,
                        null,
                        null
                    )),
                    null
                )
            )
        );
    }

    private static final class CapturingChatModel implements ChatModel {

        private final String responseJson;
        private Prompt lastPrompt;

        private CapturingChatModel(String responseJson) {
            this.responseJson = responseJson;
        }

        @Override
        public ChatResponse call(Prompt prompt) {
            lastPrompt = prompt;
            return new ChatResponse(List.of(
                new Generation(new AssistantMessage(responseJson))
            ));
        }

        @Override
        public ChatOptions getOptions() {
            return OpenAiChatOptions.builder().build();
        }

        private Prompt lastPrompt() {
            return lastPrompt;
        }
    }
}

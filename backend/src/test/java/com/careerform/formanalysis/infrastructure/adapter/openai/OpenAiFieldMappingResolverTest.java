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

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Option;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@DisplayName("OpenAI 필드 매핑 해석기")
class OpenAiFieldMappingResolverTest {

    private static final String PRIVATE_SITE_MARKER =
        "private-site.example.test";
    private static final String PRIVATE_DOM_MARKER = "private-dom-marker";
    private static final String PRIVATE_PLACEHOLDER_MARKER =
        "private-placeholder-marker";
    private static final String PRIVATE_OPTION_ID_MARKER =
        "private-option-id-marker";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("필드 매핑에는 후보와 표시 문맥만 전달한다")
    void sendsOnlyApprovedFieldMetadata() {
        CapturingChatModel model = new CapturingChatModel("""
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "matches": [{
                "candidateId": "field-direct",
                "profileFieldKey": "contact.contact.email"
              }]
            }
            """);

        FieldMappingResolver.Resolution resolution = resolver(model).resolve(request());

        assertThat(resolution).isEqualTo(new FieldMappingResolver.Resolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolver.Match(
                    "field-direct",
                    "contact.contact.email"
                ),
                new FieldMappingResolver.NoMatch("field-item-1"),
                new FieldMappingResolver.NoMatch("field-item-2")
            )
        ));
        assertThat(model.lastPrompt().getUserMessage().getText()).isEqualTo(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"sections\":["
                + "{\"sectionId\":\"section-root\",\"displayName\":\"기본 정보\","
                + "\"fields\":[{\"candidateId\":\"field-direct\","
                + "\"displayName\":\"이메일\",\"element\":\"input\","
                + "\"control\":\"text\"}],\"items\":[{\"itemId\":\"item-1\","
                + "\"fields\":[{\"candidateId\":\"field-item-1\","
                + "\"displayName\":\"국적\",\"element\":\"select\","
                + "\"control\":\"select\",\"options\":[{"
                + "\"displayName\":\"대한민국\"}]},{\"candidateId\":\"field-item-2\","
                + "\"element\":\"input\",\"control\":\"text\"}]}]},"
                + "{\"sectionId\":\"section-child\","
                + "\"parentSectionId\":\"section-root\",\"fields\":[]}]}"
        );
        assertThat(model.lastPrompt().getUserMessage().getText())
            .doesNotContain(
                "site",
                "visibility",
                "domId",
                "domName",
                "placeholder",
                "optionId",
                "disabled",
                "readonly",
                "inert",
                PRIVATE_SITE_MARKER,
                PRIVATE_DOM_MARKER,
                PRIVATE_PLACEHOLDER_MARKER,
                PRIVATE_OPTION_ID_MARKER
            );
    }

    @Test
    @DisplayName("확실한 필드 매치와 canonical key enum만 요청한다")
    void requestsOnlyConfidentMatchesWithCanonicalKeyEnum() {
        CapturingChatModel model = new CapturingChatModel("""
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "matches": []
            }
            """);

        resolver(model).resolve(request());

        Prompt prompt = model.lastPrompt();
        assertThat(prompt.getSystemMessage().getText())
            .contains(
                "schemaVersion 2",
                "matches",
                "Omit candidates",
                "contact.contact.email"
            )
            .doesNotContain("noMatches");
        OpenAiChatOptions options = (OpenAiChatOptions) prompt.getOptions();
        assertThat(options.getStore()).isTrue();
        assertThat(options.getResponseFormat()).isNotNull();
        String schema = options.getResponseFormat().getJsonSchema();
        JsonNode root = objectMapper.readTree(schema);
        assertThat(root.get("additionalProperties").asBoolean()).isFalse();
        assertThat(root.get("required").values().stream()
            .map(JsonNode::asString))
            .containsExactlyInAnyOrder(
                "schemaVersion",
                "snapshotId",
                "matches"
            );
        assertThat(root.get("properties").has("noMatches")).isFalse();
        JsonNode profileFieldKeyEnum = root.at(
            "/properties/matches/items/properties/profileFieldKey/enum"
        );
        assertThat(profileFieldKeyEnum.isArray()).isTrue();
        assertThat(profileFieldKeyEnum.values().stream().map(JsonNode::asString))
            .containsExactlyElementsOf(new SupportedProfileFields().keys());
    }

    private OpenAiFieldMappingResolver resolver(ChatModel model) {
        return new OpenAiFieldMappingResolver(
            new OpenAiClient(ChatClient.builder(model), objectMapper),
            new SupportedProfileFields()
        );
    }

    private static FieldsAnalysisRequest request() {
        return new FieldsAnalysisRequest(
            2,
            "snapshot-1",
            new Site(PRIVATE_SITE_MARKER, "/private-path-marker/*"),
            List.of(
                new Section(
                    "section-root",
                    null,
                    "기본 정보",
                    List.of(field(
                        "field-direct",
                        "이메일",
                        FormElement.INPUT,
                        FormControl.TEXT,
                        null
                    )),
                    List.of(new Item(
                        "item-1",
                        List.of(
                            field(
                                "field-item-1",
                                "국적",
                                FormElement.SELECT,
                                FormControl.SELECT,
                                List.of(new Option(
                                    PRIVATE_OPTION_ID_MARKER,
                                    "대한민국"
                                ))
                            ),
                            field(
                                "field-item-2",
                                null,
                                FormElement.INPUT,
                                FormControl.TEXT,
                                null
                            )
                        )
                    ))
                ),
                new Section(
                    "section-child",
                    "section-root",
                    null,
                    List.of(),
                    null
                )
            )
        );
    }

    private static FieldCandidate field(
        String candidateId,
        String displayName,
        FormElement element,
        FormControl control,
        List<Option> options
    ) {
        return new FieldCandidate(
            candidateId,
            element,
            control,
            Visibility.HIDDEN,
            displayName,
            PRIVATE_DOM_MARKER,
            PRIVATE_DOM_MARKER,
            PRIVATE_PLACEHOLDER_MARKER,
            true,
            true,
            true,
            options
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

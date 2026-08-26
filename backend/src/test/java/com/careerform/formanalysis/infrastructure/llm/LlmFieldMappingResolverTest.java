package com.careerform.formanalysis.infrastructure.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.ProfileFieldCatalog;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class LlmFieldMappingResolverTest {

    private static final String PRIVATE_SITE_MARKER = "private-site.example.test";
    private static final String PRIVATE_DOM_MARKER = "private-dom-marker";
    private static final String PRIVATE_PLACEHOLDER_MARKER = "private-placeholder-marker";
    private static final String PRIVATE_OPTION_ID_MARKER = "private-option-id-marker";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void projectsOnlyApprovedFieldMetadataAndPreservesGrouping() {
        CapturingClient client = client(validOutput());
        LlmFieldMappingResolver resolver = new LlmFieldMappingResolver(client);

        FieldMappingResolution resolution = resolver.resolve(snapshot());

        assertThat(resolution).isEqualTo(new FieldMappingResolution(
            2,
            "snapshot-1",
            List.of(
                new FieldMappingResolution.Match(
                    "field-direct",
                    "contact.contact.email"
                ),
                new FieldMappingResolution.NoMatch("field-item-1"),
                new FieldMappingResolution.NoMatch("field-item-2")
            )
        ));
        assertThat(objectMapper.writeValueAsString(client.input)).isEqualTo(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"sections\":["
                + "{\"sectionId\":\"section-root\",\"displayName\":\"기본 정보\","
                + "\"fields\":[{\"candidateId\":\"field-direct\","
                + "\"displayName\":\"이메일\",\"element\":\"input\","
                + "\"control\":\"text\"}],\"items\":[{\"itemId\":\"item-1\","
                + "\"fields\":[{\"candidateId\":\"field-item-1\","
                + "\"displayName\":\"국적\",\"element\":\"select\","
                + "\"control\":\"select\",\"options\":[{"
                + "\"displayName\":\"대한민국\"}]},{"
                + "\"candidateId\":\"field-item-2\",\"element\":\"input\","
                + "\"control\":\"text\"}]}]},{"
                + "\"sectionId\":\"section-child\","
                + "\"parentSectionId\":\"section-root\",\"fields\":[]}]}"
        );
        assertThat(objectMapper.writeValueAsString(client.input))
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
    void suppliesCanonicalAllowlistPromptAndStrictProviderSchema() {
        CapturingClient client = client(validOutput());

        new LlmFieldMappingResolver(client).resolve(snapshot());

        assertThat(client.outputType).isEqualTo(LlmFieldMappingContract.Output.class);
        assertThat(client.systemPrompt)
            .contains("schemaVersion 2", "MATCH", "NO_MATCH", "exactly once")
            .contains(ProfileFieldCatalog.keys());
        assertThat(client.outputSchema).contains(
            objectMapper.writeValueAsString(
                ProfileFieldCatalog.keys().stream().sorted().toList()
            )
        );
        JsonNode schema = objectMapper.readTree(client.outputSchema);
        assertThat(schema.get("additionalProperties").asBoolean()).isFalse();
        assertThat(schema.get("required").toString())
            .isEqualTo("[\"schemaVersion\",\"snapshotId\",\"results\"]");
        JsonNode branches = schema.get("properties")
            .get("results")
            .get("items")
            .get("anyOf");
        assertThat(branches.size()).isEqualTo(2);
        assertThat(branches.get(0).get("additionalProperties").asBoolean()).isFalse();
        assertThat(branches.get(1).get("additionalProperties").asBoolean()).isFalse();
        assertThat(client.outputSchema)
            .doesNotContain("\"format\"", "\"const\"", "minLength", "maxLength");
    }

    @Test
    void contractDeserializationRejectsMismatchedUnionDecisions() {
        String matchShapeWithNoMatchDecision = """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "results": [{
                "candidateId": "field-1",
                "matchType": "NO_MATCH",
                "profileFieldKey": "contact.contact.email"
              }]
            }
            """;
        String noMatchShapeWithMatchDecision = """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "results": [{
                "candidateId": "field-1",
                "matchType": "MATCH"
              }]
            }
            """;

        assertThatThrownBy(() -> objectMapper.readValue(
            matchShapeWithNoMatchDecision,
            LlmFieldMappingContract.Output.class
        )).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> objectMapper.readValue(
            noMatchShapeWithMatchDecision,
            LlmFieldMappingContract.Output.class
        )).isInstanceOf(RuntimeException.class);
    }

    private static LlmFieldMappingContract.Output validOutput() {
        return new LlmFieldMappingContract.Output(
            2,
            "snapshot-1",
            List.of(
                new LlmFieldMappingContract.Match(
                    "field-direct",
                    LlmFieldMappingContract.MatchDecision.MATCH,
                    "contact.contact.email"
                ),
                new LlmFieldMappingContract.NoMatch(
                    "field-item-1",
                    LlmFieldMappingContract.NoMatchDecision.NO_MATCH
                ),
                new LlmFieldMappingContract.NoMatch(
                    "field-item-2",
                    LlmFieldMappingContract.NoMatchDecision.NO_MATCH
                )
            )
        );
    }

    private static FieldsSnapshot snapshot() {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            new Site(PRIVATE_SITE_MARKER, "/private-path-marker/*"),
            List.of(
                new FieldsSnapshot.Section(
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
                    List.of(new FieldsSnapshot.Item(
                        "item-1",
                        List.of(
                            field(
                                "field-item-1",
                                "국적",
                                FormElement.SELECT,
                                FormControl.SELECT,
                                List.of(new FieldsSnapshot.Option(
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
                new FieldsSnapshot.Section(
                    "section-child",
                    "section-root",
                    null,
                    List.of(),
                    null
                )
            )
        );
    }

    private static FieldsSnapshot.FieldCandidate field(
        String candidateId,
        String displayName,
        FormElement element,
        FormControl control,
        List<FieldsSnapshot.Option> options
    ) {
        return new FieldsSnapshot.FieldCandidate(
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

    private static CapturingClient client(Object response) {
        return new CapturingClient(response);
    }

    private static final class CapturingClient implements LlmStructuredOutputClient {

        private final Object response;
        private String systemPrompt;
        private Object input;
        private Class<?> outputType;
        private String outputSchema;

        private CapturingClient(Object response) {
            this.response = response;
        }

        @Override
        public <O> O generate(
            String systemPrompt,
            Object input,
            Class<O> outputType,
            String outputSchema
        ) {
            this.systemPrompt = systemPrompt;
            this.input = input;
            this.outputType = outputType;
            this.outputSchema = outputSchema;
            return outputType.cast(response);
        }
    }
}

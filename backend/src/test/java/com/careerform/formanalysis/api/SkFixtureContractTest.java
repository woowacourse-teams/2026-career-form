package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

import tools.jackson.databind.ObjectMapper;

@DisplayName("SK 비식별 fixture 계약")
class SkFixtureContractTest {

    private static final List<String> PREPARATION_FIXTURES = List.of(
        "sk-preparation-snapshot-a-v2.json",
        "sk-preparation-structure-mismatch-v2.json"
    );
    private static final List<String> FIELDS_FIXTURES = List.of(
        "sk-fields-snapshot-b-v2.json",
        "sk-fields-structure-mismatch-v2.json"
    );
    private static final List<String> FORBIDDEN_PROPERTIES = List.of(
        "value",
        "checked",
        "selected",
        "html",
        "selector",
        "cookie",
        "session",
        "account",
        "authorization"
    );

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("실제 구조 Snapshot A fixture는 검증한 추가 action exact-set을 보존한다")
    void preservesTheExactActionCandidateSet() throws Exception {
        PreparationAnalysisRequest request = objectMapper.readValue(
            fixture(PREPARATION_FIXTURES.getFirst()),
            PreparationAnalysisRequest.class
        );

        assertThat(request.schemaVersion()).isEqualTo(2);
        assertThat(request.site().pathPattern())
            .isEqualTo("/Application/Index/{postingId}");
        assertThat(request.actionCandidateIdsInTraversalOrder()).containsExactly(
            "action-add-university",
            "action-add-career",
            "action-add-certificate",
            "action-add-language-test"
        );
    }

    @Test
    @DisplayName("실제 구조 Snapshot B fixture는 안전하게 검증한 field exact-set을 보존한다")
    void preservesTheExactFieldCandidateSet() throws Exception {
        FieldsAnalysisRequest request = objectMapper.readValue(
            fixture(FIELDS_FIXTURES.getFirst()),
            FieldsAnalysisRequest.class
        );

        assertThat(request.schemaVersion()).isEqualTo(2);
        assertThat(request.fieldCandidateIdsInTraversalOrder()).containsExactly(
            "field-korean-full-name",
            "field-english-given-name",
            "field-english-family-name",
            "field-email",
            "field-phone",
            "field-nationality",
            "field-postal-code",
            "field-address-line-1",
            "field-address-line-2",
            "field-high-school-name",
            "field-university-name",
            "field-university-status"
        );
    }

    @Test
    @DisplayName("모든 SK fixture는 값과 실행 metadata를 포함하지 않는다")
    void excludesPrivateValuesAndExecutionMetadata() throws Exception {
        for (String name : allFixtures()) {
            String fixture = fixture(name);
            String compactJson = objectMapper.readTree(fixture).toString().toLowerCase();

            for (String property : FORBIDDEN_PROPERTIES) {
                assertThat(compactJson).doesNotContain("\"" + property + "\":");
            }
            assertThat(compactJson).doesNotContain("?", "#");
        }
    }

    private static List<String> allFixtures() {
        return java.util.stream.Stream.concat(
            PREPARATION_FIXTURES.stream(),
            FIELDS_FIXTURES.stream()
        ).toList();
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}

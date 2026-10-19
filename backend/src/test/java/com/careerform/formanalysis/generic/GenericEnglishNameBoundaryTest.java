package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.client;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticLabel;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsResponse.NameBinding;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

@DisplayName("범용 영문 이름 선택 경계")
class GenericEnglishNameBoundaryTest {

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "Given name then family name|GIVEN_FIRST|ENGLISH_FULL_NAME_GIVEN_FIRST",
        "Family name then given name|FAMILY_FIRST|ENGLISH_FULL_NAME_FAMILY_FIRST",
        "Given name first, family name last|GIVEN_FIRST|ENGLISH_FULL_NAME_GIVEN_FIRST",
        "Family name first, given name last|FAMILY_FIRST|ENGLISH_FULL_NAME_FAMILY_FIRST",
        "Full name (given name then family name)|GIVEN_FIRST|ENGLISH_FULL_NAME_GIVEN_FIRST",
        "English full name: family name then given name|FAMILY_FIRST|ENGLISH_FULL_NAME_FAMILY_FIRST",
        "  GIVEN NAME   THEN FAMILY NAME  |GIVEN_FIRST|ENGLISH_FULL_NAME_GIVEN_FIRST"
    })
    @DisplayName("명시적 순서 관측을 읽은 모의 JEV의 선택은 기존 이름 binding과 confidence로 돌아온다")
    void explicitOrderSurvivesProjection(String hint, String evidence, String recipe) {
        respondToCapturedEvidence();

        var result = resolve(candidate("English full name", hint, null));

        assertThat(http.calls().getFirst().state().path("fields").path("field_0")
            .path("englishNameOrderEvidence").asString()).isEqualTo(evidence);
        assertThat(result).isEqualTo(new Mapping(null, 0.87, true, null,
            new NameBinding(DerivedRecipe.valueOf(recipe))));
    }

    @Test
    @DisplayName("칸 자체의 라벨과 설명에서만 순서를 읽고 범위가 넓은 섹션 제목은 순서로 사용하지 않는다")
    void readsFieldOwnedFixedStatements() {
        respondToCapturedEvidence();
        var fromLabel = resolve(candidate("Full name (given name then family name)", null, null));
        var fromDescription = resolve(candidate("Full name", null,
            List.of(new SemanticLabel(SemanticSource.DESCRIPTION, "Family name then given name"))));
        var headingOnly = resolve(candidate("Full name", null,
            List.of(new SemanticLabel(SemanticSource.SECTION_HEADING, "Family name then given name"))));

        assertThat(fromLabel.binding()).isEqualTo(new NameBinding(DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST));
        assertThat(fromDescription.binding()).isEqualTo(new NameBinding(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST));
        assertThat(headingOnly).isEqualTo(new Mapping(null, 0.87, true, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "Full name", "Given name Family name", "Family name Given name",
        "Do not use given name then family name", "Not given name first, family name last",
        "Given name then family name?", "Given name or family name", "First name only"
    })
    @DisplayName("순서가 없거나 모호하거나 부정된 문구에서는 순서를 만들지 않고 기권한다")
    void absentOrAmbiguousOrderAbstains(String hint) {
        respondToCapturedEvidence();

        var result = resolve(candidate("Full name", hint, null));

        assertThat(http.calls().getFirst().state().path("fields").path("field_0")
            .has("englishNameOrderEvidence")).isFalse();
        assertThat(result).isEqualTo(new Mapping(null, 0.87, true, null));
    }

    @Test
    @DisplayName("라벨과 설명의 명시적 순서가 충돌하면 CONFLICT만 전달하고 기권한다")
    void conflictingStatementsAbstain() {
        respondToCapturedEvidence();

        var result = resolve(candidate("Full name (given name then family name)", null,
            List.of(new SemanticLabel(SemanticSource.DESCRIPTION, "Family name then given name"))));

        assertThat(http.calls().getFirst().state().path("fields").path("field_0")
            .path("englishNameOrderEvidence").asString()).isEqualTo("CONFLICT");
        assertThat(result).isEqualTo(new Mapping(null, 0.87, true, null));
    }

    @Test
    @DisplayName("전체 이름 관측이 있어도 공급자의 DIRECT 선택을 코드가 레시피로 치환하지 않는다")
    void directProviderChoiceIsNotRewritten() {
        http.respond(call -> answerAll(call, "personal.personal.englishGivenName", 0.31));

        var result = resolve(candidate("Full name", "Given name then family name", null));

        assertThat(result).isEqualTo(new Mapping("personal.personal.englishGivenName", 0.31, true, null));
    }

    private Mapping resolve(FieldCandidate candidate) {
        return new JevCategoryFieldResolver(client(http), FIELDS, CATEGORIES, 1, 5, 10, 8000)
            .resolve(request("example.test", List.of(section("personal", "PERSONAL", List.of(candidate)))))
            .mappings().get("name");
    }

    private void respondToCapturedEvidence() {
        http.respond(call -> {
            Map<String, String> choices = new LinkedHashMap<>();
            for (String id : call.questionIds()) {
                String evidence = call.state().path("fields").path(id).path("englishNameOrderEvidence").asString("");
                if (evidence.equals("GIVEN_FIRST")) {
                    choices.put(id, "ENGLISH_FULL_NAME_GIVEN_FIRST");
                }
                else if (evidence.equals("FAMILY_FIRST")) {
                    choices.put(id, "ENGLISH_FULL_NAME_FAMILY_FIRST");
                }
            }
            return answers(call, choices, 0.87);
        });
    }

    private static FieldCandidate candidate(String label, String placeholder, List<SemanticLabel> labels) {
        var context = labels == null ? null : new SemanticContext(labels, null, null, null, null, null, null, null);
        return new FieldCandidate("name", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            label, null, null, placeholder, null, null, null, null, context);
    }
}

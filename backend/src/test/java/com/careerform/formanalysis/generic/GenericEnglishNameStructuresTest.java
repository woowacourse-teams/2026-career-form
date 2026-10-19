package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.client;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.repeatedSection;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Autocomplete;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticLabel;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsResponse.NameBinding;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

/** 모의 공급자는 실제 전송된 관측만 읽는다. 실제 JEV 품질이나 원본 사이트에 없는 순서 근거를 입증하지 않는다. */
@DisplayName("범용 영문 이름 선택의 독립 구조 회귀")
class GenericEnglishNameStructuresTest {

    private static final String FAMILY = "personal.personal.englishFamilyName";
    private static final String GIVEN = "personal.personal.englishGivenName";
    private static final String MARKER = "SYNTHETIC_PRIVATE_5513";
    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @Test
    @DisplayName("단일 영문이름 원본 구조는 순서가 없어 기권하고 명시적 힌트를 추가한 합성 변이만 레시피로 반환한다")
    void singleNameStructureAndExplicitSyntheticVariants() {
        respondToCapturedObservation();

        // Read-only fixture basis: frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/sanitized.html.
        // The original has one text input labeled 영문이름, without ordering evidence.
        var original = resolve(List.of(section("original", "PERSONAL",
            List.of(named("original-name", "영문이름", null, null, null)))));
        var variants = resolve(List.of(
            section("given-first", "PERSONAL", List.of(
                named("given-first", "영문이름", "Given name then family name", null, null))),
            section("family-first", "PERSONAL", List.of(
                named("family-first", "영문이름", "Family name then given name", null, null)))));

        assertThat(original.mappings().get("original-name")).isEqualTo(new Mapping(null, 0.91, true, null));
        assertThat(variants.mappings().get("given-first"))
            .isEqualTo(recipe(DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST));
        assertThat(variants.mappings().get("family-first"))
            .isEqualTo(recipe(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST));
        assertPrivateStructureOnly();
    }

    @Test
    @DisplayName("독립 반복 구조는 정제 문구가 같은 반대 순서 행을 합치지 않고 분리 칸과 불명·충돌 행을 격리한다")
    void oppositeOrderRowsAreNotDeduplicated() {
        respondToCapturedObservation();
        var rows = List.of(
            new Item("row-0", List.of(named("given", "Full name", "Given name then family name", Autocomplete.NAME, null))),
            new Item("row-1", List.of(named("family", "Full name", "Family name then given name", Autocomplete.NAME, null))),
            new Item("row-2", List.of(named("unclear", "Full name", null, Autocomplete.NAME, null))),
            new Item("row-3", List.of(
                named("split-family", "Family name", null, Autocomplete.FAMILY_NAME, null),
                named("split-given", "Given name", null, Autocomplete.GIVEN_NAME, null))),
            new Item("row-4", List.of(named("conflict", "Full name", "Given name then family name", Autocomplete.NAME,
                List.of(new SemanticLabel(SemanticSource.DESCRIPTION, "Family name then given name"))))));

        var resolution = resolve(List.of(repeatedSection("members", "PERSONAL", rows)));

        assertThat(resolution.mappings().get("given")).isEqualTo(recipe(DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST));
        assertThat(resolution.mappings().get("family")).isEqualTo(recipe(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST));
        assertThat(resolution.mappings().get("unclear")).isEqualTo(new Mapping(null, 0.91, true, null));
        assertThat(resolution.mappings().get("conflict")).isEqualTo(new Mapping(null, 0.91, true, null));
        assertThat(resolution.mappings().get("split-family")).isEqualTo(new Mapping(FAMILY, 0.91, true, null));
        assertThat(resolution.mappings().get("split-given")).isEqualTo(new Mapping(GIVEN, 0.91, true, null));
        var observed = http.calls().getFirst().state().path("fields");
        assertThat(observed.size()).isEqualTo(6);
        assertThat(observed.path("field_0").path("rowIndex").asInt()).isZero();
        assertThat(observed.path("field_1").path("rowIndex").asInt()).isEqualTo(1);
        assertThat(observed.path("field_3").path("rowIndex").asInt()).isEqualTo(3);
        assertThat(observed.path("field_4").path("rowIndex").asInt()).isEqualTo(3);
        assertPrivateStructureOnly();
    }

    @Test
    @DisplayName("같은 섹션의 분리 칸과 다른 섹션의 단일 부분 이름 칸은 순서 추정 없이 DIRECT를 유지한다")
    void splitAndSinglePartsRemainDirect() {
        respondToCapturedObservation();

        var resolution = resolve(List.of(
            section("split", "PERSONAL", List.of(
                named("family", "Family name", null, Autocomplete.FAMILY_NAME, null),
                named("given", "Given name", null, Autocomplete.GIVEN_NAME, null))),
            section("one-part", "PERSONAL", List.of(
                named("only-given", "Given name", null, Autocomplete.GIVEN_NAME, null))),
            section("whole", "PERSONAL", List.of(named("whole", "Full name", null, Autocomplete.NAME, null)))));

        assertThat(resolution.mappings().get("family")).isEqualTo(new Mapping(FAMILY, 0.91, true, null));
        assertThat(resolution.mappings().get("given")).isEqualTo(new Mapping(GIVEN, 0.91, true, null));
        assertThat(resolution.mappings().get("only-given")).isEqualTo(new Mapping(GIVEN, 0.91, true, null));
        assertThat(resolution.mappings().get("whole")).isEqualTo(new Mapping(null, 0.91, true, null));
        assertPrivateStructureOnly();
    }

    private JevCategoryFieldResolver.Resolution resolve(List<GenericFieldsRequest.Section> sections) {
        return new JevCategoryFieldResolver(client(http), FIELDS, CATEGORIES, 1, 5, 10, 8000)
            .resolve(request("example.test", sections));
    }

    private void respondToCapturedObservation() {
        http.respond(call -> {
            Map<String, String> choices = new LinkedHashMap<>();
            for (String id : call.questionIds()) {
                var field = call.state().path("fields").path(id);
                String autocomplete = field.path("autocomplete").asString("");
                String evidence = field.path("englishNameOrderEvidence").asString("");
                if (autocomplete.equals("family-name")) {
                    choices.put(id, FAMILY);
                }
                else if (autocomplete.equals("given-name")) {
                    choices.put(id, GIVEN);
                }
                else if (evidence.equals("GIVEN_FIRST")) {
                    choices.put(id, "ENGLISH_FULL_NAME_GIVEN_FIRST");
                }
                else if (evidence.equals("FAMILY_FIRST")) {
                    choices.put(id, "ENGLISH_FULL_NAME_FAMILY_FIRST");
                }
            }
            return answers(call, choices, 0.91);
        });
    }

    private void assertPrivateStructureOnly() {
        assertThat(http.bodies()).isNotEmpty().allSatisfy(body -> assertThat(body)
            .doesNotContain(MARKER, "profileItemCount", "currentValue", "SYNTHETIC_ACCOUNT", "SYNTHETIC_SESSION"));
    }

    private static Mapping recipe(DerivedRecipe recipe) {
        return new Mapping(null, 0.91, true, null, new NameBinding(recipe));
    }

    private static FieldCandidate named(String id, String label, String placeholder,
        Autocomplete autocomplete, List<SemanticLabel> labels) {
        var context = new SemanticContext(labels, null, null, autocomplete, null, null, null, null);
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            label + " " + MARKER, "SYNTHETIC_ACCOUNT_" + MARKER, "SYNTHETIC_SESSION_" + MARKER,
            placeholder, null, null, null, null, context);
    }
}

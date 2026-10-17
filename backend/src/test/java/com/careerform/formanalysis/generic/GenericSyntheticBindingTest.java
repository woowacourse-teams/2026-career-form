package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.JSON;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.client;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

class GenericSyntheticBindingTest {

    private static final String DATE = "personal.personal.birthDate";
    private static final CompanyFormPolicyProvider POLICIES = (host, path) ->
        new CompanyFormPolicyProvider.NotRegistered();

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @ParameterizedTest
    @CsvSource({
        "KOREAN_FULL_NAME,이름",
        "ENGLISH_FULL_NAME_GIVEN_FIRST,영문이름",
        "ENGLISH_FULL_NAME_FAMILY_FIRST,영문이름"
    })
    void combinedNamesAreOfferedInConfirmedAndFallbackCategories(String recipe, String label) {
        for (String category : List.of("PERSONAL", "MIXED", "ABSTAIN")) {
            var result = analyze(category, field("name", label), recipe);
            var json = JSON.valueToTree(result);
            assertThat(json.path("profileFieldKey").isNull()).isTrue();
            assertThat(json.path("binding").path("type").asString()).isEqualTo("DERIVED");
            assertThat(json.path("binding").path("recipe").asString()).isEqualTo(recipe);
            assertThat(result.autofillPolicy().name()).isEqualTo("ALLOWED");
            assertThat(result.interactionStatus().name()).isEqualTo("READY");
            assertThat(result.writePlan().command().name()).isEqualTo("SET_TEXT");
        }
    }

    @ParameterizedTest
    @CsvSource({
        "YEAR,1999|2000|2001",
        "MONTH,01월|02월|12월",
        "DAY,01일|02일|31일",
        "MONTH,1|2|12",
        "DAY,1|2|31",
        "YEAR,1999|2000|기타"
    })
    void datePartsRequireSelectShapeAndKeepDirectPolicy(String part, String options) {
        var candidate = select(options);
        var direct = analyze("PERSONAL", candidate, DATE);
        var result = analyze("PERSONAL", candidate, "DATE_PART:" + DATE + ":" + part);
        var json = JSON.valueToTree(result);
        assertThat(result.profileFieldKey()).isEqualTo(DATE);
        assertThat(json.path("binding").path("type").asString()).isEqualTo("DATE_PART");
        assertThat(json.path("binding").path("part").asString()).isEqualTo(part);
        assertThat(result.interactionStatus()).isEqualTo(direct.interactionStatus());
        assertThat(result.writePlan()).isEqualTo(direct.writePlan());
        assertThat(result.writePlan().command().name()).isEqualTo("SELECT_OPTION");
    }

    @Test
    void oneDocumentCanMapYearMonthAndDayToTheSameDateKey() {
        var year = select("1999|2000");
        var month = select("01월|12월");
        var day = select("01일|31일");
        var candidates = List.of(
            new FieldCandidate("year", year.element(), year.control(), year.visibility(), "생년월일 년",
                null, null, null, null, null, null, year.options()),
            new FieldCandidate("month", month.element(), month.control(), month.visibility(), "생년월일 월",
                null, null, null, null, null, null, month.options()),
            new FieldCandidate("day", day.element(), day.control(), day.visibility(), "생년월일 일",
                null, null, null, null, null, null, day.options()));
        http.respond(call -> answers(call, Map.of(
            "field_0", "DATE_PART:" + DATE + ":YEAR",
            "field_1", "DATE_PART:" + DATE + ":MONTH",
            "field_2", "DATE_PART:" + DATE + ":DAY"), 0.99));
        var response = service().analyze(request("example.test",
            List.of(section("personal", "PERSONAL", candidates))));
        assertThat(response.fields()).extracting(GenericFieldsResponse.Field::profileFieldKey)
            .containsExactly(DATE, DATE, DATE);
        assertThat(response.fields()).extracting(item ->
            JSON.valueToTree(item).path("binding").path("part").asString())
            .containsExactly("YEAR", "MONTH", "DAY");
    }

    @ParameterizedTest
    @CsvSource({
        "YEAR,1999|기타", "YEAR,99|00", "MONTH,0|1|12", "MONTH,1|13",
        "DAY,1|32", "MONTH,0.0|1.5|4.5", "DAY,01월|02월", "YEAR,선택"
    })
    void malformedDateSelectAbstains(String part, String options) {
        assertUnmatched(analyze("PERSONAL", select(options), "DATE_PART:" + DATE + ":" + part));
    }

    @Test
    void datePartOnTextAbstainsWhileFullDateStillMatches() {
        assertUnmatched(analyze("PERSONAL", field("date", "생년월일"), "DATE_PART:" + DATE + ":YEAR"));
        assertThat(analyze("PERSONAL", field("date", "생년월일"), DATE).profileFieldKey()).isEqualTo(DATE);
    }

    @Test
    void splitNamesRemainDirectAndOtherCategoriesDoNotOfferNameRecipes() {
        for (String key : List.of("personal.personal.koreanFamilyName", "personal.personal.koreanGivenName")) {
            var result = analyze("PERSONAL", field("split", "성 또는 이름"), key);
            assertThat(result.profileFieldKey()).isEqualTo(key);
            assertThat(JSON.valueToTree(result).has("binding")).isFalse();
        }
        assertUnmatched(analyze("EDUCATION", field("name", "이름"), "KOREAN_FULL_NAME"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST", "ENGLISH_FULL_NAME_FAMILY_FIRST"})
    void derivedPolicyMatchesSharedServiceAcrossCandidateStates(String recipe) {
        for (String state : List.of("visible", "hidden", "disabled", "readonly", "custom")) {
            var candidate = new FieldCandidate("name",
                state.equals("custom") ? FormElement.CUSTOM : FormElement.INPUT,
                state.equals("custom") ? FormControl.CUSTOM : FormControl.TEXT,
                state.equals("hidden") ? Visibility.HIDDEN : Visibility.VISIBLE,
                "이름", null, null, null, state.equals("disabled"), state.equals("readonly"), false, null);
            FieldMappingResolver resolver = request -> new FieldMappingResolver.Resolution(2, request.snapshotId(),
                List.of(new FieldMappingResolver.Match("name", new DerivedBinding(DerivedRecipe.valueOf(recipe)))));
            var shared = new FieldsAnalysisService(Optional.of(resolver), new FormAnalysisRouter(POLICIES),
                new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(new FieldsAnalysisRequest(
                    2, "synthetic-snapshot", new FieldsAnalysisRequest.Site("example.test", "/apply"),
                    List.of(new FieldsAnalysisRequest.Section("personal", null, "기본정보",
                        List.of(GenericFieldPolicy.toShared(candidate)), null))));
            var matched = (FieldsAnalysisResponse.MatchedFieldAnalysis) shared.fields().getFirst();
            var generic = analyze("PERSONAL", candidate, recipe);
            assertThat(generic.autofillPolicy().name()).isEqualTo(matched.autofillPolicy().name());
            assertThat(generic.interactionStatus().name()).isEqualTo(matched.interactionStatus().name());
            assertThat(generic.writePlan() == null ? null : generic.writePlan().command().name())
                .isEqualTo(matched.writePlan() == null ? null : matched.writePlan().command().name());
        }
    }

    @Test
    void serializedResponseUsesVersionThreeAndContainsOnlyContractFields() {
        http.respond(call -> answerAll(call, "KOREAN_FULL_NAME", 0.95));
        var response = service().analyze(request("example.test",
            List.of(section("personal", "PERSONAL", List.of(field("name", "이름"))))));
        var json = JSON.valueToTree(response);
        assertThat(json.path("schemaVersion").asInt()).isEqualTo(3);
        assertThat(json.path("fields").get(0).propertyNames()).containsExactlyInAnyOrder(
            "candidateId", "profileFieldKey", "confidence", "categoryConfirmed", "autofillPolicy",
            "interactionStatus", "writePlan", "binding");
        assertThat(json.path("fields").get(0).path("binding").propertyNames())
            .containsExactlyInAnyOrder("type", "recipe");
        assertThat(http.bodies()).allSatisfy(body -> assertThat(body)
            .doesNotContain("SYNTHETIC_CURRENT_VALUE", "SYNTHETIC_PROFILE_VALUE", "profileItemCount"));
        assertThat(JSON.writeValueAsString(response))
            .doesNotContain("SYNTHETIC_CURRENT_VALUE", "SYNTHETIC_PROFILE_VALUE", "profileItemCount");
        assertThat(List.of(GenericFieldsResponse.staticPolicyPresent("s").schemaVersion(),
            GenericFieldsResponse.policyUnavailable("s").schemaVersion())).containsOnly(3);
    }

    private GenericFieldsResponse.Field analyze(String category, FieldCandidate candidate, String choice) {
        http.respond(call -> answerAll(call, choice, 0.95));
        return service().analyze(request("example.test",
            List.of(section("personal", category, List.of(candidate))))).fields().getFirst();
    }

    private GenericFieldsService service() {
        return new GenericFieldsService(Optional.of(new JevCategoryFieldResolver(
            client(http), FIELDS, CATEGORIES, 3, 5, 10, 8000)), new FormAnalysisRouter(POLICIES),
            new FieldInteractionPolicy(), FIELDS);
    }

    private static FieldCandidate select(String options) {
        var choices = new java.util.ArrayList<Option>();
        choices.add(new Option("empty", ""));
        int index = 0;
        for (String option : options.split("\\|")) {
            choices.add(new Option("option-" + index++, option));
        }
        return new FieldCandidate("date", FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE,
            "생년월일", null, null, null, null, null, null, choices);
    }

    private static void assertUnmatched(GenericFieldsResponse.Field field) {
        assertThat(field.profileFieldKey()).isNull();
        assertThat(JSON.valueToTree(field).has("binding")).isFalse();
        assertThat(field.interactionStatus().name()).isEqualTo("BLOCKED");
        assertThat(field.autofillPolicy()).isNull();
        assertThat(field.writePlan()).isNull();
    }
}

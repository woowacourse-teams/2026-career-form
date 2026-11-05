package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

class GenericEnglishNameTest {

    @Test
    void abstainedSplitEnglishNameLabelsMapToTheirSingleNameFields() {
        var response = analyze("PERSONAL", List.of(
            candidate("family", "영문 성 (Last Name)"), candidate("given", "영문 이름 (First Name)")));

        assertThat(response.fields()).extracting(GenericFieldsResponse.Field::profileFieldKey)
            .containsExactly("personal.personal.englishFamilyName", "personal.personal.englishGivenName");
    }

    @ParameterizedTest
    @ValueSource(strings = {"영문 이름", "English Name", "Full Name", "Last Name / First Name", "성명"})
    void wholeOrAmbiguousNameLabelsStayAbstained(String label) {
        var response = analyze("PERSONAL", List.of(candidate("name", label)));

        assertThat(response.fields().getFirst().profileFieldKey()).isNull();
    }

    @Test
    void explicitSingleNameLabelsOverrideAFullNameRecipe() {
        var response = analyze("PERSONAL", List.of(candidate("family", "영문 성 (Last Name)")),
            "ENGLISH_FULL_NAME_GIVEN_FIRST");

        assertThat(response.fields().getFirst().profileFieldKey()).isEqualTo("personal.personal.englishFamilyName");
    }

    @Test
    void aKoreanFullNameRecipeIsNotReplacedByAnEnglishPart() {
        var response = analyze("PERSONAL", List.of(candidate("given", "이름 (First Name)")), "KOREAN_FULL_NAME");

        assertThat(response.fields().getFirst().profileFieldKey()).isNull();
    }

    @Test
    void koreanNameLabelsWithEnglishGlossStayAbstained() {
        var response = analyze("PERSONAL", List.of(candidate("family", "성(한글) Last Name")));

        assertThat(response.fields().getFirst().profileFieldKey()).isNull();
    }

    @Test
    void namesAreNeverMappedToMultiLineFields() {
        var textarea = new FieldCandidate("essay", FormElement.TEXTAREA, FormControl.TEXTAREA, Visibility.VISIBLE,
            "자기소개서", null, null, null, null, null, null, null);
        var response = analyze("PERSONAL", List.of(textarea), "personal.personal.koreanFamilyName");

        assertThat(response.fields().getFirst().profileFieldKey()).isNull();
    }

    @Test
    void namesOutsideThePersonalSectionStayAbstained() {
        var response = analyze("CAREER", List.of(candidate("family", "Last Name")));

        assertThat(response.fields().getFirst().profileFieldKey()).isNull();
    }

    private static FieldCandidate candidate(String id, String label) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label,
            null, null, null, null, null, null, null);
    }

    private static GenericFieldsResponse analyze(String category, List<FieldCandidate> fields) {
        return analyze(category, fields, null);
    }

    private static GenericFieldsResponse analyze(String category, List<FieldCandidate> fields, String answer) {
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, answer, 0.95));
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES,
            3, 5, 10, 8000);
        var service = new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), FIELDS);
        return service.analyze(new GenericFieldsRequest(2, "english-name",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new Section("section", null, "기본 정보", fields, null, category))));
    }
}

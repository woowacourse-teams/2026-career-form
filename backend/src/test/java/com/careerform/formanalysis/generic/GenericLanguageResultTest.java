package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.InputType;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

/** 한 어학 기록에 등급 선택칸과 점수 입력칸이 따로 있으면 두 칸을 후보로만 표시한다. 선택은 값 모양을 아는 프런트가 한다. */
class GenericLanguageResultTest {

    private static final String GRADE = "languages.languageTest.grade";
    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);

    @Test
    void marksSeparateScoreAndGradeControlsAsTargetCandidates() {
        var response = analyze(List.of(text("name", "시험"), select("grade", "등급"), text("score", "점수")),
            Map.of("name", mapped("languages.languageTest.testName"), "grade", ABSTAIN, "score", ABSTAIN));

        assertThat(field(response, "grade").profileFieldKey()).isEqualTo(GRADE);
        assertThat(inference(field(response, "grade"))).isEqualTo("LANGUAGE_GRADE");
        assertThat(field(response, "score").profileFieldKey()).isEqualTo(GRADE);
        assertThat(inference(field(response, "score"))).isEqualTo("LANGUAGE_SCORE");
    }

    @Test
    void marksBothWhenTheModelGivesBothControlsTheSameResultKey() {
        var response = analyze(List.of(text("name", "시험"), select("grade", "등급"), text("score", "점수")),
            Map.of("name", mapped("languages.languageTest.testName"), "grade", mapped(GRADE), "score", mapped(GRADE)));

        assertThat(inference(field(response, "grade"))).isEqualTo("LANGUAGE_GRADE");
        assertThat(inference(field(response, "score"))).isEqualTo("LANGUAGE_SCORE");
    }

    @Test
    void leavesAModelChosenResultTargetAlone() {
        var response = analyze(List.of(text("name", "시험"), select("grade", "등급"), text("score", "점수")),
            Map.of("name", mapped("languages.languageTest.testName"), "grade", ABSTAIN, "score", mapped(GRADE)));

        assertThat(field(response, "grade").profileFieldKey()).isNull();
        assertThat(inference(field(response, "score"))).isEmpty();
    }

    @Test
    void doesNotMarkControlsOutsideALanguageRecord() {
        var response = analyze(List.of(text("name", "회사명"), select("grade", "등급"), text("score", "점수")),
            Map.of("name", mapped("careers.career.companyName"), "grade", ABSTAIN, "score", ABSTAIN));

        assertThat(field(response, "grade").profileFieldKey()).isNull();
        assertThat(field(response, "score").profileFieldKey()).isNull();
    }

    @Test
    void doesNotGuessBetweenTwoScoreInputs() {
        var response = analyze(List.of(text("name", "시험"), select("grade", "등급"), text("score", "점수"),
                text("score2", "점수")),
            Map.of("name", mapped("languages.languageTest.testName"), "grade", ABSTAIN, "score", ABSTAIN,
                "score2", ABSTAIN));

        assertThat(field(response, "grade").profileFieldKey()).isNull();
        assertThat(field(response, "score").profileFieldKey()).isNull();
    }

    private static String inference(GenericFieldsResponse.Field field) {
        return GenericFieldsJevHttp.JSON.valueToTree(field).path("inference").asString();
    }

    private static GenericFieldsResponse.Field field(GenericFieldsResponse response, String id) {
        return response.fields().stream().filter(field -> field.candidateId().equals(id)).findFirst().orElseThrow();
    }

    private static Mapping mapped(String key) {
        return new Mapping(key, 0.95, true, null);
    }

    private static FieldCandidate text(String id, String label) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, null,
            new SemanticContext(null, InputType.TEXT, null, null, null, null, null, null), null);
    }

    private static FieldCandidate select(String id, String label) {
        return new FieldCandidate(id, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, List.of(new Option("o1", "A"), new Option("o2", "B")),
            new SemanticContext(null, null, null, null, null, null, null, null), null);
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var request = new GenericFieldsRequest(2, "language-result",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("language", "LANGUAGE", fields)),
            List.of(WriteCommand.SET_TEXT, WriteCommand.SELECT_OPTION));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

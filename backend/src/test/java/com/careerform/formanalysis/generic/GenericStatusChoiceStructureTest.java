package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
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
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

/** 값 없는 안내 선택지와 같은 섹션의 상세칸 구조로 보훈·장애 상태 칸을 정하고, 예/아니오 상태 키의 경계를 지킨다. */
class GenericStatusChoiceStructureTest {

    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);

    @Test
    void ignoresAnEmptyValuePlaceholderWhenCountingStatusOptions() {
        assertThat(GenericProfileSemantics.choiceKey(null,
            select("s", "장애 여부", placeholder("s0", "선택"), option("s1", "대상"), option("s2", "비대상"))))
            .isEqualTo("disability.disability.disabilityStatus");
    }

    @Test
    void anUnflaggedThirdOptionStillAbstains() {
        assertThat(GenericProfileSemantics.choiceKey(null,
            select("s", "장애 여부", option("s0", "선택"), option("s1", "대상"), option("s2", "비대상"))))
            .isNull();
    }

    @Test
    void mapsTheRemainingStatusSelectNextToAConfirmedVeteranDetail() {
        var response = analyze(List.of(
                select("s", null, placeholder("s0", "선택"), option("s1", "해당"), option("s2", "비해당")),
                select("t", "보훈구분", option("t1", "A"), option("t2", "B"))),
            Map.of("s", ABSTAIN, "t", ABSTAIN));

        assertThat(field(response, "t").profileFieldKey()).isEqualTo("veteran.veteran.veteranType");
        assertThat(field(response, "s").profileFieldKey()).isEqualTo("veteran.veteran.veteranStatus");
    }

    @Test
    void mapsTheRemainingStatusSelectNextToAConfirmedDisabilityDetail() {
        var response = analyze(List.of(
                select("s", null, placeholder("s0", "선택"), option("s1", "있음"), option("s2", "없음")),
                select("d", "장애정도", option("d1", "A"), option("d2", "B"))),
            Map.of("s", ABSTAIN, "d", ABSTAIN));

        assertThat(field(response, "s").profileFieldKey()).isEqualTo("disability.disability.disabilityStatus");
    }

    @Test
    void keepsTheStatusSelectAbstainedWithoutAConfirmedDetail() {
        var response = analyze(List.of(
                select("s", null, placeholder("s0", "선택"), option("s1", "해당"), option("s2", "비해당"))),
            Map.of("s", ABSTAIN));

        assertThat(field(response, "s").profileFieldKey()).isNull();
    }

    @Test
    void neverTurnsAConsentQuestionIntoAStatus() {
        var response = analyze(List.of(
                select("c", "민감정보 처리 동의", option("c1", "예"), option("c2", "아니오")),
                select("d", "장애정도", option("d1", "A"), option("d2", "B"))),
            Map.of("c", ABSTAIN, "d", ABSTAIN));

        assertThat(field(response, "c").profileFieldKey()).isNull();
    }

    @Test
    void abstainsWhenTwoSelectsCouldBeTheStatus() {
        var response = analyze(List.of(
                select("a", null, option("a1", "해당"), option("a2", "비해당")),
                select("b", null, option("b1", "예"), option("b2", "아니오")),
                select("t", "보훈구분", option("t1", "A"), option("t2", "B"))),
            Map.of("a", ABSTAIN, "b", ABSTAIN, "t", ABSTAIN));

        assertThat(field(response, "a").profileFieldKey()).isNull();
        assertThat(field(response, "b").profileFieldKey()).isNull();
    }

    @Test
    void dropsAYesNoStatusKeyOnAKindSelect() {
        var response = analyze(List.of(
                select("k", "추가전공", placeholder("k0", "선택"), option("k1", "복수전공"),
                    option("k2", "부전공"), option("k3", "연계전공"))),
            Map.of("k", new Mapping("education.university.doubleMajorStatus", 0.9, true, null)), "EDUCATION");

        assertThat(field(response, "k").profileFieldKey()).isNull();
    }

    @Test
    void keepsAYesNoStatusKeyOnATwoMeaningSelect() {
        var response = analyze(List.of(
                select("k", "복수전공 여부", placeholder("k0", "선택"), option("k1", "있음"), option("k2", "없음"))),
            Map.of("k", new Mapping("education.university.doubleMajorStatus", 0.9, true, null)), "EDUCATION");

        assertThat(field(response, "k").profileFieldKey()).isEqualTo("education.university.doubleMajorStatus");
    }

    private static Option option(String id, String text) {
        return new Option(id, text);
    }

    private static Option placeholder(String id, String text) {
        return new Option(id, text, true);
    }

    private static FieldCandidate select(String id, String label, Option... options) {
        return new FieldCandidate(id, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, new ArrayList<>(List.of(options)),
            new SemanticContext(null, null, null, null, null, null, null, null), null);
    }

    private static GenericFieldsResponse.Field field(GenericFieldsResponse response, String id) {
        return response.fields().stream().filter(field -> field.candidateId().equals(id)).findFirst().orElseThrow();
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        return analyze(fields, mappings, "SENSITIVE");
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings,
        String category) {
        var request = new GenericFieldsRequest(2, "status-structure",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("status", category, fields)),
            List.of(WriteCommand.SET_TEXT, WriteCommand.SELECT_OPTION));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

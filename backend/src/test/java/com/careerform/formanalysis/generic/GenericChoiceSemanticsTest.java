package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticLabel;
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticSource;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

class GenericChoiceSemanticsTest {

    @Test
    void serviceOverridesProviderGenderWithNationalityOptions() {
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, "personal.personal.gender", 0.99));
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES,
            3, 5, 10, 8000);
        var service = new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), FIELDS);
        var response = service.analyze(new GenericFieldsRequest(2, "synthetic-choice",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new Section("personal", null, "기본 정보",
                List.of(candidate("성별", FormControl.SELECT, List.of("내국인", "외국인"), List.of())),
                null, "PERSONAL"))));

        assertThat(http.calls()).hasSize(1);
        assertThat(response.fields()).singleElement().satisfies(field -> {
            assertThat(field.profileFieldKey()).isEqualTo("personal.personal.nationality");
            assertThat(field.confidence()).isEqualTo(1.0);
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"내국인", "국내(한국국적)", " 국내 （ 한국 국적 ） "})
    void nationalityOptionsAreNotGender(String domestic) {
        assertThat(GenericProfileSemantics.choiceKey("기본 정보",
            candidate("성별", FormControl.SELECT, List.of(domestic, "외국인"), List.of())))
            .isEqualTo("personal.personal.nationality");
        assertThat(GenericProfileSemantics.choiceKey(null,
            candidate(null, FormControl.RADIO, List.of("외국인", domestic), List.of())))
            .isEqualTo("personal.personal.nationality");
    }

    @ParameterizedTest
    @MethodSource("statusContexts")
    void statusOptionsRequireUnambiguousHeadingOrLabel(String heading, String label,
        List<SemanticLabel> labels, String key) {
        assertThat(GenericProfileSemantics.choiceKey(heading,
            candidate(label, FormControl.SELECT, List.of("비대상", "대상"), labels)))
            .isEqualTo(key);
    }

    static Stream<Arguments> statusContexts() {
        return Stream.of(
            Arguments.of(null, "장애 여부", List.of(), "disability.disability.disabilityStatus"),
            Arguments.of("보훈/장애", "장애여부 필수", List.of(), "disability.disability.disabilityStatus"),
            Arguments.of("보훈/장애", "보훈여부 *", List.of(), "veteran.veteran.veteranStatus"),
            Arguments.of("보훈", "장애여부 필수", List.of(), null),
            Arguments.of("기본 정보", "보훈 대상 여부", List.of(), "veteran.veteran.veteranStatus"),
            Arguments.of(null, null, List.of(new SemanticLabel(SemanticSource.ARIA_LABEL, "장애 여부")),
                "disability.disability.disabilityStatus"),
            Arguments.of(null, null, List.of(new SemanticLabel(SemanticSource.ARIA_LABELLEDBY, "보훈 여부")),
                "veteran.veteran.veteranStatus"),
            Arguments.of(null, null, List.of(new SemanticLabel(SemanticSource.LABEL, "장애 여부")),
                "disability.disability.disabilityStatus")
        );
    }

    @ParameterizedTest
    @MethodSource("statusSynonyms")
    void statusSynonymsRetainTheLabelMeaning(String target, String notTarget) {
        assertThat(GenericProfileSemantics.choiceKey(null,
            candidate("장애 여부", FormControl.SELECT, List.of(target, notTarget), List.of())))
            .isEqualTo("disability.disability.disabilityStatus");
        assertThat(GenericProfileSemantics.choiceKey(null,
            candidate("보훈", FormControl.RADIO, List.of(notTarget, target), List.of())))
            .isEqualTo("veteran.veteran.veteranStatus");
    }

    @ParameterizedTest
    @MethodSource("headingOnlyContexts")
    void sectionHeadingAloneDoesNotDecideAStatusQuestion(String heading, List<SemanticLabel> labels) {
        assertThat(GenericProfileSemantics.choiceKey(heading,
            candidate(null, FormControl.SELECT, List.of("예", "아니오"), labels))).isNull();
        assertThat(GenericProfileSemantics.choiceKey(heading,
            candidate("증빙서류 제출 동의", FormControl.RADIO, List.of("예", "아니오"), labels))).isNull();
    }

    static Stream<Arguments> headingOnlyContexts() {
        return Stream.of(
            Arguments.of("장애", List.of()),
            Arguments.of("보훈 사항", List.of()),
            Arguments.of(null, List.of(new SemanticLabel(SemanticSource.SECTION_HEADING, "장애"))),
            Arguments.of(null, List.of(new SemanticLabel(SemanticSource.LEGEND, "보훈 정보"))),
            Arguments.of(null, List.of(new SemanticLabel(SemanticSource.LEGEND, "보훈")))
        );
    }

    static Stream<Arguments> statusSynonyms() {
        return Stream.of("대상", "해당", "예")
            .flatMap(target -> Stream.of("비대상", "비해당", "해당없음", "아니오")
                .map(notTarget -> Arguments.of(target, notTarget)));
    }

    @ParameterizedTest
    @MethodSource("ambiguousOptions")
    void unknownDuplicateOrExtraOptionsAbstain(List<String> options) {
        assertThat(GenericProfileSemantics.choiceKey("장애",
            candidate("국적", FormControl.SELECT, options, List.of()))).isNull();
    }

    static Stream<Arguments> ambiguousOptions() {
        return Stream.of(
            List.of(), List.of("내국인"), List.of("내국인", "내국인"),
            List.of("내국인", "외국인", "선택"), List.of("국내", "외국인"),
            List.of("내국인", "기타"), List.of("대상", "대상"),
            List.of("대상", "비대상", "선택"), List.of("남성", "여성"),
            List.of("대상", "확인 필요"), List.of("대상", "해당"), List.of("비대상", "아니오")
        ).map(Arguments::of);
    }

    @ParameterizedTest
    @ValueSource(strings = {"TEXT", "TEXTAREA", "CHECKBOX"})
    void nonChoiceControlsAbstain(String control) {
        assertThat(GenericProfileSemantics.choiceKey(null,
            candidate("국적", FormControl.valueOf(control), List.of("내국인", "외국인"), List.of())))
            .isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "기본 정보", "지원 대상", "장애 보훈", "장애인 채용 동의"})
    void missingOrAmbiguousStatusHeadingAbstains(String heading) {
        assertThat(GenericProfileSemantics.choiceKey(heading,
            candidate(null, FormControl.SELECT, List.of("대상", "비대상"), List.of()))).isNull();
    }

    @Test
    void conflictingStatusLabelsAbstain() {
        assertThat(GenericProfileSemantics.choiceKey("장애",
            candidate("보훈 여부", FormControl.SELECT, List.of("대상", "비대상"), List.of()))).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"DESCRIPTION", "PLACEHOLDER"})
    void incidentalTextDoesNotSupplySensitiveContext(String source) {
        assertThat(GenericProfileSemantics.choiceKey(null,
            candidate(null, FormControl.SELECT, List.of("대상", "비대상"),
                List.of(new SemanticLabel(SemanticSource.valueOf(source), "장애"))))).isNull();
    }

    @Test
    void nullOptionsAbstain() {
        assertThat(GenericProfileSemantics.choiceKey("장애",
            candidate(null, FormControl.SELECT, null, List.of()))).isNull();
    }

    private FieldCandidate candidate(String label, FormControl control, List<String> choices,
        List<SemanticLabel> labels) {
        List<Option> options = choices == null ? null : IntStream.range(0, choices.size())
            .mapToObj(index -> new Option("option-" + index, choices.get(index))).toList();
        return new FieldCandidate("choice", control == FormControl.SELECT ? FormElement.SELECT : FormElement.INPUT,
            control, Visibility.VISIBLE, label, "disability", "veteran", "장애",
            null, null, null, options,
            new SemanticContext(labels, null, null, null, null, null, null, null));
    }
}

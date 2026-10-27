package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;

/**
 * 같은 칸 구조, 같은 매핑 키, 같은 supportedWriteCommands라면 범용 칸 매칭 응답과
 * 공유 범용 경로 응답의 autofillPolicy, interactionStatus, writePlan.command가 이름 기준으로 같다.
 */
@DisplayName("범용 칸 매칭 응답과 공유 범용 경로의 칸별 입력 판정 계약")
class GenericFieldPolicyContractTest {

    private static final String SCHOOL = "education.university.schoolName";
    private static final String BIRTH_DATE = "personal.personal.birthDate";
    private static final String NATIONALITY = "personal.personal.nationality";
    private static final List<String> TEXT_ONLY = List.of("SET_TEXT");
    private static final List<String> WITH_DATE = List.of("SET_TEXT", "SELECT_DATE");

    record Shape(String element, String control, String visibility, Boolean disabled, Boolean readonly,
        Boolean inert, String inputType) {

        static Shape of(String element, String control) {
            return new Shape(element, control, "VISIBLE", null, null, null, null);
        }

        static Shape readonlyText(String inputType) {
            return new Shape("INPUT", "TEXT", "VISIBLE", null, true, null, inputType);
        }
    }

    record Case(String name, Shape shape, String key, List<String> commands, String autofillPolicy,
        String interactionStatus, String writeCommand) {

        @Override
        public String toString() {
            return name;
        }
    }

    record Outcome(String autofillPolicy, String interactionStatus, String writeCommand) {
    }

    static Stream<Case> cases() {
        return Stream.of(
            new Case("텍스트 input", Shape.of("INPUT", "TEXT"), SCHOOL, TEXT_ONLY,
                "CONDITIONAL", "READY", "SET_TEXT"),
            new Case("ALLOWED 키 텍스트 input", Shape.of("INPUT", "TEXT"), "contact.contact.email", TEXT_ONLY,
                "ALLOWED", "READY", "SET_TEXT"),
            new Case("textarea", Shape.of("TEXTAREA", "TEXTAREA"), "contact.contact.addressLine2", TEXT_ONLY,
                "ALLOWED", "READY", "SET_TEXT"),
            new Case("select의 CONDITIONAL 키", Shape.of("SELECT", "SELECT"), NATIONALITY, TEXT_ONLY,
                "CONDITIONAL", "READY", "SELECT_OPTION"),
            new Case("radio", Shape.of("INPUT", "RADIO"), "personal.personal.gender", TEXT_ONLY,
                "CONDITIONAL", "READY", "CHECK_RADIO"),
            new Case("checkbox", Shape.of("INPUT", "CHECKBOX"), "education.university.transferStatus", TEXT_ONLY,
                "CONDITIONAL", "READY", "CHECK_CHECKBOX"),
            new Case("input+button 컨트롤", Shape.of("INPUT", "BUTTON"), "education.university.degreeLevel",
                TEXT_ONLY, "CONDITIONAL", "READY", "SELECT_BUTTON_OPTION"),
            new Case("readonly 텍스트 input 날짜 키와 SELECT_DATE 지원", Shape.readonlyText("TEXT"), BIRTH_DATE,
                WITH_DATE, "ALLOWED", "READY", "SELECT_DATE"),
            new Case("readonly 텍스트 input 날짜 키와 SELECT_DATE 미지원", Shape.readonlyText("TEXT"), BIRTH_DATE,
                TEXT_ONLY, "ALLOWED", "READY", "SEARCH_SELECTION"),
            new Case("readonly 텍스트 input 날짜가 아닌 지원 키", Shape.readonlyText("TEXT"), SCHOOL, WITH_DATE,
                "CONDITIONAL", "READY", "SEARCH_SELECTION"),
            new Case("inputType 없는 readonly 텍스트 input", Shape.readonlyText(null), SCHOOL, WITH_DATE,
                "CONDITIONAL", "BLOCKED", null),
            new Case("readonly select", new Shape("SELECT", "SELECT", "VISIBLE", null, true, null, null),
                NATIONALITY, TEXT_ONLY, "CONDITIONAL", "BLOCKED", null),
            new Case("hidden", new Shape("INPUT", "TEXT", "HIDDEN", null, null, null, null), SCHOOL, TEXT_ONLY,
                "CONDITIONAL", "MANUAL_REVEAL_REQUIRED", null),
            new Case("disabled", new Shape("INPUT", "TEXT", "VISIBLE", true, null, null, null), SCHOOL, TEXT_ONLY,
                "CONDITIONAL", "BLOCKED", null),
            new Case("inert", new Shape("INPUT", "TEXT", "VISIBLE", null, null, true, null), SCHOOL, TEXT_ONLY,
                "CONDITIONAL", "BLOCKED", null),
            new Case("대화상자를 여는 버튼 날짜 키와 SELECT_DATE 지원", Shape.of("CUSTOM", "BUTTON"), BIRTH_DATE,
                WITH_DATE, "ALLOWED", "READY", "SELECT_DATE"),
            new Case("대화상자를 여는 버튼 날짜 키와 SELECT_DATE 미지원", Shape.of("CUSTOM", "BUTTON"), BIRTH_DATE,
                TEXT_ONLY, "ALLOWED", "UNVERIFIED", null),
            new Case("대화상자를 여는 버튼 날짜가 아닌 키", Shape.of("CUSTOM", "BUTTON"), SCHOOL, WITH_DATE,
                "CONDITIONAL", "UNVERIFIED", null),
            new Case("숨은 대화상자 버튼 날짜 키", new Shape("CUSTOM", "BUTTON", "HIDDEN", null, null, null, null),
                BIRTH_DATE, WITH_DATE, "ALLOWED", "MANUAL_REVEAL_REQUIRED", null),
            new Case("custom 요소", Shape.of("CUSTOM", "CUSTOM"), SCHOOL, TEXT_ONLY,
                "CONDITIONAL", "UNVERIFIED", null),
            new Case("매핑 없음", Shape.of("INPUT", "TEXT"), null, TEXT_ONLY, null, "BLOCKED", null)
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    @DisplayName("같은 칸·키·쓰기 명령이면 범용 응답과 공유 범용 경로의 세 값이 같다")
    void genericResponseMatchesSharedGenericRoute(Case testCase) {
        Outcome shared = shared(testCase);
        Outcome generic = generic(testCase);

        assertThat(generic).isEqualTo(shared);
        assertThat(generic).isEqualTo(new Outcome(testCase.autofillPolicy(), testCase.interactionStatus(),
            testCase.writeCommand()));
    }

    @Test
    @DisplayName("범용 칸 후보의 모든 구조 필드를 같은 이름의 공유 칸 후보로 옮긴다")
    void convertsEveryCandidateComponentByName() {
        var generic = new GenericFieldsRequest.FieldCandidate("cand-1", GenericFieldsRequest.FormElement.INPUT,
            GenericFieldsRequest.FormControl.TEXT, GenericFieldsRequest.Visibility.VISIBLE, "학교명", "dom-id",
            "dom-name", "입력", true, true, true,
            List.of(new GenericFieldsRequest.Option("opt-1", "선택지")),
            new GenericFieldsRequest.SemanticContext(
                List.of(new GenericFieldsRequest.SemanticLabel(GenericFieldsRequest.SemanticSource.ARIA_LABEL, "학교")),
                GenericFieldsRequest.InputType.SEARCH, GenericFieldsRequest.InputMode.NUMERIC,
                GenericFieldsRequest.Autocomplete.ORGANIZATION, true, true, 40,
                new GenericFieldsRequest.RepeatContext("group-1", 1, 3)));

        assertThat(GenericFieldPolicy.toShared(generic)).isEqualTo(new FieldsAnalysisRequest.FieldCandidate(
            "cand-1", FieldsAnalysisRequest.FormElement.INPUT, FieldsAnalysisRequest.FormControl.TEXT,
            FieldsAnalysisRequest.Visibility.VISIBLE, "학교명", "dom-id", "dom-name", "입력", true, true, true,
            List.of(new FieldsAnalysisRequest.Option("opt-1", "선택지")),
            new FieldsAnalysisRequest.SemanticContext(
                List.of(new FieldsAnalysisRequest.SemanticLabel(FieldsAnalysisRequest.SemanticSource.ARIA_LABEL,
                    "학교")),
                FieldsAnalysisRequest.InputType.SEARCH, FieldsAnalysisRequest.InputMode.NUMERIC,
                FieldsAnalysisRequest.Autocomplete.ORGANIZATION, true, true, 40,
                new FieldsAnalysisRequest.RepeatContext("group-1", 1, 3))));
        var minimal = new GenericFieldsRequest.FieldCandidate("cand-2", GenericFieldsRequest.FormElement.CUSTOM,
            GenericFieldsRequest.FormControl.CUSTOM, GenericFieldsRequest.Visibility.HIDDEN, null, null, null, null,
            null, null, null, null);
        assertThat(GenericFieldPolicy.toShared(minimal)).isEqualTo(new FieldsAnalysisRequest.FieldCandidate(
            "cand-2", FieldsAnalysisRequest.FormElement.CUSTOM, FieldsAnalysisRequest.FormControl.CUSTOM,
            FieldsAnalysisRequest.Visibility.HIDDEN, null, null, null, null, null, null, null, null));
    }

    private static Outcome shared(Case testCase) {
        var candidate = new FieldsAnalysisRequest.FieldCandidate("cand-1",
            FieldsAnalysisRequest.FormElement.valueOf(testCase.shape().element()),
            FieldsAnalysisRequest.FormControl.valueOf(testCase.shape().control()),
            FieldsAnalysisRequest.Visibility.valueOf(testCase.shape().visibility()), "칸", null, null, null,
            testCase.shape().disabled(), testCase.shape().readonly(), testCase.shape().inert(), null,
            testCase.shape().inputType() == null ? null : new FieldsAnalysisRequest.SemanticContext(null,
                FieldsAnalysisRequest.InputType.valueOf(testCase.shape().inputType()), null, null, null, null, null,
                null));
        var request = new FieldsAnalysisRequest(2, "synthetic-snapshot",
            new FieldsAnalysisRequest.Site("example.test", "/apply"),
            List.of(new FieldsAnalysisRequest.Section("sec", null, "섹션", List.of(candidate), null)),
            testCase.commands().stream().map(FieldsAnalysisResponse.WriteCommand::valueOf).toList());
        FieldMappingResolver resolver = new FieldMappingResolver() {
            @Override
            public Resolution resolve(FieldsAnalysisRequest sharedRequest) {
                return new Resolution(2, sharedRequest.snapshotId(), List.of(testCase.key() == null
                    ? new NoMatch("cand-1")
                    : new Match("cand-1", testCase.key())));
            }
        };
        var service = new FieldsAnalysisService(Optional.of(resolver), new FormAnalysisRouter(notRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields());

        var response = service.analyze(request);

        assertThat(response.mode()).isEqualTo(FieldsAnalysisResponse.Mode.GENERIC);
        var field = response.fields().getFirst();
        if (field instanceof FieldsAnalysisResponse.MatchedFieldAnalysis matched) {
            return new Outcome(matched.autofillPolicy().name(), matched.interactionStatus().name(),
                matched.writePlan() == null ? null : matched.writePlan().command().name());
        }
        var noMatch = (FieldsAnalysisResponse.NoMatchFieldAnalysis) field;
        return new Outcome(null, noMatch.interactionStatus().name(), null);
    }

    private static Outcome generic(Case testCase) {
        var candidate = new GenericFieldsRequest.FieldCandidate("cand-1",
            GenericFieldsRequest.FormElement.valueOf(testCase.shape().element()),
            GenericFieldsRequest.FormControl.valueOf(testCase.shape().control()),
            GenericFieldsRequest.Visibility.valueOf(testCase.shape().visibility()), "칸", null, null, null,
            testCase.shape().disabled(), testCase.shape().readonly(), testCase.shape().inert(), null,
            testCase.shape().inputType() == null ? null : new GenericFieldsRequest.SemanticContext(null,
                GenericFieldsRequest.InputType.valueOf(testCase.shape().inputType()), null, null, null, null, null,
                null));
        String category = testCase.key() == null ? SectionCategories.MIXED : SectionCategories.categoryOf(
            testCase.key());
        var request = new GenericFieldsRequest(2, "synthetic-snapshot",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new GenericFieldsRequest.Section("sec", null, "섹션", List.of(candidate), null, category)),
            testCase.commands().stream().map(GenericFieldsRequest.WriteCommand::valueOf).toList());
        var http = new GenericFieldsJevHttp();
        http.respond(call -> answerAll(call, testCase.key(), 0.9));
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 3, 5, 10,
            8000);
        var service = new GenericFieldsService(Optional.of(resolver), new FormAnalysisRouter(notRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields());

        var field = service.analyze(request).fields().getFirst();

        assertThat(field.profileFieldKey()).isEqualTo(testCase.key());
        return new Outcome(field.autofillPolicy() == null ? null : field.autofillPolicy().name(),
            field.interactionStatus().name(),
            field.writePlan() == null ? null : field.writePlan().command().name());
    }

    private static CompanyFormPolicyProvider notRegistered() {
        return (host, path) -> new CompanyFormPolicyProvider.NotRegistered();
    }
}

package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.Mode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;

@DisplayName("SK 경력 필드 분석")
class SkCareerFieldsAnalysisTest {

    private static final String ROW_1 = "11111111-1111-1111-1111-111111111111";
    private static final String ROW_2 = "22222222-2222-2222-2222-222222222222";

    @Test
    @DisplayName("실제 경력 DOM tuple을 반복 행별 프로필 필드와 쓰기 계획으로 매핑한다")
    void mapsVerifiedCareerTuplesForEachRepeatRow() {
        FieldsAnalysisResponse response = service().analyze(request(List.of(
            item("career-row-1", careerFields("career-1", ROW_1)),
            item("career-row-2", careerFields("career-2", ROW_2))
        )));

        assertThat(response.mode()).isEqualTo(Mode.ADAPTER);
        assertThat(response.fields().stream()
            .filter(field -> field.candidateId().startsWith("career-")))
            .hasSize(16)
            .allMatch(MatchedFieldAnalysis.class::isInstance);
        assertMatched(response, "career-1-company",
            new DirectBinding("careers.career.companyName"), WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-department",
            new DirectBinding("careers.career.department"), WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-position",
            new DirectBinding("careers.career.position"), WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-responsibilities",
            new DirectBinding("careers.career.responsibilities"), WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-start",
            new DerivedBinding(DerivedRecipe.YEAR_MONTH, "careers.career.startDate"),
            WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-end",
            new DerivedBinding(DerivedRecipe.YEAR_MONTH, "careers.career.endDate"),
            WriteCommand.SET_TEXT);
        assertMatched(response, "career-1-status", new LookupBinding(
            "careers.career.employmentStatus",
            Map.of("재직중", "재직 중", "퇴사", "퇴사")
        ), WriteCommand.SELECT_OPTION);
        assertMatched(response, "career-1-termination",
            new DirectBinding("careers.career.terminationReason"),
            WriteCommand.SET_TEXT);
        assertMatched(response, "career-2-company",
            new DirectBinding("careers.career.companyName"), WriteCommand.SET_TEXT);
        assertMatched(response, "career-2-status", new LookupBinding(
            "careers.career.employmentStatus",
            Map.of("재직중", "재직 중", "퇴사", "퇴사")
        ), WriteCommand.SELECT_OPTION);
    }

    @Test
    @DisplayName("미지원 경력 필드와 실제 DOM tuple이 아닌 후보는 입력하지 않는다")
    void rejectsUnsupportedAndMalformedCareerCandidates() {
        FieldsAnalysisResponse response = service().analyze(request(List.of(
            item("unsupported-and-malformed", List.of(
                text("career-job-role", "carJobRole_" + ROW_1, "carJobRole"),
                text("career-salary", "carSalary_" + ROW_1, "carSalary"),
                text("wrong-name", "carCorpName_" + ROW_1, "carDeptName"),
                field(
                    "wrong-element", FormElement.INPUT, FormControl.TEXTAREA,
                    Visibility.VISIBLE, "carDescription_" + ROW_1,
                    "carDescription", null
                ),
                text("wrong-id", "anotherCorpName_" + ROW_1, "carCorpName"),
                select("wrong-select-name", null, "employmentStatus")
            ))
        )));

        assertThat(response.fields()).filteredOn(NoMatchFieldAnalysis.class::isInstance)
            .extracting(
                FieldsAnalysisResponse.FieldAnalysis::candidateId,
                field -> ((NoMatchFieldAnalysis) field).matchType(),
                field -> ((NoMatchFieldAnalysis) field).interactionStatus()
            )
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(
                    "career-job-role", MatchType.NO_MATCH, InteractionStatus.BLOCKED),
                org.assertj.core.groups.Tuple.tuple(
                    "career-salary", MatchType.NO_MATCH, InteractionStatus.BLOCKED),
                org.assertj.core.groups.Tuple.tuple(
                    "wrong-name", MatchType.NO_MATCH, InteractionStatus.BLOCKED),
                org.assertj.core.groups.Tuple.tuple(
                    "wrong-element", MatchType.NO_MATCH, InteractionStatus.BLOCKED),
                org.assertj.core.groups.Tuple.tuple(
                    "wrong-id", MatchType.NO_MATCH, InteractionStatus.BLOCKED),
                org.assertj.core.groups.Tuple.tuple(
                    "wrong-select-name", MatchType.NO_MATCH, InteractionStatus.BLOCKED)
            );
    }

    @Test
    @DisplayName("숨김 퇴사 사유와 disabled 경력 제어는 매핑해도 쓰기 계획을 만들지 않는다")
    void doesNotWriteHiddenOrDisabledCareerControls() {
        FieldsAnalysisResponse response = service().analyze(request(List.of(
            item("non-interactive", List.of(
                textarea("hidden-termination", "carRetireDesc_" + ROW_1,
                    "carRetireDesc", Visibility.HIDDEN),
                text("disabled-company", "carCorpName_" + ROW_1, "carCorpName", true)
            ))
        )));

        MatchedFieldAnalysis hidden = matched(response, "hidden-termination");
        assertThat(hidden.valueBinding())
            .isEqualTo(new DirectBinding("careers.career.terminationReason"));
        assertThat(hidden.interactionStatus())
            .isEqualTo(InteractionStatus.MANUAL_REVEAL_REQUIRED);
        assertThat(hidden.writePlan()).isNull();

        MatchedFieldAnalysis disabled = matched(response, "disabled-company");
        assertThat(disabled.valueBinding())
            .isEqualTo(new DirectBinding("careers.career.companyName"));
        assertThat(disabled.interactionStatus()).isEqualTo(InteractionStatus.BLOCKED);
        assertThat(disabled.writePlan()).isNull();
    }

    private static List<FieldCandidate> careerFields(String prefix, String rowId) {
        return List.of(
            text(prefix + "-company", "carCorpName_" + rowId, "carCorpName"),
            text(prefix + "-department", "carDeptName_" + rowId, "carDeptName"),
            text(prefix + "-position", "carPosition_" + rowId, "carPosition"),
            textarea(prefix + "-responsibilities", "carDescription_" + rowId,
                "carDescription", Visibility.VISIBLE),
            text(prefix + "-start", "carFromDate_" + rowId, "carFromDate"),
            text(prefix + "-end", "carToDate_" + rowId, "carToDate"),
            select(prefix + "-status", null, "carWorkingYN"),
            textarea(prefix + "-termination", "carRetireDesc_" + rowId,
                "carRetireDesc", Visibility.VISIBLE)
        );
    }

    private static FieldsAnalysisService service() {
        CompanyFormPolicy policy = seededSkPolicy();
        SupportedProfileFields supportedProfileFields = new SupportedProfileFields();
        return new FieldsAnalysisService(
            Optional.empty(),
            new FormAnalysisRouter((host, path) ->
                new CompanyFormPolicyProvider.Available(policy)),
            new FieldInteractionPolicy(),
            supportedProfileFields
        );
    }

    private static CompanyFormPolicy seededSkPolicy() {
        FormAnalysisCompanyMongoRepository companies = mock(
            FormAnalysisCompanyMongoRepository.class
        );
        FormAnalysisPolicyMongoRepository policies = mock(
            FormAnalysisPolicyMongoRepository.class
        );
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        ArgumentCaptor<FormAnalysisPolicyDocument> saved = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        verify(policies, times(2)).save(saved.capture());
        FormAnalysisPolicyDocument document = saved.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("sk"))
            .findFirst()
            .orElseThrow();
        SupportedProfileFields supportedProfileFields = new SupportedProfileFields();
        return CompanyFormPolicy.create(
            document.companyKey(),
            document.version(),
            document.preparationFingerprint(),
            document.fieldsFingerprint(),
            document.actionRules(),
            document.fieldRules(),
            supportedProfileFields::contains
        );
    }

    private static FieldsAnalysisRequest request(List<Item> items) {
        return new FieldsAnalysisRequest(
            2,
            "sk-career-fields",
            new Site("www.skcareers.com", "/Application/Index/:id"),
            List.of(new Section(
                "section-1",
                null,
                null,
                List.of(
                    text("required-name", "prsApplicantName", "prsApplicantName"),
                    text("required-email", "prsEmail", "prsEmail"),
                    text("required-phone", "prsPhone", "prsPhone")
                ),
                items
            ))
        );
    }

    private static Item item(String itemId, List<FieldCandidate> fields) {
        return new Item(itemId, fields);
    }

    private static FieldCandidate text(
        String candidateId,
        String domId,
        String domName
    ) {
        return text(candidateId, domId, domName, null);
    }

    private static FieldCandidate text(
        String candidateId,
        String domId,
        String domName,
        Boolean disabled
    ) {
        return field(
            candidateId, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            domId, domName, disabled
        );
    }

    private static FieldCandidate textarea(
        String candidateId,
        String domId,
        String domName,
        Visibility visibility
    ) {
        return field(
            candidateId, FormElement.TEXTAREA, FormControl.TEXTAREA, visibility,
            domId, domName, null
        );
    }

    private static FieldCandidate select(
        String candidateId,
        String domId,
        String domName
    ) {
        return field(
            candidateId, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE,
            domId, domName, null
        );
    }

    private static FieldCandidate field(
        String candidateId,
        FormElement element,
        FormControl control,
        Visibility visibility,
        String domId,
        String domName,
        Boolean disabled
    ) {
        return new FieldCandidate(
            candidateId,
            element,
            control,
            visibility,
            null,
            domId,
            domName,
            null,
            disabled,
            null,
            null,
            null
        );
    }

    private static void assertMatched(
        FieldsAnalysisResponse response,
        String candidateId,
        ValueBinding binding,
        WriteCommand command
    ) {
        MatchedFieldAnalysis field = matched(response, candidateId);
        assertThat(field.matchType()).isEqualTo(MatchType.MATCH);
        assertThat(field.valueBinding()).isEqualTo(binding);
        assertThat(field.interactionStatus()).isEqualTo(InteractionStatus.READY);
        assertThat(field.writePlan().command()).isEqualTo(command);
    }

    private static MatchedFieldAnalysis matched(
        FieldsAnalysisResponse response,
        String candidateId
    ) {
        return (MatchedFieldAnalysis) response.fields().stream()
            .filter(field -> field.candidateId().equals(candidateId))
            .findFirst()
            .orElseThrow();
    }
}

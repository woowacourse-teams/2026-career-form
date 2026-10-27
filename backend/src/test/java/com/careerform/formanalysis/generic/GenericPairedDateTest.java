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
import com.careerform.formanalysis.generic.GenericFieldsRequest.SemanticContext;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

class GenericPairedDateTest {

    private static final String START = "education.university.startDate";
    private static final String END = "education.university.endDate";
    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);

    @Test
    void infersPrecedingUnmappedDateWithPartnerConfidence() {
        var response = analyze(List.of(field("a", "pair"), field("b", "pair")),
            Map.of("a", ABSTAIN, "b", mapped(END)));

        assertThat(response.fields().getFirst().profileFieldKey()).isEqualTo(START);
        assertThat(response.fields().getFirst().confidence()).isEqualTo(0.95);
        assertThat(GenericFieldsJevHttp.JSON.valueToTree(response.fields().getFirst())
            .path("inference").asString()).isEqualTo("PAIRED_DATE");
    }

    @Test
    void inferredDateReceivesItsOwnSelectDatePlan() {
        var response = analyze(List.of(field("a", "pair"), field("b", "pair", null)),
            Map.of("a", ABSTAIN, "b", mapped(END)));

        assertThat(response.fields().getFirst().interactionStatus())
            .isEqualTo(GenericFieldsResponse.InteractionStatus.READY);
        assertThat(response.fields().getFirst().writePlan())
            .isEqualTo(new GenericFieldsResponse.WritePlan(WriteCommand.SELECT_DATE));
        assertThat(response.fields().get(1).writePlan())
            .isEqualTo(new GenericFieldsResponse.WritePlan(WriteCommand.SET_TEXT));
    }

    @Test
    void doesNotInferAfterEndDate() {
        assertUnmapped(List.of(field("b", "pair"), field("a", "pair")),
            Map.of("a", ABSTAIN, "b", mapped(END)));
    }

    @Test
    void doesNotInferWithThreeControls() {
        assertUnmapped(List.of(field("a", "pair"), field("b", "pair"), field("c", "pair")),
            Map.of("a", ABSTAIN, "b", mapped(END), "c", ABSTAIN));
    }

    @Test
    void doesNotInferFromNonEndDatePartner() {
        assertUnmapped(List.of(field("a", "pair"), field("b", "pair")),
            Map.of("a", ABSTAIN, "b", mapped("education.university.schoolName")));
    }

    @Test
    void doesNotDuplicateStartDateInRow() {
        assertUnmapped(List.of(field("existing", null), field("a", "pair"), field("b", "pair")),
            Map.of("a", ABSTAIN, "b", mapped(END), "existing", mapped(START)));
    }

    @Test
    void doesNotInferWithoutContainerEvidence() {
        assertUnmapped(List.of(field("a", null), field("b", null)),
            Map.of("a", ABSTAIN, "b", mapped(END)));
    }

    @Test
    void doesNotInferWhenProviderIsUnavailable() {
        assertUnmapped(List.of(field("a", "pair"), field("b", "pair")),
            Map.of("a", new Mapping(null, 0.0, true, GenericFieldsResponse.Reason.LLM_UNAVAILABLE),
                "b", mapped(END)));
    }

    private static final String SCHOOL = "education.university.schoolName";
    private static final String REGION = "education.university.schoolRegion";

    @Test
    void infersBothAbstainedDatesFromSingleGroupRow() {
        var response = analyze(
            List.of(field("s1", null), field("s2", null), field("a", "pair"), field("b", "pair")),
            Map.of("s1", mapped(SCHOOL), "s2", new Mapping(REGION, 0.85, true, null),
                "a", ABSTAIN, "b", ABSTAIN));

        var start = response.fields().get(2);
        var end = response.fields().get(3);
        assertThat(start.profileFieldKey()).isEqualTo(START);
        assertThat(end.profileFieldKey()).isEqualTo(END);
        assertThat(start.confidence()).isEqualTo(0.85);
        assertThat(GenericFieldsJevHttp.JSON.valueToTree(start).path("inference").asString())
            .isEqualTo("PAIRED_DATE");
        assertThat(GenericFieldsJevHttp.JSON.valueToTree(end).path("inference").asString())
            .isEqualTo("PAIRED_DATE");
    }

    @Test
    void doesNotInferBothDatesWhenRowMixesGroups() {
        assertBothUnmapped(
            List.of(field("s1", null), field("s2", null), field("a", "pair"), field("b", "pair")),
            Map.of("s1", mapped(SCHOOL), "s2", mapped("education.highSchool.schoolName"),
                "a", ABSTAIN, "b", ABSTAIN));
    }

    @Test
    void doesNotInferBothDatesFromOneSibling() {
        assertBothUnmapped(List.of(field("s1", null), field("a", "pair"), field("b", "pair")),
            Map.of("s1", mapped(SCHOOL), "a", ABSTAIN, "b", ABSTAIN));
    }

    @Test
    void doesNotInferBothDatesWhenRowAlreadyHasOne() {
        assertBothUnmapped(
            List.of(field("s1", null), field("s2", null), field("x", null), field("a", "pair"),
                field("b", "pair")),
            Map.of("s1", mapped(SCHOOL), "s2", mapped(REGION), "x", mapped(END),
                "a", ABSTAIN, "b", ABSTAIN));
    }

    @Test
    void doesNotInferHiddenDatePairs() {
        assertBothUnmapped(
            List.of(field("s1", null), field("s2", null), hidden("a", "pair"), hidden("b", "pair")),
            Map.of("s1", mapped(SCHOOL), "s2", mapped(REGION), "a", ABSTAIN, "b", ABSTAIN));
        assertUnmapped(List.of(hidden("a", "pair"), hidden("b", "pair")),
            Map.of("a", ABSTAIN, "b", mapped(END)));
    }

    @Test
    void doesNotInferPairsWithoutDateEvidence() {
        var a = new FieldCandidate("a", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "학점",
            null, null, null, null, null, null, null, new SemanticContext(null, InputType.TEXT, null, null, null,
                null, null, null), "pair");
        var b = new FieldCandidate("b", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "만점",
            null, null, null, null, null, null, null, new SemanticContext(null, InputType.TEXT, null, null, null,
                null, null, null), "pair");
        assertBothUnmapped(List.of(field("s1", null), field("s2", null), a, b),
            Map.of("s1", mapped(SCHOOL), "s2", mapped(REGION), "a", ABSTAIN, "b", ABSTAIN));
    }

    @Test
    void doesNotInferTenurePartsAsDates() {
        var years = new FieldCandidate("a", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "근속 년수",
            null, null, null, null, null, null, null, new SemanticContext(null, InputType.TEXT, null, null, null,
                null, null, null), "pair");
        var months = new FieldCandidate("b", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "개월",
            null, null, null, null, null, null, null, new SemanticContext(null, InputType.TEXT, null, null, null,
                null, null, null), "pair");
        assertBothUnmapped(List.of(field("s1", null), field("s2", null), years, months),
            Map.of("s1", mapped(SCHOOL), "s2", mapped(REGION), "a", ABSTAIN, "b", ABSTAIN));
    }

    private static FieldCandidate hidden(String id, String containerId) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.HIDDEN,
            id, null, null, "YYYY-MM", null, true, null, null,
            new SemanticContext(null, InputType.TEXT, null, null, null, null, null, null), containerId);
    }

    private static void assertBothUnmapped(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var response = analyze(fields, mappings);
        assertThat(response.fields().stream()
            .filter(field -> field.candidateId().equals("a") || field.candidateId().equals("b")))
            .allSatisfy(field -> assertThat(field.profileFieldKey()).isNull());
    }

    private static void assertUnmapped(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var candidate = analyze(fields, mappings).fields().stream()
            .filter(field -> field.candidateId().equals("a")).findFirst().orElseThrow();
        assertThat(candidate.profileFieldKey()).isNull();
        assertThat(candidate.writePlan()).isNull();
    }

    private static Mapping mapped(String key) {
        return new Mapping(key, 0.95, true, null);
    }

    private static FieldCandidate field(String id, String containerId) {
        return field(id, containerId, true);
    }

    private static FieldCandidate field(String id, String containerId, Boolean readonly) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            id, null, null, "YYYY-MM", null, readonly, null, null,
            new SemanticContext(null, InputType.TEXT, null, null, null, null, null, null), containerId);
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var request = new GenericFieldsRequest(2, "paired-date",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("education", "EDUCATION", fields)),
            List.of(WriteCommand.SELECT_DATE));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

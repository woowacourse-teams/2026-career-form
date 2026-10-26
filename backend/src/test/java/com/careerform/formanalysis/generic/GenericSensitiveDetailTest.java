package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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

/** 보훈·장애 여부를 고르면 나타나는 상세 선택칸을 라벨로 판정한다. */
class GenericSensitiveDetailTest {

    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);

    @ParameterizedTest
    @CsvSource({"장애내용,disability.disability.disabilityType", "장애 유형,disability.disability.disabilityType",
        "장애정도,disability.disability.disabilityGrade", "장애 등급,disability.disability.disabilityGrade"})
    void mapsDisabilityDetailSelects(String label, String key) {
        var response = analyze(List.of(select("d", label)), Map.of("d", ABSTAIN));

        assertThat(field(response, "d").profileFieldKey()).isEqualTo(key);
    }

    @Test
    void correctsADisabilityDetailTheModelGaveAnotherDisabilityKey() {
        var response = analyze(List.of(select("d", "장애정도")),
            Map.of("d", new Mapping("disability.disability.disabilityType", 0.8, true, null)));

        assertThat(field(response, "d").profileFieldKey()).isEqualTo("disability.disability.disabilityGrade");
    }

    @Test
    void mapsARelationSelectNextToVeteranFields() {
        var response = analyze(List.of(text("n", "보훈번호"), select("r", "관계")),
            Map.of("n", new Mapping("veteran.veteran.veteranNumber", 0.98, true, null), "r", ABSTAIN));

        assertThat(field(response, "r").profileFieldKey()).isEqualTo("veteran.veteran.veteranRelation");
    }

    @Test
    void leavesARelationSelectWithoutVeteranContext() {
        var response = analyze(List.of(text("n", "가족 이름"), select("r", "관계")),
            Map.of("n", ABSTAIN, "r", ABSTAIN));

        assertThat(field(response, "r").profileFieldKey()).isNull();
    }

    @Test
    void keepsANonSensitiveModelKey() {
        var response = analyze(List.of(select("d", "장애정도")),
            Map.of("d", new Mapping("personal.personal.gender", 0.9, true, null)));

        assertThat(field(response, "d").profileFieldKey()).isEqualTo("personal.personal.gender");
    }

    private static GenericFieldsResponse.Field field(GenericFieldsResponse response, String id) {
        return response.fields().stream().filter(field -> field.candidateId().equals(id)).findFirst().orElseThrow();
    }

    private static FieldCandidate text(String id, String label) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, null, new SemanticContext(null, null, null, null, null, null, null, null), null);
    }

    private static FieldCandidate select(String id, String label) {
        return new FieldCandidate(id, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, List.of(new Option(id + "1", "A"), new Option(id + "2", "B")),
            new SemanticContext(null, null, null, null, null, null, null, null), null);
    }

    private static GenericFieldsResponse analyze(List<FieldCandidate> fields, Map<String, Mapping> mappings) {
        var request = new GenericFieldsRequest(2, "sensitive-detail",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("sensitive", "SENSITIVE", fields)),
            List.of(WriteCommand.SET_TEXT, WriteCommand.SELECT_OPTION));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

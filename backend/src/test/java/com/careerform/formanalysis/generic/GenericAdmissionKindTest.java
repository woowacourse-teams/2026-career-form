package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.HashMap;
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

/** 입학·편입 두 선택지만 가진 입학구분 선택칸은 같은 섹션의 학력 기록(대학교·대학원)으로 편입유무·입학유형을 정한다. */
class GenericAdmissionKindTest {

    private static final Mapping ABSTAIN = new Mapping(null, 0.0, true, null);
    private static final String UNIVERSITY = "education.university.transferStatus";
    private static final String GRADUATE = "education.graduateSchool.admissionType";

    @Test
    void mapsAnAbstainedAdmissionKindSelectNextToUniversityFields() {
        var response = analyze("EDUCATION", kind("k", "입학", "편입"), universitySiblings());

        assertThat(field(response, "k").profileFieldKey()).isEqualTo(UNIVERSITY);
    }

    @Test
    void keepsTheTransferStatusKeyOnAnAdmissionKindSelect() {
        var mappings = universityMappings();
        mappings.put("k", new Mapping(UNIVERSITY, 0.9, true, null));
        var response = analyze("EDUCATION", kind("k", "입학", "편입"), universitySiblings(), mappings);

        assertThat(field(response, "k").profileFieldKey()).isEqualTo(UNIVERSITY);
    }

    @Test
    void mapsAnAdmissionKindSelectNextToGraduateSchoolFields() {
        var mappings = new HashMap<String, Mapping>();
        mappings.put("n", new Mapping("education.graduateSchool.schoolName", 0.9, true, null));
        mappings.put("d", new Mapping("education.graduateSchool.startDate", 0.9, true, null));
        var response = analyze("EDUCATION", kind("k", "입학", "편입"), universitySiblings(), mappings);

        assertThat(field(response, "k").profileFieldKey()).isEqualTo(GRADUATE);
    }

    @Test
    void abstainsWithoutEducationSiblings() {
        var response = analyze("EDUCATION", kind("k", "입학", "편입"), universitySiblings(), new HashMap<>());

        assertThat(field(response, "k").profileFieldKey()).isNull();
    }

    @Test
    void abstainsWhenSiblingsBelongToBothRecords() {
        var mappings = new HashMap<String, Mapping>();
        mappings.put("n", new Mapping("education.university.schoolName", 0.9, true, null));
        mappings.put("d", new Mapping("education.graduateSchool.startDate", 0.9, true, null));
        var response = analyze("EDUCATION", kind("k", "입학", "편입"), universitySiblings(), mappings);

        assertThat(field(response, "k").profileFieldKey()).isNull();
    }

    @Test
    void abstainsWhenThereIsAThirdMeaningfulOption() {
        var response = analyze("EDUCATION", kind("k", "입학", "편입", "재입학"), universitySiblings());

        assertThat(field(response, "k").profileFieldKey()).isNull();
    }

    @Test
    void acceptsTheLongerAdmissionVocabulary() {
        var response = analyze("EDUCATION", kind("k", "신입학", "편입학"), universitySiblings());

        assertThat(field(response, "k").profileFieldKey()).isEqualTo(UNIVERSITY);
    }

    @Test
    void leavesANonEducationSectionUnchanged() {
        var response = analyze("CAREER", kind("k", "입학", "편입"), universitySiblings());

        assertThat(field(response, "k").profileFieldKey()).isNull();
    }

    private static List<FieldCandidate> universitySiblings() {
        return List.of(text("n", "학교명"), text("d", "입학일"));
    }

    private static Map<String, Mapping> universityMappings() {
        var mappings = new HashMap<String, Mapping>();
        mappings.put("n", new Mapping("education.university.schoolName", 0.9, true, null));
        mappings.put("d", new Mapping("education.university.startDate", 0.9, true, null));
        return mappings;
    }

    private static FieldCandidate kind(String id, String... texts) {
        List<Option> options = new ArrayList<>(List.of(placeholder(id + "0", "선택")));
        for (int i = 0; i < texts.length; i++) {
            options.add(option(id + (i + 1), texts[i]));
        }
        return select(id, "입학구분", options.toArray(Option[]::new));
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

    private static FieldCandidate text(String id, String label) {
        return new FieldCandidate(id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, label, null, null,
            null, null, null, null, null,
            new SemanticContext(null, null, null, null, null, null, null, null), null);
    }

    private static GenericFieldsResponse.Field field(GenericFieldsResponse response, String id) {
        return response.fields().stream().filter(field -> field.candidateId().equals(id)).findFirst().orElseThrow();
    }

    private static GenericFieldsResponse analyze(String category, FieldCandidate kind,
        List<FieldCandidate> siblings) {
        return analyze(category, kind, siblings, universityMappings());
    }

    private static GenericFieldsResponse analyze(String category, FieldCandidate kind,
        List<FieldCandidate> siblings, Map<String, Mapping> siblingMappings) {
        var fields = new ArrayList<FieldCandidate>(siblings);
        fields.add(kind);
        var mappings = new HashMap<>(siblingMappings);
        mappings.putIfAbsent(kind.candidateId(), ABSTAIN);
        siblings.forEach(sibling -> mappings.putIfAbsent(sibling.candidateId(), ABSTAIN));
        var request = new GenericFieldsRequest(2, "admission-kind",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("edu", category, fields)),
            List.of(WriteCommand.SET_TEXT, WriteCommand.SELECT_OPTION));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

package com.careerform.formanalysis.generic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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

class GenericCertificateNumberTest {

    private static final String NAME = "certifications.certificate.name";
    private static final String NUMBER = "certifications.certificate.registrationNo";

    @ParameterizedTest
    @ValueSource(strings = {"자격인증번호", "자격증 번호", "등록번호", "발급번호"})
    void correctsANumberFieldTheModelGaveTheCertificateName(String label) {
        var response = analyze("CERTIFICATE", List.of(text("name", "자격증명"), text("number", label)),
            Map.of("name", mapped(NAME), "number", mapped(NAME)));

        assertThat(field(response, "number").profileFieldKey()).isEqualTo(NUMBER);
        assertThat(field(response, "name").profileFieldKey()).isEqualTo(NAME);
    }

    @Test
    void mapsAnAbstainedCertificateNumberField() {
        var response = analyze("CERTIFICATE", List.of(text("number", "자격인증번호")),
            Map.of("number", new Mapping(null, 0.0, true, null)));

        assertThat(field(response, "number").profileFieldKey()).isEqualTo(NUMBER);
    }

    @ParameterizedTest
    @ValueSource(strings = {"전화번호", "수험번호 확인", "자격증명"})
    void leavesOtherLabelsAlone(String label) {
        var response = analyze("CERTIFICATE", List.of(text("number", label)),
            Map.of("number", new Mapping(null, 0.0, true, null)));

        assertThat(field(response, "number").profileFieldKey()).isNull();
    }

    @Test
    void doesNotApplyOutsideACertificateSection() {
        var response = analyze("LANGUAGE", List.of(text("number", "등록번호")),
            Map.of("number", new Mapping(null, 0.0, true, null)));

        assertThat(field(response, "number").profileFieldKey()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"certifications.certificate.grade", "certifications.certificate.issuer"})
    void correctsAnyOtherCertificateKeyOnANumberField(String modelKey) {
        var response = analyze("CERTIFICATE", List.of(text("number", "자격인증번호")),
            Map.of("number", mapped(modelKey)));

        assertThat(field(response, "number").profileFieldKey()).isEqualTo(NUMBER);
    }

    @Test
    void keepsANonCertificateModelKey() {
        var response = analyze("CERTIFICATE", List.of(text("number", "등록번호")),
            Map.of("number", mapped("contact.contact.phoneNumber")));

        assertThat(field(response, "number").profileFieldKey()).isEqualTo("contact.contact.phoneNumber");
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

    private static GenericFieldsResponse analyze(String category, List<FieldCandidate> fields,
        Map<String, Mapping> mappings) {
        var request = new GenericFieldsRequest(2, "certificate-number",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(GenericFieldsJevHttp.section("section", category, fields)),
            List.of(WriteCommand.SET_TEXT));
        var resolver = mock(JevCategoryFieldResolver.class);
        when(resolver.resolve(request)).thenReturn(new JevCategoryFieldResolver.Resolution(mappings, 1));
        return new GenericFieldsService(Optional.of(resolver),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new FieldInteractionPolicy(), new SupportedProfileFields()).analyze(request);
    }
}

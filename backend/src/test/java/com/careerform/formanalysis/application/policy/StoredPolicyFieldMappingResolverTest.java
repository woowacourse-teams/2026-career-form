package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

import tools.jackson.databind.ObjectMapper;

@DisplayName("저장된 회사 정책 Field Mapping Resolver")
class StoredPolicyFieldMappingResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("모든 후보를 저장 rule의 canonical key 또는 NO_MATCH로 분류한다")
    void mapsEveryCandidateExactlyOnce() throws Exception {
        FieldsAnalysisRequest request = objectMapper.readValue(
            fixture("sk-fields-snapshot-b-v2.json"),
            FieldsAnalysisRequest.class
        );

        FieldMappingResolver.Resolution resolution =
            new StoredPolicyFieldMappingResolver(CompanyFormPolicyFixture.sk())
                .resolve(request);

        assertThat(resolution.results()).containsExactly(
            new FieldMappingResolver.NoMatch("field-korean-full-name"),
            match("field-english-given-name", "personal.personal.englishGivenName"),
            match("field-english-family-name", "personal.personal.englishFamilyName"),
            match("field-email", "contact.contact.email"),
            match("field-phone", "contact.contact.phoneNumber"),
            match("field-nationality", "personal.personal.nationality"),
            match("field-postal-code", "contact.contact.postalCode"),
            match("field-address-line-1", "contact.contact.addressLine1"),
            match("field-address-line-2", "contact.contact.addressLine2"),
            match("field-high-school-name", "education.highSchool.schoolName"),
            match("field-university-name", "education.university.schoolName"),
            match(
                "field-university-status",
                "education.university.completionStatus"
            )
        );
    }

    @Test
    @DisplayName("알려진 이름도 control tuple이 다르거나 이름이 없으면 NO_MATCH다")
    void closesUnverifiedAndUnnamedFields() {
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "stored-policy-unverified-fields",
            new Site("www.skcareers.com", "/Application/Index/{postingId}"),
            List.of(new Section(
                "section-profile",
                null,
                null,
                List.of(
                    field("field-wrong-control", "prsEmail", FormElement.CUSTOM),
                    field("field-unnamed", null, FormElement.INPUT)
                ),
                null
            ))
        );

        FieldMappingResolver.Resolution resolution =
            new StoredPolicyFieldMappingResolver(CompanyFormPolicyFixture.sk())
                .resolve(request);

        assertThat(resolution.results()).containsExactly(
            new FieldMappingResolver.NoMatch("field-wrong-control"),
            new FieldMappingResolver.NoMatch("field-unnamed")
        );
    }

    private static FieldCandidate field(
        String candidateId,
        String domName,
        FormElement element
    ) {
        return new FieldCandidate(
            candidateId,
            element,
            element == FormElement.INPUT ? FormControl.TEXT : FormControl.CUSTOM,
            Visibility.VISIBLE,
            null,
            null,
            domName,
            null,
            null,
            null,
            null,
            null
        );
    }

    private static FieldMappingResolver.Match match(String candidateId, String key) {
        return new FieldMappingResolver.Match(candidateId, key);
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}

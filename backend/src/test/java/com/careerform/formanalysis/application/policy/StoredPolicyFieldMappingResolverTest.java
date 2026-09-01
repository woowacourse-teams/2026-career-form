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
            fixture("sk-fields-current-v2.json"),
            FieldsAnalysisRequest.class
        );

        FieldMappingResolver.Resolution resolution =
            new StoredPolicyFieldMappingResolver(CompanyFormPolicyFixture.sk())
                .resolve(request);

        assertThat(resolution.results()).containsExactly(
            new FieldMappingResolver.Match(
                "field-korean-name",
                new FieldMappingResolver.DerivedBinding(
                    FieldMappingResolver.DerivedRecipe.KOREAN_FULL_NAME
                )
            ),
            match("field-email", "contact.contact.email"),
            match("field-phone", "contact.contact.phoneNumber"),
            match(
                "field-postal-code",
                "contact.contact.postalCode",
                true
            ),
            match(
                "field-address-line-1",
                "contact.contact.addressLine1",
                true
            ),
            match("field-address-line-2", "contact.contact.addressLine2"),
            match(
                "field-military-status",
                "military.military.militaryStatus"
            ),
            match(
                "field-military-branch",
                "military.military.militaryBranch"
            ),
            match(
                "field-military-rank",
                "military.military.militaryRank"
            ),
            match(
                "field-military-start",
                "military.military.serviceStartDate"
            ),
            match(
                "field-military-end",
                "military.military.serviceEndDate"
            ),
            match(
                "field-military-exemption-reason",
                "military.military.exemptionReason"
            ),
            new FieldMappingResolver.NoMatch("field-latest-education"),
            match(
                "field-university-status",
                "education.university.completionStatus"
            ),
            match("field-university-name", "education.university.schoolName"),
            match("field-certificate-name", "certifications.certificate.name"),
            match("field-certificate-issuer", "certifications.certificate.issuer"),
            match(
                "field-certificate-date",
                "certifications.certificate.acquisitionDate"
            ),
            match(
                "field-certificate-number",
                "certifications.certificate.registrationNo"
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

    private static FieldMappingResolver.Match match(
        String candidateId,
        String key,
        boolean allowsReadonlyWrite
    ) {
        return new FieldMappingResolver.Match(
            candidateId,
            key,
            allowsReadonlyWrite
        );
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}

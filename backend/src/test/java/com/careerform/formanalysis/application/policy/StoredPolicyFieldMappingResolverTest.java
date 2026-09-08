package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
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

    @Test
    @DisplayName("반복 학력 필드의 UUID 접미사를 제거해 저장 rule과 매칭한다")
    void mapsRepeatedFieldWithUuidSuffix() {
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "stored-policy-repeated-field",
            new Site("www.skcareers.com", "/Application/Index/{postingId}"),
            List.of(new Section(
                "section-3", null, null,
                List.of(field("field-university-name", "eduEducationName_123e4567-e89b-12d3-a456-426614174000", FormElement.INPUT)),
                null
            ))
        );

        assertThat(new StoredPolicyFieldMappingResolver(CompanyFormPolicyFixture.sk())
            .resolve(request).results())
            .containsExactly(match("field-university-name", "education.university.schoolName"));
    }

    @Test
    @DisplayName("현대처럼 id에 숫자 반복 suffix를 쓰는 button field도 rule과 매칭한다")
    void mapsRepeatedFieldWithNumericIdSuffix() {
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "stored-policy-hyundai-repeated-field",
            new Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new Section(
                "section-root", null, null,
                List.of(new FieldCandidate(
                    "field-certificate-name", FormElement.INPUT, FormControl.TEXT,
                    Visibility.VISIBLE, null, "cerCertName_2", null,
                    null, null, null, null, null
                )),
                null
            ))
        );

        assertThat(new StoredPolicyFieldMappingResolver(CompanyFormPolicyFixture.sk())
            .resolve(request).results())
            .containsExactly(match("field-certificate-name", "certifications.certificate.name"));
    }

    @Test
    @DisplayName("같은 name을 쓰는 현대 어학·자격 날짜를 base DOM id로 구분한다")
    void distinguishesSharedNamesWithRequiredBaseDomIds() {
        FieldsAnalysisRequest request = request(List.of(
            field("field-language-date", "acqDtForeLang_1", "acqDt", FormControl.TEXT),
            field("field-certificate-date", "acqDt_1", "acqDt", FormControl.TEXT)
        ));

        assertThat(new StoredPolicyFieldMappingResolver(sharedDatePolicy())
            .resolve(request).results())
            .containsExactly(
                match("field-language-date", "languages.languageTest.acquisitionDate"),
                match("field-certificate-date", "certifications.certificate.acquisitionDate")
            );
    }

    @Test
    @DisplayName("제약된 shared name은 다른 id·control·잘못된 suffix로 우회 매칭하지 않는다")
    void rejectsMismatchedConstrainedFieldIdentity() {
        FieldsAnalysisRequest request = request(List.of(
            field("field-wrong-id", "legacyDate_1", "acqDt", FormControl.TEXT),
            field("field-conflicting-name", "acqDtForeLang_1", "regNo", FormControl.TEXT),
            field("field-wrong-control", "acqDtForeLang_1", "acqDt", FormControl.BUTTON),
            field("field-invalid-suffix", "acqDtForeLang_01", "acqDt", FormControl.TEXT),
            field("field-missing-name", "acqDtForeLang_1", null, FormControl.TEXT),
            field("field-missing-id", null, "acqDt", FormControl.TEXT)
        ));

        assertThat(new StoredPolicyFieldMappingResolver(sharedDatePolicy())
            .resolve(request).results())
            .containsExactly(
                new FieldMappingResolver.NoMatch("field-wrong-id"),
                new FieldMappingResolver.NoMatch("field-conflicting-name"),
                new FieldMappingResolver.NoMatch("field-wrong-control"),
                new FieldMappingResolver.NoMatch("field-invalid-suffix"),
                new FieldMappingResolver.NoMatch("field-missing-name"),
                new FieldMappingResolver.NoMatch("field-missing-id")
            );
    }

    @Test
    @DisplayName("같은 현대 학력 DOM 이름을 검증된 학력 item group별 프로필 항목에 연결한다")
    void mapsSharedHyundaiEducationNamesByVerifiedItemGroup() {
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "stored-policy-hyundai-education-groups",
            new Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new Section(
                "section-root", null, null, List.of(),
                List.of(
                    new FieldsAnalysisRequest.Item(
                        "education-high-school",
                        List.of(field("high-school-name", "schNm_1", "schNm", FormControl.TEXT)),
                        "educationhighschool"
                    ),
                    new FieldsAnalysisRequest.Item(
                        "education-university",
                        List.of(field("university-name", "schNm_2", "schNm", FormControl.TEXT)),
                        "educationuniversity"
                    ),
                    new FieldsAnalysisRequest.Item(
                        "education-graduate-school",
                        List.of(field("graduate-school-name", "schNm_3", "schNm", FormControl.TEXT)),
                        "educationgraduateschool"
                    )
                )
            ))
        );

        assertThat(new StoredPolicyFieldMappingResolver(contextualEducationPolicy())
            .resolve(request).results())
            .containsExactly(
                match("high-school-name", "education.highSchool.schoolName"),
                match("university-name", "education.university.schoolName"),
                match("graduate-school-name", "education.graduateSchool.schoolName")
            );
    }

    @Test
    @DisplayName("학력 item group이 없거나 검증값과 다르면 공통 DOM 이름을 임의 매핑하지 않는다")
    void rejectsSharedHyundaiEducationNamesWithoutVerifiedItemGroup() {
        FieldCandidate field = field(
            "unknown-education-name", "schNm_1", "schNm", FormControl.TEXT
        );
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "stored-policy-hyundai-education-unknown-group",
            new Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new Section(
                "section-root", null, null,
                List.of(field),
                List.of(new FieldsAnalysisRequest.Item(
                    "education-unknown",
                    List.of(field(
                        "wrong-group-name", "schNm_2", "schNm", FormControl.TEXT
                    )),
                    "educationunknown"
                ))
            ))
        );

        assertThat(new StoredPolicyFieldMappingResolver(contextualEducationPolicy())
            .resolve(request).results())
            .containsExactly(
                new FieldMappingResolver.NoMatch("unknown-education-name"),
                new FieldMappingResolver.NoMatch("wrong-group-name")
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

    private static FieldCandidate field(
        String candidateId,
        String domId,
        String domName,
        FormControl control
    ) {
        return new FieldCandidate(
            candidateId,
            FormElement.INPUT,
            control,
            Visibility.VISIBLE,
            null,
            domId,
            domName,
            null,
            null,
            null,
            null,
            null
        );
    }

    private static FieldsAnalysisRequest request(List<FieldCandidate> fields) {
        return new FieldsAnalysisRequest(
            2,
            "stored-policy-constrained-fields",
            new Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new Section("section-root", null, null, fields, null))
        );
    }

    private static CompanyFormPolicy sharedDatePolicy() {
        return CompanyFormPolicy.create(
            "hyundai",
            3,
            new PreparationFingerprint(
                java.util.Set.of("section-root"),
                List.of(new ActionStructure(
                    "synthetic-action",
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement.BUTTON,
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl.BUTTON
                ))
            ),
            new FieldsFingerprint(
                java.util.Set.of("section-root"),
                List.of(new FieldStructure(
                    "synthetic-field",
                    FormElement.INPUT,
                    FormControl.TEXT
                ))
            ),
            List.of(new ActionRule("synthetic-action", ActionKind.ADD, null)),
            List.of(
                constrainedTextRule(
                    "acqDtForeLang",
                    "acqDt",
                    "languages.languageTest.acquisitionDate"
                ),
                constrainedTextRule(
                    "acqDt",
                    "acqDt",
                    "certifications.certificate.acquisitionDate"
                ),
                new FieldRule(
                    "legacyDate",
                    FormElement.INPUT,
                    FormControl.TEXT,
                    "personal.personal.birthDate"
                ),
                new FieldRule(
                    "regNo",
                    FormElement.INPUT,
                    FormControl.TEXT,
                    "certifications.certificate.registrationNo"
                )
            ),
            ignored -> true
        );
    }

    private static CompanyFormPolicy contextualEducationPolicy() {
        return CompanyFormPolicy.create(
            "hyundai",
            4,
            new PreparationFingerprint(
                java.util.Set.of("section-root"),
                List.of(new ActionStructure(
                    "synthetic-action",
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement.BUTTON,
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl.BUTTON
                ))
            ),
            new FieldsFingerprint(
                java.util.Set.of("section-root"),
                List.of(new FieldStructure(
                    "synthetic-field",
                    FormElement.INPUT,
                    FormControl.TEXT
                ))
            ),
            List.of(new ActionRule("synthetic-action", ActionKind.ADD, null)),
            List.of(
                contextualTextRule(
                    "schNm", "schNm", "educationhighschool",
                    "education.highSchool.schoolName"
                ),
                contextualTextRule(
                    "schNm", "schNm", "educationuniversity",
                    "education.university.schoolName"
                ),
                contextualTextRule(
                    "schNm", "schNm", "educationgraduateschool",
                    "education.graduateSchool.schoolName"
                )
            ),
            ignored -> true
        );
    }

    private static FieldRule constrainedTextRule(
        String structuralName,
        String requiredDomName,
        String profileFieldKey
    ) {
        return new FieldRule(
            structuralName,
            FormElement.INPUT,
            FormControl.TEXT,
            new FieldMappingResolver.DirectBinding(profileFieldKey),
            false,
            requiredDomName
        );
    }

    private static FieldRule contextualTextRule(
        String structuralName,
        String requiredDomName,
        String requiredItemGroupId,
        String profileFieldKey
    ) {
        return new FieldRule(
            structuralName,
            FormElement.INPUT,
            FormControl.TEXT,
            new FieldMappingResolver.DirectBinding(profileFieldKey),
            false,
            requiredDomName,
            requiredItemGroupId
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

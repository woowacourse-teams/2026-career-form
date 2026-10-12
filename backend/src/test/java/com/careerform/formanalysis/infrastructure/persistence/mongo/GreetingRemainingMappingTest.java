package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.GreetingFieldMappingResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver.*;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.*;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;

class GreetingRemainingMappingTest {
    record Example(String name, FormElement element, FormControl control, String group, String key, WriteCommand command) {}
    static Stream<Example> mappedFields() {
        return Stream.of(
            "educationalBackground.highSchool.schoolName|TEXT|educationhighschool|education.highSchool.schoolName|SEARCH_SELECTION",
            "educationalBackground.highSchool.completionStatus|BUTTON|educationhighschool|education.highSchool.completionStatus|SELECT_BUTTON_OPTION",
            "educationalBackground.highSchool.enrollmentPeriod.startDate|BUTTON|educationhighschool|education.highSchool.startDate|SELECT_DATE",
            "educationalBackground.highSchool.enrollmentPeriod.endDate|BUTTON|educationhighschool|education.highSchool.endDate|SELECT_DATE",
            "workHistory.workExperiences.0.companyName|TEXT|careerscareer|careers.career.companyName|SEARCH_SELECTION",
            "workHistory.workExperiences.0.employmentPeriod.startDate|BUTTON|careerscareer|careers.career.startDate|SELECT_DATE",
            "workHistory.workExperiences.0.employmentPeriod.endDate|BUTTON|careerscareer|careers.career.endDate|SELECT_DATE",
            "workHistory.workExperiences.0.employmentStatus|CHECKBOX|careerscareer|careers.career.employmentStatus|CHECK_CHECKBOX",
            "workHistory.workExperiences.0.department|TEXT|careerscareer|careers.career.department|SET_TEXT",
            "workHistory.workExperiences.0.positionRank|TEXT|careerscareer|careers.career.position|SET_TEXT",
            "workHistory.workExperiences.0.dutiesResponsibility|TEXTAREA|careerscareer|careers.career.responsibilities|SET_TEXT",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.foreignLanguage|BUTTON|languageslanguagetest|languages.languageTest.language|SELECT_BUTTON_OPTION",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName|TEXT|languageslanguagetest|languages.languageTest.testName|SEARCH_SELECTION",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.acquisitionDate|BUTTON|languageslanguagetest|languages.languageTest.acquisitionDate|SELECT_DATE",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.score.score|TEXT|languageslanguagetest|languages.languageTest.grade|SET_TEXT",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.grade|BUTTON|languageslanguagetest|languages.languageTest.grade|SELECT_BUTTON_OPTION",
            "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0.foreignLanguage|BUTTON|languageslanguageskill|languages.languageSkill.language|SELECT_BUTTON_OPTION",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials|TEXT|certificationscertificate|certifications.certificate.name|SEARCH_SELECTION",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.issuingAgency|TEXT|certificationscertificate|certifications.certificate.issuer|SET_TEXT",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.acquisitionDate|BUTTON|certificationscertificate|certifications.certificate.acquisitionDate|SELECT_DATE",
            "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.registrationNumber|TEXT|languageslanguagetest|languages.languageTest.registrationNo|SET_TEXT",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.rating|TEXT|certificationscertificate|certifications.certificate.grade|SET_TEXT",
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.registrationNumber|TEXT|certificationscertificate|certifications.certificate.registrationNo|SET_TEXT",
            "workHistory.workExperiences.0.reasonForResignation|TEXT|careerscareer|careers.career.terminationReason|SET_TEXT",
            "educationalBackground.universities.0.totalCreditsEarned|TEXT|educationuniversity|education.university.totalCredits|SET_TEXT",
            "workHistory.projects.0.projectName|TEXT|projectsproject|projects.project.projectName|SET_TEXT",
            "workHistory.projects.0.roleParticipationRole|TEXT|projectsproject|projects.project.role|SET_TEXT",
            "workHistory.projects.0.projectDescription|TEXTAREA|projectsproject|projects.project.activityDetails|SET_TEXT",
            "workHistory.projects.0.projectPeriod.startDate|BUTTON|projectsproject|projects.project.startDate|SELECT_DATE",
            "workHistory.projects.0.projectPeriod.endDate|BUTTON|projectsproject|projects.project.endDate|SELECT_DATE"
        ).map(value -> {
            var parts = value.split("\\|");
            var control = FormControl.valueOf(parts[1]);
            return new Example(parts[0], control == FormControl.TEXTAREA ? FormElement.TEXTAREA : FormElement.INPUT,
                control, parts[2], parts[3], WriteCommand.valueOf(parts[4]));
        });
    }
    @ParameterizedTest @MethodSource("mappedFields")
    void mapsExactProfileFieldsAndCommands(Example example) {
        var candidate = field(example, new RepeatContext(example.group(), 0, 1));
        var result = resolve(candidate, example.group());
        assertThat(result).isEqualTo(new Match("target", example.key()));
        var interaction = new FieldInteractionPolicy();
        assertThat(interaction.evaluateGreeting(candidate, result, List.of(WriteCommand.SELECT_DATE)).writePlan().command()).isEqualTo(example.command());
        if (example.command() == WriteCommand.SELECT_DATE)
            assertThat(interaction.evaluateGreeting(candidate, result, List.of()).writePlan()).isNull();
    }
    @ParameterizedTest @MethodSource("mappedFields")
    void rejectsWrongGroupIndexTypeOrTopLevelPlacement(Example example) {
        var valid = new RepeatContext(example.group(), 0, 1);
        assertThat(resolve(field(example, valid), "foreign")).isEqualTo(new NoMatch("target"));
        assertThat(resolve(field(example, new RepeatContext(example.group(), 1, 2)), example.group())).isEqualTo(new NoMatch("target"));
        assertThat(resolve(field(example, null), example.group())).isEqualTo(new NoMatch("target"));
        assertThat(resolve(field(example, valid), null)).isEqualTo(new NoMatch("target"));
        var wrong = new Example(example.name(), FormElement.SELECT, FormControl.SELECT, example.group(), example.key(), example.command());
        assertThat(resolve(field(wrong, valid), example.group())).isEqualTo(new NoMatch("target"));
    }
    @Test
    void mapsOnlyVerifiedAliases() {
        var gender = lookup("basicInformation.gender", null);
        assertThat(gender.profileFieldKey()).isEqualTo("personal.personal.gender");
        assertThat(gender.optionMap()).containsEntry("남성", "남성").containsEntry("여성", "여성").doesNotContainKeys("미지정", "기타");
        assertThat(lookup("workHistory.workExperiences.0.employmentType", "careerscareer").optionMap())
            .containsEntry("정규", "정규직").containsEntry("계약", "계약직").containsEntry("파견", "파견직");
        assertThat(lookup("languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0.conversationalProficiency", "languageslanguageskill").optionMap())
            .containsEntry("일상 대화 가능", "일상 대화 가능").containsEntry("일상 대화", "일상 대화 가능").doesNotContainKeys("상", "중", "하");
    }
    @Test
    void mapsTopLevelDetailTextAndVerifiedOptionLabels() {
        var prefix = "militaryServicePreferentialEmploymentStatus.";
        for (var pair : List.of(
            List.of(prefix + "militaryService.militaryOccupationalSpecialty", "military.military.militarySpecialty"),
            List.of(prefix + "disability.disabilityRegistrationNumber", "disability.disability.disabilityRegistrationNumber"))) {
            var example = new Example(pair.get(0), FormElement.INPUT, FormControl.TEXT, null, pair.get(1), WriteCommand.SET_TEXT);
            var candidate = field(example, null);
            var result = resolve(candidate, null);
            assertThat(result).isEqualTo(new Match("target", pair.get(1)));
            assertThat(new FieldInteractionPolicy().evaluateGreeting(candidate, result, List.of()).writePlan().command())
                .isEqualTo(WriteCommand.SET_TEXT);
        }
        var address = "personalInformation.currentAddress.";
        for (var pair : List.of(List.of("postalCode", "contact.contact.postalCode"),
            List.of("address", "contact.contact.addressLine1"), List.of("detailedAddress", "contact.contact.addressLine2"))) {
            var example = new Example(address + pair.get(0), FormElement.INPUT, FormControl.TEXT, null, pair.get(1), WriteCommand.SET_TEXT);
            assertThat(resolve(field(example, null), null)).isEqualTo(new Match("target", pair.get(1)));
        }
        var classification = lookup(prefix + "militaryService.militaryServiceClassification", null);
        assertThat(classification.profileFieldKey()).isEqualTo("military.military.militaryType");
        assertThat(classification.optionMap()).containsEntry("현역병", "현역병").containsEntry("산업기능요원", "산업기능요원");
        var discharge = lookup(prefix + "militaryService.dischargeType", null);
        assertThat(discharge.profileFieldKey()).isEqualTo("military.military.dischargeType");
        assertThat(discharge.optionMap()).containsEntry("만기전역", "만기제대").containsEntry("만기제대", "만기제대")
            .doesNotContainKeys("기타");
        var relation = lookup(prefix + "veteranStatus.veteranRelationship", null);
        assertThat(relation.profileFieldKey()).isEqualTo("veteran.veteran.veteranRelation");
        assertThat(relation.optionMap()).containsEntry("본인", "본인").containsEntry("배우자", "배우자");
        for (var group : List.of("universities|educationuniversity|university", "graduateSchools|educationgraduateschool|graduateSchool")) {
            var parts = group.split("\\|");
            var region = lookup("educationalBackground." + parts[0] + ".0.schoolLocation", parts[1]);
            assertThat(region.profileFieldKey()).isEqualTo("education." + parts[2] + ".schoolRegion");
            assertThat(region.optionMap()).containsEntry("서울", "서울").containsEntry("해외", "해외").hasSize(18);
        }
        for (var name : List.of("client", "placeOfEmployment", "contribution")) {
            var unmatched = new Example("workHistory.projects.0." + name, FormElement.INPUT, FormControl.TEXT, "projectsproject", "unused", WriteCommand.SET_TEXT);
            assertThat(resolve(field(unmatched, new RepeatContext("projectsproject", 0, 1)), "projectsproject")).isEqualTo(new NoMatch("target"));
        }
        var rating = new Example(prefix + "veteranStatus.veteranBenefitRating", FormElement.INPUT, FormControl.BUTTON, null, "unused", WriteCommand.SELECT_BUTTON_OPTION);
        assertThat(resolve(field(rating, null), null)).isEqualTo(new NoMatch("target"));
    }
    @Test
    void rejectsDuplicateNamesAndUnsupportedCounterparts() {
        var example = mappedFields().filter(e -> e.name().contains("companyName")).findFirst().orElseThrow();
        var candidate = field(example, new RepeatContext("careerscareer", 0, 1));
        assertThat(resolver().resolve(request(List.of(new Item("row", List.of(candidate, candidate), "careerscareer")), List.of())).results())
            .containsExactly(new NoMatch("target"), new NoMatch("target"));
        for (var name : List.of("educationalBackground.highSchool.trackDepartment", "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0.readingProficiency", "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0.writingProficiency")) {
            var group = name.contains("highSchool") ? "educationhighschool" : "languageslanguageskill";
            var unsupported = new Example(name, FormElement.INPUT, FormControl.BUTTON, group, "unused", WriteCommand.SELECT_BUTTON_OPTION);
            assertThat(resolve(field(unsupported, new RepeatContext(group, 0, 1)), group)).isEqualTo(new NoMatch("target"));
        }
    }
    @Test
    void composesUniversityAdditionalMajorsByProfileOrderRatherThanFixedMinorSlot() {
        for (int slot : List.of(1, 2)) {
            for (String suffix : List.of("", ".majorClassification")) {
                var example = new Example("educationalBackground.universities.0.majors." + slot + suffix,
                    FormElement.INPUT, suffix.isEmpty() ? FormControl.TEXT : FormControl.BUTTON,
                    "educationuniversity", "unused", suffix.isEmpty() ? WriteCommand.SEARCH_SELECTION : WriteCommand.SELECT_BUTTON_OPTION);
                var candidate = field(example, new RepeatContext(example.group(), 0, 1));
                var result = resolve(candidate, example.group());
                assertThat(result).isInstanceOf(Match.class);
                var binding = ((Match) result).valueBinding();
                assertThat(binding).isInstanceOf(DerivedBinding.class);
                assertThat(((DerivedBinding) binding).recipe().name()).isEqualTo("UNIVERSITY_ADDITIONAL_MAJOR_" + slot + (suffix.isEmpty() ? "_NAME" : "_CLASSIFICATION"));
                assertThat(new FieldInteractionPolicy().evaluateGreeting(candidate, result, List.of()).writePlan().command()).isEqualTo(example.command());
            }
        }
    }
    @Test
    void acceptsLastBoundedRowAndRejectsMalformedOrInconsistentRows() {
        for (String index : List.of("127", "128", "01", "-1", "1x")) {
            var rowIndex = index.equals("127") ? 127 : index.equals("128") ? 128 : 1;
            var example = new Example("workHistory.workExperiences." + index + ".companyName", FormElement.INPUT,
                FormControl.TEXT, "careerscareer", "careers.career.companyName", WriteCommand.SEARCH_SELECTION);
            assertThat(resolve(field(example, new RepeatContext(example.group(), rowIndex, 128)), example.group()))
                .isEqualTo(index.equals("127") ? new Match("target", example.key()) : new NoMatch("target"));
        }
        var high = mappedFields().findFirst().orElseThrow();
        assertThat(resolve(field(high, new RepeatContext(high.group(), 0, 2)), high.group())).isEqualTo(new NoMatch("target"));
        var work = mappedFields().filter(e -> e.name().contains("companyName")).findFirst().orElseThrow();
        assertThat(resolve(field(work, new RepeatContext(work.group(), 0, 129)), work.group())).isEqualTo(new NoMatch("target"));
        assertThat(resolve(field(work, new RepeatContext(work.group(), 0, 0)), work.group())).isEqualTo(new NoMatch("target"));
    }
    private LookupBinding lookup(String name, String group) {
        var example = new Example(name, FormElement.INPUT, FormControl.BUTTON, group, "unused", WriteCommand.SELECT_BUTTON_OPTION);
        var result = resolve(field(example, group == null ? null : new RepeatContext(group, 0, 1)), group);
        assertThat(result).isInstanceOf(Match.class);
        assertThat(((Match) result).valueBinding()).isInstanceOf(LookupBinding.class);
        return (LookupBinding) ((Match) result).valueBinding();
    }
    private FieldCandidate field(Example example, RepeatContext repeat) {
        return new FieldCandidate("target", example.element(), example.control(), Visibility.VISIBLE, null, null, example.name(), null, null, null, null, null,
            repeat == null ? null : new SemanticContext(null, null, null, null, null, null, null, repeat));
    }
    private Result resolve(FieldCandidate candidate, String group) {
        return resolver().resolve(group == null ? request(null, List.of(candidate)) : request(List.of(new Item("row", List.of(candidate), group)), List.of())).results().getFirst();
    }
    private GreetingFieldMappingResolver resolver() {
        var doc = GreetingCompanyFormPolicyFactory.create();
        return new GreetingFieldMappingResolver(CompanyFormPolicy.create(doc.companyKey(), doc.version(), doc.preparationFingerprint(), doc.fieldsFingerprint(), doc.actionRules(), doc.fieldRules(), new SupportedProfileFields()::contains));
    }
    private FieldsAnalysisRequest request(List<Item> items, List<FieldCandidate> fields) {
        return new FieldsAnalysisRequest(2, "test", new Site("test.career.greetinghr.com", "/ko/o/*/apply"), List.of(new Section("root", null, null, fields, items)));
    }
}

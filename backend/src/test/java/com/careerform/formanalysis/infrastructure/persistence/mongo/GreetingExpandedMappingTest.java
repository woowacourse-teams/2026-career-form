package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.GreetingFieldMappingResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver.*;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.*;

class GreetingExpandedMappingTest {
    @Test
    void mapsBasicFieldsButNotCompanyQuestions() {
        assertThat(resolve(List.of(field("birth", "basicInformation.birthdate", FormControl.BUTTON, null),
            field("email", "basicInformation.email", FormControl.TEXT, null),
            field("question", "applicationDetail.availableStart.date", FormControl.BUTTON, null)), null))
            .containsExactly(new Match("birth", "personal.personal.birthDate"),
                new Match("email", "contact.contact.email"), new NoMatch("question"));
    }

    @Test
    void rejectsEveryCandidateWithAnAmbiguousGreetingName() {
        var repeat = new RepeatContext("educationuniversity", 0, 1);
        assertThat(resolve(List.of(
            field("email-first", "basicInformation.email", FormControl.TEXT, null),
            field("email-second", "basicInformation.email", FormControl.TEXT, null)), List.of(
            new Item("u0", List.of(
                field("school-first", "educationalBackground.universities.0.schoolName", FormControl.TEXT, repeat),
                field("school-second", "educationalBackground.universities.0.schoolName", FormControl.TEXT, repeat)
            ), "educationuniversity"))))
            .containsExactly(new NoMatch("email-first"), new NoMatch("email-second"),
                new NoMatch("school-first"), new NoMatch("school-second"));
    }

    @Test
    void mapsOnlyExactEducationGroupAndRow() {
        var uni = new RepeatContext("educationuniversity", 1, 2);
        var grad = new RepeatContext("educationgraduateschool", 0, 1);
        assertThat(resolve(List.of(), List.of(
            new Item("u1", List.of(field("school", "educationalBackground.universities.1.schoolName", FormControl.TEXT, uni)), "educationuniversity"),
            new Item("g0", List.of(field("gpa", "educationalBackground.graduateSchools.0.gpa.score", FormControl.TEXT, grad)), "educationgraduateschool"),
            new Item("wrong", List.of(field("cross", "educationalBackground.universities.1.schoolName", FormControl.TEXT, uni)), "educationgraduateschool"),
            new Item("bad-row", List.of(field("row", "educationalBackground.universities.0.schoolName", FormControl.TEXT, uni)), "educationuniversity"),
            new Item("unknown", List.of(field("missing", "educationalBackground.universities.0.schoolName", FormControl.TEXT, null)), "educationuniversity")
        ))).containsExactly(new Match("school", "education.university.schoolName"),
            new Match("gpa", "education.graduateSchool.gpaScore"), new NoMatch("cross"), new NoMatch("row"), new NoMatch("missing"));
    }

    @Test
    void translatesOnlyExplicitUniversityTransferStatusLabels() {
        var repeat = new RepeatContext("educationuniversity", 0, 1);
        assertThat(resolve(List.of(), List.of(new Item("u0", List.of(
            field("admission", "educationalBackground.universities.0.admissionType", FormControl.RADIO, repeat)),
            "educationuniversity")))).containsExactly(new Match("admission", new LookupBinding(
                "education.university.transferStatus", java.util.Map.of("비해당", "입학", "해당", "편입"))));
    }

    @Test
    void translatesOnlyTheFourVerifiedUniversityGpaScales() {
        var repeat = new RepeatContext("educationuniversity", 0, 1);
        assertThat(resolve(List.of(), List.of(new Item("u0", List.of(
            field("scale", "educationalBackground.universities.0.gpa.scoreScale", FormControl.BUTTON, repeat)),
            "educationuniversity")))).containsExactly(new Match("scale", new LookupBinding(
                "education.university.gpaScale", java.util.Map.of(
                    "4.00", "4.0", "4.30", "4.3", "4.50", "4.5", "100.00", "100"))));
    }

    @Test
    void translatesGraduateGpaScalesAndPreservesOnlyVerifiedExactLabels() {
        var repeat = new RepeatContext("educationgraduateschool", 0, 1);
        assertThat(resolve(List.of(), List.of(new Item("g0", List.of(
            field("scale", "educationalBackground.graduateSchools.0.gpa.scoreScale", FormControl.BUTTON, repeat)),
            "educationgraduateschool")))).containsExactly(new Match("scale", new LookupBinding(
                "education.graduateSchool.gpaScale", java.util.Map.ofEntries(
                    java.util.Map.entry("4.00", "4.0"), java.util.Map.entry("4.30", "4.3"),
                    java.util.Map.entry("4.50", "4.5"), java.util.Map.entry("100.00", "100"),
                    java.util.Map.entry("3.0", "3.0"), java.util.Map.entry("3.5", "3.5"),
                    java.util.Map.entry("4.0", "4.0"), java.util.Map.entry("4.3", "4.3"),
                    java.util.Map.entry("4.5", "4.5"), java.util.Map.entry("5.0", "5.0"),
                    java.util.Map.entry("7.0", "7.0"), java.util.Map.entry("20", "20"),
                    java.util.Map.entry("100", "100")))));
    }

    @Test
    void mapsVerifiedEducationControlsAndTopLevelStatus() {
        var repeat = new RepeatContext("educationgraduateschool", 0, 1);
        assertThat(resolve(List.of(
            field("military", "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus", FormControl.BUTTON, null),
            field("disability", "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus", FormControl.RADIO, null),
            field("veteran", "militaryServicePreferentialEmploymentStatus.veteran.veteranStatus", FormControl.RADIO, null)), List.of(
            new Item("g0", List.of(
                field("start", "educationalBackground.graduateSchools.0.enrollmentPeriod.startDate", FormControl.BUTTON, repeat),
                field("degree", "educationalBackground.graduateSchools.0.degreeLevel", FormControl.BUTTON, repeat),
                field("major", "educationalBackground.graduateSchools.0.majors.0", FormControl.TEXT, repeat),
                field("major-field", "educationalBackground.graduateSchools.0.majors.0.majorField", FormControl.BUTTON, repeat)
            ), "educationgraduateschool"))))
            .containsExactly(new Match("military", "military.military.militaryStatus"),
                new Match("disability", "disability.disability.disabilityStatus"),
                new Match("veteran", "veteran.veteran.veteranStatus"),
                new Match("start", "education.graduateSchool.startDate"),
                new Match("degree", "education.graduateSchool.degreeLevel"),
                new Match("major", "education.graduateSchool.majorName"),
                new Match("major-field", "education.graduateSchool.majorField"));
    }

    @Test
    void rejectsTopLevelIdentityPlacedInsideAnUngroupedItem() {
        assertThat(resolve(List.of(), List.of(new Item("unknown", List.of(
            field("email", "basicInformation.email", FormControl.TEXT, null))))))
            .containsExactly(new NoMatch("email"));
    }

    @Test
    void rejectsWrongControlAndUnverifiedMajor() {
        var repeat = new RepeatContext("educationuniversity", 0, 1);
        assertThat(resolve(List.of(field("top", "educationalBackground.universities.0.schoolName", FormControl.TEXT, repeat)), List.of(
            new Item("u0", List.of(field("control", "educationalBackground.universities.0.schoolName", FormControl.BUTTON, repeat),
                field("major", "educationalBackground.universities.0.majors.4", FormControl.TEXT, repeat),
                field("base", "basicInformation.email", FormControl.TEXT, repeat)), "educationuniversity"))))
            .containsExactly(new NoMatch("top"), new NoMatch("control"), new NoMatch("major"), new NoMatch("base"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"supported", "empty", "omitted", "other-command"})
    void usesCalendarOnlyWhenClientSupportsItAndKeepsGreetingSearch(String capability) {
        var doc = GreetingCompanyFormPolicyFactory.create();
        var policy = CompanyFormPolicy.create(doc.companyKey(), doc.version(), doc.preparationFingerprint(),
            doc.fieldsFingerprint(), doc.actionRules(), doc.fieldRules(), new SupportedProfileFields()::contains);
        var router = new com.careerform.formanalysis.application.FormAnalysisRouter((host, path) ->
            new com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available(policy));
        var service = new com.careerform.formanalysis.application.FieldsAnalysisService(java.util.Optional.empty(),
            router, new com.careerform.formanalysis.application.FieldInteractionPolicy(), new SupportedProfileFields());
        var request = new FieldsAnalysisRequest(2, "snapshot", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, List.of(
                field("name", "basicInformation.name", FormControl.TEXT, null),
                field("phone", "basicInformation.phoneNumber.nationalNumber", FormControl.TEXT, null),
                field("birth", "basicInformation.birthdate", FormControl.BUTTON, null)
            ), List.of(new Item("u0", List.of(field("school", "educationalBackground.universities.0.schoolName",
                FormControl.TEXT, new RepeatContext("educationuniversity", 0, 1))), "educationuniversity")))));
        List<WriteCommand> commands = switch (capability) {
            case "supported" -> List.of(WriteCommand.SELECT_DATE);
            case "omitted" -> null;
            case "other-command" -> List.of(WriteCommand.SEARCH_SELECTION);
            default -> List.of();
        };
        var response = service.analyze(new FieldsAnalysisRequest(request.schemaVersion(), request.snapshotId(),
            request.site(), request.sections(), commands, null), true);
        var birth = (MatchedFieldAnalysis) response.fields().stream()
            .filter(result -> result.candidateId().equals("birth")).findFirst().orElseThrow();
        if (capability.equals("supported")) {
            assertThat(birth.interactionStatus()).isEqualTo(InteractionStatus.READY);
            assertThat(birth.writePlan().command()).isEqualTo(WriteCommand.SELECT_DATE);
        } else {
            assertThat(birth.interactionStatus()).isEqualTo(InteractionStatus.UNVERIFIED);
            assertThat(birth.writePlan()).isNull();
        }
        assertThat(response.fields()).filteredOn(result -> result.candidateId().equals("school"))
            .extracting(result -> ((MatchedFieldAnalysis) result).writePlan().command())
            .containsExactly(WriteCommand.SEARCH_SELECTION);
    }

    // Names/options are verified against public deployed Greeting JS; installed DOM remains a separate smoke check.
    @Test
    void mapsConditionalDetailsOnlyByExactNamesAndControls() {
        String prefix = "militaryServicePreferentialEmploymentStatus.";
        assertThat(resolve(List.of(
            field("start", prefix + "militaryService.servicePeriod.startDate", FormControl.BUTTON, null),
            field("end", prefix + "militaryService.servicePeriod.endDate", FormControl.BUTTON, null),
            field("number", prefix + "veteranStatus.veteransRegistrationNumber", FormControl.TEXT, null),
            field("wrong", prefix + "veteran.veteransRegistrationNumber", FormControl.TEXT, null),
            field("control", prefix + "militaryService.branchOfService", FormControl.TEXT, null)), null))
            .containsExactly(new Match("start", "military.military.serviceStartDate"),
                new Match("end", "military.military.serviceEndDate"),
                new Match("number", "veteran.veteran.veteranNumber"), new NoMatch("wrong"), new NoMatch("control"));
    }

    @Test
    void conditionalMenusUseOnlyVerifiedSemanticLabels() {
        String prefix = "militaryServicePreferentialEmploymentStatus.";
        var results = resolve(List.of(
            field("branch", prefix + "militaryService.branchOfService", FormControl.BUTTON, null),
            field("rank", prefix + "militaryService.rank", FormControl.BUTTON, null),
            field("grade", prefix + "disability.degreeOfDisability", FormControl.BUTTON, null),
            field("type", prefix + "disability.descriptionOfDisability", FormControl.BUTTON, null)), null);
        assertThat(results).allMatch(Match.class::isInstance);
        var branch = (LookupBinding) ((Match) results.get(0)).valueBinding();
        assertThat(branch.profileFieldKey()).isEqualTo("military.military.militaryBranch");
        assertThat(branch.optionMap()).containsEntry("해병대", "해병").containsEntry("전투경찰", "전경")
            .containsEntry("해양경찰", "해경").containsEntry("의무경찰", "의경");
        var rank = (LookupBinding) ((Match) results.get(1)).valueBinding();
        assertThat(rank.optionMap()).containsEntry("병장", "병장").doesNotContainKey("unknown-rank");
        var grade = (LookupBinding) ((Match) results.get(2)).valueBinding();
        assertThat(grade.optionMap()).containsEntry("중증", "중증(심한장애)")
            .containsEntry("경증", "경증(심하지 않은 장애)").doesNotContainKeys("1급", "2급", "3급", "4급", "5급", "6급");
        var type = (LookupBinding) ((Match) results.get(3)).valueBinding();
        assertThat(type.optionMap()).containsEntry("지체장애", "지체장애")
            .doesNotContainKey("알 수 없는 장애");
    }

    @Test
    void militaryMonthDatesUseGreetingCalendarCommandAndPreserveVisibilityGuard() {
        var interaction = new com.careerform.formanalysis.application.FieldInteractionPolicy();
        for (String edge : List.of("start", "end")) {
            var candidate = field(edge, "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod."
                + edge + "Date", FormControl.BUTTON, null);
            var mapping = resolve(List.of(candidate), null).getFirst();
            assertThat(interaction.evaluateGreeting(candidate, mapping, List.of(WriteCommand.SELECT_DATE)).writePlan().command())
                .isEqualTo(com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SELECT_DATE);
            var hidden = new FieldCandidate(edge, FormElement.INPUT, FormControl.BUTTON, Visibility.HIDDEN,
                null, null, candidate.domName(), null, null, null, null, null, null);
            assertThat(interaction.evaluateGreeting(hidden, mapping, List.of(WriteCommand.SELECT_DATE)).interactionStatus())
                .isEqualTo(com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus.MANUAL_REVEAL_REQUIRED);
        }
    }

    @Test
    void mapsOnlyGraduateSecondMajorToExistingAdditionalMajorProfileFields() {
        var repeat = new RepeatContext("educationgraduateschool", 1, 2);
        var major = field("name", "educationalBackground.graduateSchools.1.majors.1", FormControl.TEXT, repeat);
        var results = resolve(List.of(), List.of(new Item("g1", List.of(
            major,
            field("classification", "educationalBackground.graduateSchools.1.majors.1.majorClassification", FormControl.BUTTON, repeat),
            field("field", "educationalBackground.graduateSchools.1.majors.1.majorField", FormControl.BUTTON, repeat),
            field("third", "educationalBackground.graduateSchools.1.majors.2", FormControl.TEXT, repeat),
            field("wrong-row", "educationalBackground.graduateSchools.0.majors.1", FormControl.TEXT, repeat)
        ), "educationgraduateschool"), new Item("u0", List.of(
            field("university", "educationalBackground.universities.0.majors.1", FormControl.TEXT,
                new RepeatContext("educationuniversity", 0, 1))), "educationuniversity")));
        assertThat(results).containsExactly(
            new Match("name", "education.graduateSchool.additionalMajorName"),
            new Match("classification", "education.graduateSchool.additionalMajorClassification"),
            new Match("field", "education.graduateSchool.additionalMajorField"),
            new NoMatch("third"), new NoMatch("wrong-row"), new NoMatch("university"));
        assertThat(new com.careerform.formanalysis.application.FieldInteractionPolicy()
            .evaluateGreeting(major, results.getFirst(), List.of()).writePlan().command())
            .isEqualTo(com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SEARCH_SELECTION);
    }

    private List<Result> resolve(List<FieldCandidate> fields, List<Item> items) {
        var doc = GreetingCompanyFormPolicyFactory.create();
        var policy = CompanyFormPolicy.create(doc.companyKey(), doc.version(), doc.preparationFingerprint(),
            doc.fieldsFingerprint(), doc.actionRules(), doc.fieldRules(), new SupportedProfileFields()::contains);
        return new GreetingFieldMappingResolver(policy).resolve(new FieldsAnalysisRequest(2, "snapshot",
            new Site("kakaomobility.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, fields, items)))).results();
    }

    private FieldCandidate field(String id, String name, FormControl control, RepeatContext repeat) {
        return new FieldCandidate(id, FormElement.INPUT, control, Visibility.VISIBLE, null, null, name,
            null, null, null, null, null, repeat == null ? null : new SemanticContext(null, null, null, null,
                null, null, null, repeat));
    }
}

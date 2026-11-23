package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Option;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.AddRepeatableGroupPlan;

/** Hplace v1 resume-form step 2 (education and career cards): section {@code hplace-v1-history}. */
class HplaceV1HistoryPolicyTest {
    private static final String HOST = "synthetic.recruiter.co.kr";
    private static final String PATH = "/v1/applicant/resume-form/*";
    private static final String SECTION = "hplace-v1-history";
    private static final FormControl TEXT = FormControl.TEXT;
    private static final FormControl RADIO = FormControl.RADIO;
    private static final FormControl SELECT = FormControl.SELECT;
    private static final List<String> EMPLOYMENT_TYPE_LABELS = List.of(
        "정규직", "계약직", "파견직", "프리랜서", "개인사업", "병역특례", "인턴", "아르바이트", "기타");

    private final FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
    private final MongoHplacePolicyProvider provider = new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 4);
    private final FormAnalysisRouter router = new FormAnalysisRouter((host, path) -> new NotRegistered(),
        (host, path) -> Decision.NO_POSITIVE_EVIDENCE, Unavailable::new, provider);

    /** group -> field -> control, in design order (32 templates). */
    private static Map<String, Map<String, FormControl>> templates() {
        var education = new LinkedHashMap<String, FormControl>();
        education.put("degreeTypeCode", RADIO);
        education.put("academyName", TEXT);
        education.put("entranceDate", TEXT);
        education.put("graduationDate", TEXT);
        education.put("graduationTypeCode", RADIO);
        education.put("entranceTypeCode", RADIO);
        education.put("score", TEXT);
        education.put("perfectScore", SELECT);
        education.put("major0.majorName", TEXT);
        var highschool = new LinkedHashMap<String, FormControl>();
        highschool.put("graduationTypeCode", RADIO);
        highschool.put("academyName", TEXT);
        highschool.put("locationCode", SELECT);
        highschool.put("dayOrNight", RADIO);
        highschool.put("entranceDate", TEXT);
        highschool.put("graduationDate", TEXT);
        var career = new LinkedHashMap<String, FormControl>();
        career.put("employmentType", SELECT);
        career.put("workingStatus", RADIO);
        career.put("entranceDate", TEXT);
        career.put("leavingDate", TEXT);
        career.put("company", TEXT);
        career.put("department", TEXT);
        career.put("position", TEXT);
        career.put("assignedTask", TEXT);
        var all = new LinkedHashMap<String, Map<String, FormControl>>();
        all.put("highschool", highschool);
        all.put("college", education);
        all.put("graduateSchool", education);
        all.put("career", career);
        return all;
    }

    private static Map<String, ValueBinding> expectedBindings() {
        var regions = new LinkedHashMap<String, String>();
        String[][] pairs = {{"seoul", "서울"}, {"busan", "부산"}, {"daegu", "대구"}, {"incheon", "인천"}, {"gwangju", "광주"},
            {"daejeon", "대전"}, {"ulsan", "울산"}, {"sejong", "세종"}, {"gyeonggi", "경기"}, {"gangwon", "강원"},
            {"chungbuk", "충북"}, {"chungnam", "충남"}, {"jeonbuk", "전북"}, {"jeonnam", "전남"}, {"gyeongbuk", "경북"},
            {"gyeongnam", "경남"}, {"jeju", "제주"}};
        for (String[] pair : pairs) {
            regions.put("region:" + pair[0], pair[1]);
            regions.put(pair[1], pair[1]);
        }
        var expected = new LinkedHashMap<String, ValueBinding>();
        expected.put("highschool.graduationTypeCode", mrs2("highschool.graduationTypeCode"));
        expected.put("highschool.academyName", new DirectBinding("education.highSchool.schoolName"));
        expected.put("highschool.locationCode", new LookupBinding("education.highSchool.schoolRegion", regions));
        expected.put("highschool.dayOrNight", new LookupBinding("education.highSchool.attendanceType",
            Map.of("attendance:day", "주간", "attendance:night", "야간")));
        expected.put("highschool.entranceDate", new DirectBinding("education.highSchool.startDate"));
        expected.put("highschool.graduationDate", new DirectBinding("education.highSchool.endDate"));
        for (String group : List.of("college", "graduateSchool")) {
            String profile = group.equals("college") ? "education.university." : "education.graduateSchool.";
            expected.put(group + ".academyName", new DirectBinding(profile + "schoolName"));
            expected.put(group + ".entranceDate", new DirectBinding(profile + "startDate"));
            expected.put(group + ".graduationDate", new DirectBinding(profile + "endDate"));
            expected.put(group + ".graduationTypeCode", mrs2(group + ".graduationTypeCode"));
            expected.put(group + ".score", new DirectBinding(profile + "gpaScore"));
            expected.put(group + ".perfectScore", mrs2(group + ".perfectScore"));
            expected.put(group + ".major0.majorName", new DirectBinding(profile + "majorName"));
        }
        expected.put("college.degreeTypeCode", new LookupBinding("education.university.degreeLevel",
            Map.of("학사", "학사", "전문학사", "전문학사")));
        expected.put("college.entranceTypeCode", mrs2("college.entranceTypeCode"));
        expected.put("graduateSchool.degreeTypeCode", new LookupBinding("education.graduateSchool.degreeLevel",
            Map.of("석사", "석사", "박사", "박사")));
        expected.put("graduateSchool.entranceTypeCode", new LookupBinding("education.graduateSchool.admissionType",
            Map.of("입학", "입학", "편입", "편입")));
        expected.put("career.employmentType", mrs2("career.careerCriteriaCodeSn"));
        expected.put("career.workingStatus", new LookupBinding("careers.career.employmentStatus",
            Map.of("재직중", "재직중", "퇴직", "퇴사")));
        expected.put("career.entranceDate", new DirectBinding("careers.career.startDate"));
        expected.put("career.leavingDate", new DirectBinding("careers.career.endDate"));
        expected.put("career.company", new DirectBinding("careers.career.companyName"));
        expected.put("career.department", new DirectBinding("careers.career.department"));
        expected.put("career.position", new DirectBinding("careers.career.position"));
        expected.put("career.assignedTask", new DirectBinding("careers.career.responsibilities"));
        return expected;
    }

    @Test
    void everyHistoryTemplateHasItsExactBindingAndWriteCommandAtFirstAndLaterOrdinals() {
        var templates = templates();
        assertThat(templates.values().stream().mapToInt(Map::size).sum()).isEqualTo(32);
        var expected = expectedBindings();
        assertThat(expected).hasSize(32);
        var fields = new ArrayList<FieldCandidate>();
        var bindingByName = new LinkedHashMap<String, ValueBinding>();
        var controlByName = new LinkedHashMap<String, FormControl>();
        var ordinals = Map.of("highschool", List.of(0), "college", List.of(0, 1), "graduateSchool", List.of(0, 9),
            "career", List.of(0, 3));
        templates.forEach((group, fieldControls) -> ordinals.get(group).forEach(i -> fieldControls.forEach((field, control) -> {
            String key = group + "." + i + "." + field;
            fields.add(candidate(key, control));
            bindingByName.put(key, expected.get(group + "." + field));
            controlByName.put(key, control);
        })));
        var response = new FieldsAnalysisService(Optional.empty(), router, new FieldInteractionPolicy(),
            new SupportedProfileFields()).analyze(request(fields));
        assertThat(response.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        Map<String, MatchedFieldAnalysis> mapped = response.fields().stream().filter(MatchedFieldAnalysis.class::isInstance)
            .map(MatchedFieldAnalysis.class::cast).collect(Collectors.toMap(MatchedFieldAnalysis::candidateId, x -> x));
        assertThat(mapped.keySet()).containsExactlyInAnyOrderElementsOf(bindingByName.keySet());
        bindingByName.forEach((key, binding) -> {
            assertThat(binding).as(key).isNotNull();
            assertThat(mapped.get(key).valueBinding()).as(key).isEqualTo(binding);
            var command = switch (controlByName.get(key)) {
                case RADIO -> WriteCommand.CHECK_RADIO;
                case SELECT -> WriteCommand.SELECT_OPTION;
                default -> WriteCommand.SET_TEXT;
            };
            assertThat(mapped.get(key).writePlan().command()).as(key).isEqualTo(command);
        });
        assertThat(mapped.values()).allMatch(field -> field.mappingStatus() == MappingStatus.ADAPTER_VERIFIED
            && field.interactionStatus() == FieldsAnalysisResponse.InteractionStatus.READY);
        verifyNoInteractions(policies);
    }

    @Test
    void reusedMaps() {
        var expected = expectedBindings();
        var hs = ((LookupBinding) expected.get("highschool.graduationTypeCode")).optionMap();
        assertThat(hs).containsEntry("재학중", "재학").containsEntry("졸업예정", "졸업예정").doesNotContainKey("수료");
        assertThat(((LookupBinding) expected.get("college.graduationTypeCode")).optionMap()).containsEntry("수료", "수료");
        assertThat(((LookupBinding) expected.get("college.entranceTypeCode")).optionMap())
            .isEqualTo(Map.of("비해당", "입학", "해당", "편입"));
        assertThat(((LookupBinding) expected.get("college.perfectScore")).optionMap())
            .containsEntry("4.50", "4.5").containsEntry("100.00", "100");
        var employment = ((LookupBinding) expected.get("career.employmentType")).optionMap();
        assertThat(employment).containsEntry("정규", "정규직").containsEntry("계약", "계약직").containsEntry("파견", "파견직");
        assertThat(EMPLOYMENT_TYPE_LABELS).containsAll(employment.values());
        assertThat(((LookupBinding) expected.get("highschool.locationCode")).optionMap()).hasSize(34)
            .doesNotContainKey("region:overseas").doesNotContainKey("해외");
    }

    @Test
    void highschoolLocationResolvesTheLabelThatReachesTheLookupAndTheStoredCode() {
        // The frontend turns a stored region code into its label before the LOOKUP
        // (normalizeProfileOptionValue), so the label must be a key; the code stays a key too.
        var policy = HplaceV1CompanyFormPolicyFactory.create(new SupportedProfileFields()::contains);
        var map = ((LookupBinding) policy.fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("hplace.v1.highschool.0.locationCode"))
            .findFirst().orElseThrow().valueBinding()).optionMap();
        var labels = List.of("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원",
            "충북", "충남", "전북", "전남", "경북", "경남", "제주");
        for (String label : labels) assertThat(map).as(label).containsEntry(label, label);
        assertThat(map).containsEntry("region:seoul", "서울").containsEntry("region:jeju", "제주")
            .containsEntry("region:gyeonggi", "경기");
        assertThat(map.values()).containsOnly(labels.toArray(String[]::new));
        assertThat(map).doesNotContainKey("해외").doesNotContainKey("region:overseas");
    }

    @Test
    void policyCarriesTheExactGeneratedAllowListAndAddActions() {
        CompanyFormPolicy policy = HplaceV1CompanyFormPolicyFactory.create(new SupportedProfileFields()::contains);
        var expectedNames = new HashSet<String>();
        templates().forEach((group, fieldControls) -> {
            int max = group.equals("highschool") ? 0 : 9;
            for (int i = 0; i <= max; i++) for (String field : fieldControls.keySet()) expectedNames.add("hplace.v1." + group + "." + i + "." + field);
        });
        assertThat(expectedNames).hasSize(266);
        Set<String> historyRules = policy.fieldRules().stream().map(FieldRule::structuralName)
            .filter(name -> name.matches("hplace\\.v1\\.(highschool|college|graduateSchool|career)\\..*"))
            .collect(Collectors.toSet());
        assertThat(historyRules).isEqualTo(expectedNames);
        assertThat(policy.fieldRules()).hasSize(22 + 266);
        assertThat(policy.fieldRules()).allMatch(rule -> rule.structuralName().equals(rule.requiredDomName()));
        assertThat(policy.fieldsFingerprint().requiredSectionIds()).containsExactlyInAnyOrder("hplace-v1-basic", SECTION);
        var actionNames = policy.actionRules().stream().flatMap(rule -> rule.structuralNames().stream()).collect(Collectors.toSet());
        assertThat(actionNames).isEqualTo(Set.copyOf(allActionNames()));
        assertThat(policy.actionRules()).allMatch(rule -> rule.kind() == ActionKind.ADD && rule.targetSectionId() == null
            && rule.expectedFieldNames() == null);
    }

    @Test
    void anySubsetOfHistoryFieldsIsAccepted() {
        assertThat(router.route(request(List.of(candidate("career.0.company", TEXT)))).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(request(List.of(candidate("career.4.leavingDate", TEXT)))).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(request(List.of(candidate("college.9.major0.majorName", TEXT),
            candidate("highschool.0.locationCode", SELECT)))).kind()).isEqualTo(RouteKind.ADAPTER);
    }

    @ParameterizedTest
    @ValueSource(strings = {"highschool-1", "college-10", "graduate-10", "career-10", "leading-zero", "wildcard",
        "negative", "credits", "second-major", "category", "college-location", "highschool-major", "basic-name",
        "history-in-basic", "mrs2-name", "control", "element", "select-as-radio", "radio-as-select", "duplicate-name",
        "duplicate-candidate", "disabled", "readonly", "inert", "hidden", "dom-id", "parent", "items", "two-sections",
        "unknown-section", "empty"})
    void malformedHistoryShapesAreStructureMismatches(String change) {
        var fields = new ArrayList<>(List.of(candidate("college.0.score", TEXT), candidate("career.0.workingStatus", RADIO),
            candidate("career.0.employmentType", SELECT)));
        String section = SECTION;
        String parent = null;
        List<FieldsAnalysisRequest.Item> items = null;
        switch (change) {
            case "highschool-1" -> fields.add(candidate("highschool.1.academyName", TEXT));
            case "college-10" -> fields.add(candidate("college.10.score", TEXT));
            case "graduate-10" -> fields.add(candidate("graduateSchool.10.academyName", TEXT));
            case "career-10" -> fields.add(candidate("career.10.company", TEXT));
            case "leading-zero" -> fields.add(candidate("college.01.academyName", TEXT));
            case "wildcard" -> fields.add(candidate("college.*.academyName", TEXT));
            case "negative" -> fields.add(candidate("college.-1.academyName", TEXT));
            case "credits" -> fields.add(candidate("college.0.majorCredits", TEXT));
            case "second-major" -> fields.add(candidate("college.0.major1.majorName", TEXT));
            case "category" -> fields.add(candidate("college.0.collegeCategoryCode", SELECT));
            case "college-location" -> fields.add(candidate("college.0.locationCode", SELECT));
            case "highschool-major" -> fields.add(candidate("highschool.0.major0.majorName", TEXT));
            case "basic-name" -> fields.add(candidate("birthday", TEXT));
            case "history-in-basic" -> section = "hplace-v1-basic";
            case "mrs2-name" -> fields.add(new FieldCandidate("mrs2", FormElement.INPUT, TEXT, Visibility.VISIBLE, null,
                "hplace.mrs2.career.company", "hplace.mrs2.career.company", null, null, null, null, null));
            case "control" -> fields.set(1, candidate("career.0.workingStatus", TEXT));
            case "element" -> fields.set(2, new FieldCandidate("career.0.employmentType", FormElement.INPUT, SELECT,
                Visibility.VISIBLE, null, "hplace.v1.career.0.employmentType", "hplace.v1.career.0.employmentType",
                null, null, null, null, null));
            case "select-as-radio" -> fields.set(2, candidate("career.0.employmentType", RADIO));
            case "radio-as-select" -> fields.set(1, candidate("career.0.workingStatus", SELECT));
            case "duplicate-name" -> fields.add(new FieldCandidate("score-2", FormElement.INPUT, TEXT, Visibility.VISIBLE, null,
                "hplace.v1.college.0.score", "hplace.v1.college.0.score", null, null, null, null, null));
            case "duplicate-candidate" -> fields.add(new FieldCandidate("college.0.score", FormElement.INPUT, TEXT,
                Visibility.VISIBLE, null, "hplace.v1.college.1.score", "hplace.v1.college.1.score", null, null, null, null, null));
            case "disabled" -> fields.set(0, flagged("college.0.score", true, null, null));
            case "readonly" -> fields.set(0, flagged("college.0.score", null, true, null));
            case "inert" -> fields.set(0, flagged("college.0.score", null, null, true));
            case "hidden" -> fields.set(0, new FieldCandidate("college.0.score", FormElement.INPUT, TEXT, Visibility.HIDDEN,
                null, "hplace.v1.college.0.score", "hplace.v1.college.0.score", null, null, null, null, null));
            case "dom-id" -> fields.set(0, new FieldCandidate("college.0.score", FormElement.INPUT, TEXT, Visibility.VISIBLE,
                null, "collegeGroupAnswers.0.collegeGrade.score", "hplace.v1.college.0.score", null, null, null, null, null));
            case "parent" -> parent = "hplace-v1-root";
            case "items" -> items = List.of(new FieldsAnalysisRequest.Item("college", List.of(candidate("college.1.score", TEXT))));
            case "unknown-section" -> section = "hplace-v1-education";
            case "empty" -> fields.clear();
            default -> { }
        }
        var sections = new ArrayList<>(List.of(new Section(section, parent, null, fields, items)));
        if (change.equals("two-sections")) sections.add(new Section("hplace-v1-basic", null, null,
            List.of(new FieldCandidate("birthday", FormElement.INPUT, TEXT, Visibility.VISIBLE, null,
                "hplace.v1.birthday", "hplace.v1.birthday", null, null, null, null, null)), null));
        assertThat(router.route(new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH), sections)).kind())
            .as(change).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    void historyPreparationAnswersEveryAddActionWithAnAddRepeatableGroupPlan() {
        var names = List.of("hplace.v1.highschool.add", "hplace.v1.college.add", "hplace.v1.graduateSchool.add",
            "hplace.v1.career.add", "hplace.v1.college.0.major.add", "hplace.v1.graduateSchool.9.major.add");
        var actions = names.stream().map(name -> action("c-" + name, name)).toList();
        var request = preparation(List.of(new PreparationAnalysisRequest.Section(SECTION, null, null, actions, null)));
        assertThat(router.route(request).kind()).isEqualTo(RouteKind.ADAPTER);
        var response = new PreparationAnalysisService(Optional.empty(), router).analyze(request);
        assertThat(response.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(response.preparationPlans()).hasSize(6);
        for (int i = 0; i < names.size(); i++) {
            var plan = (AddRepeatableGroupPlan) response.preparationPlans().get(i);
            assertThat(plan.actionCandidateId()).isEqualTo("c-" + names.get(i));
            assertThat(plan.command()).isEqualTo(PreparationAnalysisResponse.Command.ADD_REPEATABLE_GROUP);
            assertThat(plan.expectedEffect()).isEqualTo(PreparationAnalysisResponse.ExpectedEffect.GROUP_COUNT_INCREMENT);
            assertThat(plan.expectedFieldNames()).isNull();
        }
        // Every allowed action name is answered, one request at a time.
        for (String name : allActionNames()) {
            var single = preparation(List.of(new PreparationAnalysisRequest.Section(SECTION, null, null, List.of(action("a", name)), null)));
            var plans = new PreparationAnalysisService(Optional.empty(), router).analyze(single).preparationPlans();
            assertThat(plans).as(name).hasSize(1).allMatch(AddRepeatableGroupPlan.class::isInstance);
        }
        verifyNoInteractions(policies);
    }

    @Test
    void historyPreparationWithoutActionsIsAcceptedWithoutPlans() {
        var request = preparation(List.of(new PreparationAnalysisRequest.Section(SECTION, null, null, List.of(), null)));
        assertThat(router.route(request).kind()).isEqualTo(RouteKind.ADAPTER);
        var response = new PreparationAnalysisService(Optional.empty(), router).analyze(request);
        assertThat(response.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(response.preparationPlans()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"unknown-action", "highschool-major", "career-major", "college-10-major", "college-add-indexed",
        "field-name", "duplicate-action", "dom-id", "no-dom-name", "disabled", "readonly", "inert", "hidden",
        "input-button", "select", "items", "parent", "two-sections", "history-action-in-basic", "unknown-section"})
    void malformedHistoryPreparationsAreStructureMismatches(String change) {
        var actions = new ArrayList<>(List.of(action("c1", "hplace.v1.college.add"), action("c2", "hplace.v1.career.add")));
        String section = SECTION;
        String parent = null;
        List<PreparationAnalysisRequest.Item> items = null;
        var site = new PreparationAnalysisRequest.Site(HOST, PATH);
        switch (change) {
            case "unknown-action" -> actions.add(action("x", "hplace.v1.project.add"));
            case "highschool-major" -> actions.add(action("x", "hplace.v1.highschool.0.major.add"));
            case "career-major" -> actions.add(action("x", "hplace.v1.career.0.major.add"));
            case "college-10-major" -> actions.add(action("x", "hplace.v1.college.10.major.add"));
            case "college-add-indexed" -> actions.add(action("x", "hplace.v1.college.0.add"));
            case "field-name" -> actions.add(action("x", "hplace.v1.college.0.score"));
            case "duplicate-action" -> actions.add(action("x", "hplace.v1.college.add"));
            case "dom-id" -> actions.add(new ActionCandidate("x", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "button-1", "hplace.v1.graduateSchool.add", null, null, null));
            case "no-dom-name" -> actions.add(new ActionCandidate("x", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE,
                "hplace.v1.graduateSchool.add", "hplace.v1.graduateSchool.add", null, null, null, null));
            case "disabled" -> actions.set(0, flaggedAction("hplace.v1.college.add", true, null, null));
            case "readonly" -> actions.set(0, flaggedAction("hplace.v1.college.add", null, true, null));
            case "inert" -> actions.set(0, flaggedAction("hplace.v1.college.add", null, null, true));
            case "hidden" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.HIDDEN, null,
                "hplace.v1.college.add", "hplace.v1.college.add", null, null, null));
            case "input-button" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.INPUT,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "hplace.v1.college.add", "hplace.v1.college.add", null, null, null));
            case "select" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.SELECT,
                PreparationAnalysisRequest.FormControl.SELECT, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "hplace.v1.college.add", "hplace.v1.college.add", null, null, null));
            case "items" -> items = List.of(new PreparationAnalysisRequest.Item("college", List.of(action("x", "hplace.v1.college.0.major.add"))));
            case "parent" -> parent = "hplace-v1-root";
            case "history-action-in-basic" -> section = "hplace-v1-basic";
            case "unknown-section" -> section = "hplace-v1-education";
            default -> { }
        }
        var sections = new ArrayList<>(List.of(new PreparationAnalysisRequest.Section(section, parent, null, actions, items)));
        if (change.equals("two-sections")) sections.add(new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(), null));
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, sections)).kind())
            .as(change).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    void storedMrs2DocumentsCarryNoV1HistoryRuleOrSection() throws Exception {
        try (var stream = getClass().getResourceAsStream("/policies/hplace-mrs2-v4.json")) {
            String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(json).doesNotContain("hplace.v1.").doesNotContain("hplace-v1-");
        }
        for (var document : List.of(HplaceCompanyFormPolicyFactory.create(), HplaceCompanyFormPolicyFactory.createNative())) {
            assertThat(document.fieldRules()).noneMatch(rule -> rule.structuralName().startsWith("hplace.v1.")
                || rule.requiredDomName() != null && rule.requiredDomName().startsWith("hplace.v1."));
            assertThat(document.actionRules()).noneMatch(rule -> rule.structuralNames().stream().anyMatch(n -> n.startsWith("hplace.v1.")));
            assertThat(document.fieldsFingerprint().requiredSectionIds()).noneMatch(id -> id.startsWith("hplace-v1-"));
        }
    }

    private static List<String> allActionNames() {
        var names = new ArrayList<>(List.of("hplace.v1.highschool.add", "hplace.v1.college.add",
            "hplace.v1.graduateSchool.add", "hplace.v1.career.add"));
        for (String group : List.of("college", "graduateSchool")) {
            for (int i = 0; i <= 9; i++) names.add("hplace.v1." + group + "." + i + ".major.add");
        }
        // The 경력기술서 and 포트폴리오 rows' own 추가하기 (CF-509).
        names.addAll(List.of("hplace.v1.careerDescription.add", "hplace.v1.portfolio.add"));
        return names;
    }

    private static ValueBinding mrs2(String key) {
        String name = "hplace.mrs2." + key;
        return HplaceCompanyFormPolicyFactory.createNative().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals(name)).findFirst().orElseThrow().valueBinding();
    }

    private static FieldsAnalysisRequest request(List<FieldCandidate> fields) {
        return new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH), List.of(new Section(SECTION, null, null, fields, null)));
    }

    private static PreparationAnalysisRequest preparation(List<PreparationAnalysisRequest.Section> sections) {
        return new PreparationAnalysisRequest(2, "prep", new PreparationAnalysisRequest.Site(HOST, PATH), sections);
    }

    private static FieldCandidate candidate(String key, FormControl control) {
        var element = control == SELECT ? FormElement.SELECT : FormElement.INPUT;
        var options = control == TEXT ? null : List.of(new Option("a", "a"), new Option("b", "b"));
        return new FieldCandidate(key, element, control, Visibility.VISIBLE, null,
            "hplace.v1." + key, "hplace.v1." + key, null, null, null, null, options);
    }

    private static FieldCandidate flagged(String key, Boolean disabled, Boolean readonly, Boolean inert) {
        return new FieldCandidate(key, FormElement.INPUT, TEXT, Visibility.VISIBLE, null,
            "hplace.v1." + key, "hplace.v1." + key, null, disabled, readonly, inert, null);
    }

    private static ActionCandidate action(String id, String name) {
        return new ActionCandidate(id, PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON,
            PreparationAnalysisRequest.Visibility.VISIBLE, null, name, name, null, null, null);
    }

    private static ActionCandidate flaggedAction(String name, Boolean disabled, Boolean readonly, Boolean inert) {
        return new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON,
            PreparationAnalysisRequest.Visibility.VISIBLE, null, name, name, disabled, readonly, inert);
    }
}

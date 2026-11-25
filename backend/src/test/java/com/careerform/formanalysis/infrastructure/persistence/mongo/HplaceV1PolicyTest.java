package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
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
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;

class HplaceV1PolicyTest {
    private static final String HOST = "synthetic.recruiter.co.kr";
    private static final String PATH = "/v1/applicant/resume-form/*";
    private static final List<String> TEXTS = List.of("englishName.familyFirst", "birthday", "emergencyPhone",
        "serviceStartDate", "serviceEndDate", "militarySpecialty", "disabilityRegistrationNumber", "veteranNumber",
        "postalCode", "addressLine1", "addressLine2");
    private static final List<String> RADIOS = List.of("gender", "militaryStatus", "disabilityStatus", "veteranStatus");
    private static final List<String> SELECTS = List.of("militaryRank", "dischargeType", "militaryBranch",
        "disabilityGrade", "disabilityType", "veteranRelation", "nationality");

    private final FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
    private final MongoHplacePolicyProvider provider = new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 4);
    private final FormAnalysisRouter router = new FormAnalysisRouter((host, path) -> new NotRegistered(),
        (host, path) -> Decision.NO_POSITIVE_EVIDENCE, Unavailable::new, provider);

    @Test
    void resumeFormStepOneRoutesToTheInCodeV1PolicyWithoutStoredDocuments() {
        var route = router.route(request(allFields()));
        assertThat(route.kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(route.executionPolicy()).isNull();
        assertThat(router.routeGeneric(HOST, PATH)).isEqualTo(GenericRouteKind.STATIC_POLICY_PRESENT);
        var prep = new PreparationAnalysisService(Optional.empty(), router).analyze(new PreparationAnalysisRequest(2, "prep",
            new PreparationAnalysisRequest.Site(HOST, PATH), List.of(
                new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(), null))));
        assertThat(prep.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(prep.preparationPlans()).isEmpty();
        verifyNoInteractions(policies);
    }

    @Test
    void everyContractRowHasItsExactBindingAndWriteCommand() {
        var response = new FieldsAnalysisService(Optional.empty(), router, new FieldInteractionPolicy(),
            new SupportedProfileFields()).analyze(request(allFields()));
        assertThat(response.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        Map<String, MatchedFieldAnalysis> mapped = response.fields().stream().filter(MatchedFieldAnalysis.class::isInstance)
            .map(MatchedFieldAnalysis.class::cast).collect(Collectors.toMap(MatchedFieldAnalysis::candidateId, x -> x));
        assertThat(mapped.keySet()).containsExactlyInAnyOrderElementsOf(allKeys());
        var expected = new java.util.HashMap<String, ValueBinding>();
        expected.put("englishName.familyFirst", new DerivedBinding(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST));
        expected.put("birthday", new DirectBinding("personal.personal.birthDate"));
        expected.put("gender", new LookupBinding("personal.personal.gender", Map.of("남성", "남", "여성", "여")));
        expected.put("emergencyPhone", new DirectBinding("contact.contact.emergencyPhoneNumber"));
        expected.put("militaryStatus", new LookupBinding("military.military.militaryStatus",
            identity("비대상", "군필", "미필", "면제", "복무중")));
        expected.put("serviceStartDate", new DirectBinding("military.military.serviceStartDate"));
        expected.put("serviceEndDate", new DirectBinding("military.military.serviceEndDate"));
        expected.put("militarySpecialty", new DirectBinding("military.military.militarySpecialty"));
        expected.put("militaryRank", mrs2("militaryRank"));
        expected.put("dischargeType", mrs2("dischargeType"));
        expected.put("militaryBranch", new LookupBinding("military.military.militaryBranch", Map.of(
            "육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병", "전투경찰", "전경",
            "해양경찰", "해경", "의무경찰", "의경", "의무소방", "의무소방")));
        expected.put("disabilityStatus", new DerivedBinding(DerivedRecipe.BOOLEAN_YN,
            "disability.disability.disabilityStatus", "대상", "비대상"));
        expected.put("disabilityRegistrationNumber", new DirectBinding("disability.disability.disabilityRegistrationNumber"));
        expected.put("disabilityGrade", mrs2("disabilityGrade"));
        expected.put("disabilityType", mrs2("disabilityType"));
        expected.put("veteranStatus", new DerivedBinding(DerivedRecipe.BOOLEAN_YN, "veteran.veteran.veteranStatus", "대상", "비대상"));
        expected.put("veteranNumber", new DirectBinding("veteran.veteran.veteranNumber"));
        expected.put("veteranRelation", new LookupBinding("veteran.veteran.veteranRelation",
            identity("부", "모", "조부", "조모", "외조부", "외조모", "형제", "자매", "남매", "배우자", "자녀")));
        expected.put("nationality", new LookupBinding("personal.personal.nationality", Map.of("대한민국", "대한민국")));
        // Current address: written through the site's address dialog with the MRS2 address keys.
        expected.put("postalCode", new DirectBinding("contact.contact.postalCode"));
        expected.put("addressLine1", new DirectBinding("contact.contact.addressLine1"));
        expected.put("addressLine2", new DirectBinding("contact.contact.addressLine2"));
        assertThat(expected).hasSize(22);
        expected.forEach((key, binding) -> assertThat(mapped.get(key).valueBinding()).as(key).isEqualTo(binding));
        // The MRS2 lists stay the reference for the shared choices.
        assertThat(((LookupBinding) mapped.get("militaryRank").valueBinding()).optionMap()).hasSize(21).containsEntry("병장", "병장");
        assertThat(((LookupBinding) mapped.get("dischargeType").valueBinding()).optionMap()).hasSize(6).containsEntry("만기제대", "만기제대");
        assertThat(((LookupBinding) mapped.get("disabilityGrade").valueBinding()).optionMap()).containsEntry("중증", "심한 장애인");
        assertThat(((LookupBinding) mapped.get("disabilityType").valueBinding()).optionMap()).containsEntry("안면장애", "안면변형장애");
        assertThat(mapped.get("englishName.familyFirst").valueBinding()).isEqualTo(
            nativeRule("hplace.detail.englishName.familyFirst").valueBinding());
        for (String key : TEXTS) assertThat(mapped.get(key).writePlan().command()).as(key).isEqualTo(WriteCommand.SET_TEXT);
        for (String key : RADIOS) assertThat(mapped.get(key).writePlan().command()).as(key).isEqualTo(WriteCommand.CHECK_RADIO);
        for (String key : SELECTS) assertThat(mapped.get(key).writePlan().command()).as(key).isEqualTo(WriteCommand.SELECT_OPTION);
        assertThat(mapped.values()).allMatch(field -> field.mappingStatus() == MappingStatus.ADAPTER_VERIFIED
            && field.interactionStatus() == FieldsAnalysisResponse.InteractionStatus.READY);
    }

    @Test
    void anySubsetOfAllowedFieldsIsAccepted() {
        assertThat(router.route(request(List.of(text("birthday")))).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(request(List.of(text("postalCode"), text("addressLine1"), text("addressLine2")))).kind())
            .isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(request(List.of(radio("militaryStatus"), select("militaryBranch")))).kind())
            .isEqualTo(RouteKind.ADAPTER);
    }

    @ParameterizedTest
    @ValueSource(strings = {"section-id", "detail-section", "unknown-name", "mrs2-name", "control", "element",
        "duplicate-name", "duplicate-candidate", "readonly", "disabled", "inert", "hidden", "dom-id", "parent", "items",
        "two-sections", "empty"})
    void malformedResumeFormShapesAreStructureMismatches(String change) {
        var fields = new ArrayList<>(List.of(text("birthday"), radio("gender"), select("nationality")));
        String section = "hplace-v1-basic";
        String parent = null;
        List<FieldsAnalysisRequest.Item> items = null;
        switch (change) {
            case "section-id" -> section = "hplace-v1-other";
            case "detail-section" -> section = "hplace-detail-basic";
            case "unknown-name" -> fields.add(text("homePhone"));
            case "mrs2-name" -> fields.add(new FieldCandidate("mrs2", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
                null, "hplace.detail.birthday", "hplace.detail.birthday", null, null, null, null, null));
            case "control" -> fields.set(1, candidate("gender", FormElement.INPUT, FormControl.TEXT, null, null, null));
            case "element" -> fields.set(2, candidate("nationality", FormElement.INPUT, FormControl.SELECT, null, null, null));
            case "duplicate-name" -> fields.add(new FieldCandidate("birthday-2", FormElement.INPUT, FormControl.TEXT,
                Visibility.VISIBLE, null, "hplace.v1.birthday", "hplace.v1.birthday", null, null, null, null, null));
            case "duplicate-candidate" -> fields.add(new FieldCandidate("birthday", FormElement.INPUT, FormControl.TEXT,
                Visibility.VISIBLE, null, "hplace.v1.veteranNumber", "hplace.v1.veteranNumber", null, null, null, null, null));
            case "readonly" -> fields.set(0, candidate("birthday", FormElement.INPUT, FormControl.TEXT, null, true, null));
            case "disabled" -> fields.set(0, candidate("birthday", FormElement.INPUT, FormControl.TEXT, true, null, null));
            case "inert" -> fields.set(0, candidate("birthday", FormElement.INPUT, FormControl.TEXT, null, null, true));
            case "hidden" -> fields.set(0, new FieldCandidate("birthday", FormElement.INPUT, FormControl.TEXT, Visibility.HIDDEN,
                null, "hplace.v1.birthday", "hplace.v1.birthday", null, null, null, null, null));
            case "dom-id" -> fields.set(0, new FieldCandidate("birthday", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
                null, "birthday", "hplace.v1.birthday", null, null, null, null, null));
            case "parent" -> parent = "hplace-v1-root";
            case "items" -> items = List.of(new FieldsAnalysisRequest.Item("row", List.of(text("veteranNumber"))));
            case "empty" -> fields.clear();
            default -> { }
        }
        var sections = new ArrayList<>(List.of(new Section(section, parent, null, fields, items)));
        if (change.equals("two-sections")) sections.add(new Section("hplace-v1-extra", null, null, List.of(text("veteranNumber")), null));
        var request = new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH), sections);
        assertThat(router.route(request).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    void basicPreparationAcceptsNoActionsAndOnlyHistoryAddsAreAccepted() {
        var site = new PreparationAnalysisRequest.Site(HOST, PATH);
        var action = new PreparationAnalysisRequest.ActionCandidate("next", PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE,
            null, null, null, null, null, null);
        var add = new PreparationAnalysisRequest.ActionCandidate("add", PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE,
            null, "hplace.v1.career.add", "hplace.v1.career.add", null, null, null);
        // Step 1 still accepts no action at all, not even a history add.
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(action), null)))).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(add), null)))).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-detail-basic", null, null, List.of(), null)))).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        // Step 2: exact add names are accepted, anything else is not.
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-v1-history", null, null, List.of(add), null)))).kind())
            .isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-v1-history", null, null, List.of(action), null)))).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-v1-history", null, null, List.of(add), null),
            new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(), null)))).kind())
            .isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/v1/applicant", "/v1/applicant/login", "/v1/applicant/resume-form", "/v1/applicant/resume-form/",
        "/v1/applicant/resume-form/*/preview", "/v1/applicant/resume-forms/*", "/v1/applicant/resume/*"})
    void otherV1PagesStayUnavailable(String path) {
        var fields = new FieldsAnalysisRequest(2, "fields", new Site(HOST, path), request(allFields()).sections());
        assertThat(router.route(fields).kind()).isEqualTo(RouteKind.POLICY_UNAVAILABLE);
        assertThat(router.routeGeneric(HOST, path)).isEqualTo(GenericRouteKind.POLICY_UNAVAILABLE);
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", new PreparationAnalysisRequest.Site(HOST, path),
            List.of(new PreparationAnalysisRequest.Section("hplace-v1-basic", null, null, List.of(), null)))).kind())
            .isEqualTo(RouteKind.POLICY_UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"synthetic.recruiter.co.kr.attacker.test", "recruiter.co.kr", "nested.synthetic.recruiter.co.kr"})
    void nonSupplierHostsNeverReceiveV1Bindings(String host) {
        var fields = new FieldsAnalysisRequest(2, "fields", new Site(host, PATH), request(allFields()).sections());
        assertThat(router.route(fields).kind()).isEqualTo(RouteKind.GENERIC);
    }

    @Test
    void v1SectionIsNotAcceptedOnTheMrs2Page() {
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.createNative()));
        var detail = new FieldsAnalysisRequest(2, "fields", new Site(HOST, "/mrs2/applicant/resume/writeResume"),
            request(allFields()).sections());
        assertThat(router.route(detail).kind()).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    void storedMrs2PoliciesCarryNoV1Rule() {
        assertThat(HplaceCompanyFormPolicyFactory.create().fieldRules()).noneMatch(HplaceV1PolicyTest::isV1Rule);
        assertThat(HplaceCompanyFormPolicyFactory.createNative().fieldRules()).noneMatch(HplaceV1PolicyTest::isV1Rule);
        assertThat(HplaceCompanyFormPolicyFactory.create().fieldRules()).hasSize(20);
        assertThat(HplaceCompanyFormPolicyFactory.createNative().actionRules())
            .noneMatch(rule -> rule.structuralNames().stream().anyMatch(name -> name.startsWith("hplace.v1.")));
    }

    @Test
    void mrs2RouteStillUsesTheStoredPolicy() {
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.createNative()));
        var detail = new FieldsAnalysisRequest(2, "fields", new Site(HOST, "/mrs2/applicant/resume/writeResume"),
            List.of(new Section("hplace-detail-basic", null, null, List.of(new FieldCandidate("birthday", FormElement.INPUT,
                FormControl.TEXT, Visibility.VISIBLE, null, "hplace.detail.birthday", "hplace.detail.birthday",
                null, null, null, null, null)), null)));
        var route = router.route(detail);
        assertThat(route.kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(route.executionPolicy()).isNotNull();
        org.mockito.Mockito.verify(policies).findByCompanyKeyAndVersion("hplace", 4);
    }

    private static boolean isV1Rule(FieldRule rule) {
        return rule.structuralName().startsWith("hplace.v1.")
            || rule.requiredDomName() != null && rule.requiredDomName().startsWith("hplace.v1.");
    }

    private static ValueBinding mrs2(String key) {
        return HplaceCompanyFormPolicyFactory.create().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("hplace.detail." + key)).findFirst().orElseThrow().valueBinding();
    }

    private static FieldRule nativeRule(String name) {
        return HplaceCompanyFormPolicyFactory.createNative().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals(name)).findFirst().orElseThrow();
    }

    private static List<String> allKeys() {
        var keys = new ArrayList<>(TEXTS);
        keys.addAll(RADIOS);
        keys.addAll(SELECTS);
        return keys;
    }

    private static List<FieldCandidate> allFields() {
        var fields = new ArrayList<FieldCandidate>();
        TEXTS.forEach(key -> fields.add(text(key)));
        RADIOS.forEach(key -> fields.add(radio(key)));
        SELECTS.forEach(key -> fields.add(select(key)));
        return fields;
    }

    private static FieldsAnalysisRequest request(List<FieldCandidate> fields) {
        return new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH),
            List.of(new Section("hplace-v1-basic", null, null, fields, null)));
    }

    private static FieldCandidate text(String key) {
        return candidate(key, FormElement.INPUT, FormControl.TEXT, null, null, null);
    }

    private static FieldCandidate radio(String key) {
        var options = switch (key) {
            case "gender" -> List.of(new Option("M", "남"), new Option("F", "여"));
            case "militaryStatus" -> List.of("비대상", "군필", "미필", "면제", "복무중").stream().map(v -> new Option(v, v)).toList();
            default -> List.of(new Option("비대상", "비대상"), new Option("대상", "대상"));
        };
        return new FieldCandidate(key, FormElement.INPUT, FormControl.RADIO, Visibility.VISIBLE, null,
            "hplace.v1." + key, "hplace.v1." + key, null, null, null, null, options);
    }

    private static FieldCandidate select(String key) {
        return new FieldCandidate(key, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, null,
            "hplace.v1." + key, "hplace.v1." + key, null, null, null, null, List.of(new Option("01", "대한민국")));
    }

    private static FieldCandidate candidate(String key, FormElement element, FormControl control,
        Boolean disabled, Boolean readonly, Boolean inert) {
        return new FieldCandidate(key, element, control, Visibility.VISIBLE, null,
            "hplace.v1." + key, "hplace.v1." + key, null, disabled, readonly, inert, null);
    }

    private static Map<String, String> identity(String... values) {
        return java.util.Arrays.stream(values).collect(Collectors.toUnmodifiableMap(v -> v, v -> v));
    }
}

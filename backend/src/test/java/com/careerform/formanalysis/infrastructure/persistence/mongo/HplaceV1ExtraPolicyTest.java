package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

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
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.AddRepeatableGroupPlan;

/** Hplace v1 resume-form step 3 (어학/자격/기타: 자격증 and 외국어활용능력 rows): section {@code hplace-v1-extra}. */
class HplaceV1ExtraPolicyTest {
    private static final String HOST = "synthetic.recruiter.co.kr";
    private static final String PATH = "/v1/applicant/resume-form/*";
    private static final String SECTION = "hplace-v1-extra";
    private static final FormControl TEXT = FormControl.TEXT;
    private static final FormControl SELECT = FormControl.SELECT;
    /** The measured 외국어활용능력 language options after 선택안함 (step3-probe-f.json, first 30 rows). */
    static final List<String> LANGUAGE_LABELS = List.of("영어", "일본어", "중국어", "프랑스어", "독일어", "스페인어",
        "포르투갈어", "이탈리아어", "네덜란드어", "아랍어", "말레이시아어", "인도네시아어", "베트남어", "인도어", "태국어",
        "러시아어", "이란어", "터키어", "핀란드어", "노르웨이어", "헝가리어", "덴마크어", "미얀마어", "불가리아어",
        "폴란드어", "방글라데시어", "타직어", "스와힐리어", "키르키즈어");

    private final FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
    private final MongoHplacePolicyProvider provider = new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), 4);
    private final FormAnalysisRouter router = new FormAnalysisRouter((host, path) -> new NotRegistered(),
        (host, path) -> Decision.NO_POSITIVE_EVIDENCE, Unavailable::new, provider);

    /** group -> field -> control: the measured step-3 controls in scope (5 templates). */
    private static Map<String, Map<String, FormControl>> templates() {
        var certificate = new LinkedHashMap<String, FormControl>();
        certificate.put("licenseName", TEXT);
        certificate.put("organization", TEXT);
        certificate.put("acquireDate", TEXT);
        certificate.put("registNumber", TEXT);
        var all = new LinkedHashMap<String, Map<String, FormControl>>();
        all.put("certificate", certificate);
        all.put("languageSkill", Map.of("language", SELECT));
        return all;
    }

    private static Map<String, ValueBinding> expectedBindings() {
        var languages = new LinkedHashMap<String, String>();
        for (String label : LANGUAGE_LABELS) languages.put(label, label);
        var expected = new LinkedHashMap<String, ValueBinding>();
        expected.put("certificate.licenseName", new DirectBinding("certifications.certificate.name"));
        expected.put("certificate.organization", new DirectBinding("certifications.certificate.issuer"));
        expected.put("certificate.acquireDate", new DirectBinding("certifications.certificate.acquisitionDate"));
        expected.put("certificate.registNumber", new DirectBinding("certifications.certificate.registrationNo"));
        expected.put("languageSkill.language", new LookupBinding("languages.languageSkill.language", languages));
        return expected;
    }

    private static final Map<String, AutofillPolicy> POLICIES = Map.of(
        "certificate.licenseName", AutofillPolicy.CONDITIONAL,
        "certificate.organization", AutofillPolicy.CONDITIONAL,
        "certificate.acquireDate", AutofillPolicy.ALLOWED,
        "certificate.registNumber", AutofillPolicy.ALLOWED,
        "languageSkill.language", AutofillPolicy.CONDITIONAL);

    @Test
    void everyExtraTemplateHasItsExactBindingPolicyAndWriteCommandAtFirstAndLastOrdinals() {
        var expected = expectedBindings();
        var fields = new ArrayList<FieldCandidate>();
        var groupField = new LinkedHashMap<String, String>();
        templates().forEach((group, controls) -> List.of(0, 9).forEach(i -> controls.forEach((field, control) -> {
            String key = group + "." + i + "." + field;
            fields.add(candidate(key, control));
            groupField.put(key, group + "." + field);
        })));
        assertThat(fields).hasSize(10);
        var response = new FieldsAnalysisService(Optional.empty(), router, new FieldInteractionPolicy(),
            new SupportedProfileFields()).analyze(request(fields));
        assertThat(response.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(response.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        Map<String, MatchedFieldAnalysis> mapped = response.fields().stream().filter(MatchedFieldAnalysis.class::isInstance)
            .map(MatchedFieldAnalysis.class::cast).collect(Collectors.toMap(MatchedFieldAnalysis::candidateId, x -> x));
        assertThat(mapped.keySet()).containsExactlyInAnyOrderElementsOf(groupField.keySet());
        groupField.forEach((key, template) -> {
            var field = mapped.get(key);
            assertThat(field.valueBinding()).as(key).isEqualTo(expected.get(template));
            assertThat(field.autofillPolicy()).as(key).isEqualTo(POLICIES.get(template));
            assertThat(field.writePlan().command()).as(key)
                .isEqualTo(template.equals("languageSkill.language") ? WriteCommand.SELECT_OPTION : WriteCommand.SET_TEXT);
            assertThat(field.mappingStatus()).as(key).isEqualTo(MappingStatus.ADAPTER_VERIFIED);
            assertThat(field.interactionStatus()).as(key).isEqualTo(FieldsAnalysisResponse.InteractionStatus.READY);
        });
        verifyNoInteractions(policies);
    }

    @Test
    void policyCarriesTheExactGeneratedExtraAllowListAndAddActions() {
        CompanyFormPolicy policy = HplaceV1CompanyFormPolicyFactory.create(new SupportedProfileFields()::contains);
        var expectedNames = new HashSet<String>();
        templates().forEach((group, controls) -> {
            for (int i = 0; i <= 9; i++) for (String field : controls.keySet()) expectedNames.add("hplace.v1." + group + "." + i + "." + field);
        });
        assertThat(expectedNames).hasSize(50);
        Set<String> extraRules = policy.fieldRules().stream().map(FieldRule::structuralName)
            .filter(name -> name.matches("hplace\\.v1\\.(certificate|languageSkill)\\..*")).collect(Collectors.toSet());
        assertThat(extraRules).isEqualTo(expectedNames);
        assertThat(policy.fieldsFingerprint().requiredSectionIds()).contains(SECTION);
        var actionNames = policy.actionRules().stream().flatMap(rule -> rule.structuralNames().stream()).collect(Collectors.toSet());
        assertThat(actionNames).contains("hplace.v1.certificate.add", "hplace.v1.languageSkill.add")
            .noneMatch(name -> name.contains("languageTest") || name.contains("softwareSkill"));
        assertThat(policy.actionRules()).allMatch(rule -> rule.kind() == ActionKind.ADD && rule.targetSectionId() == null);
    }

    @Test
    void anySubsetOfExtraFieldsIsAccepted() {
        assertThat(router.route(request(List.of(candidate("certificate.0.licenseName", TEXT)))).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(router.route(request(List.of(candidate("certificate.3.registNumber", TEXT),
            candidate("languageSkill.9.language", SELECT)))).kind()).isEqualTo(RouteKind.ADAPTER);
    }

    @ParameterizedTest
    @ValueSource(strings = {"certificate-10", "language-10", "leading-zero", "language-test", "language-test-score",
        "software", "award", "conversational", "certificate-grade", "history-name", "history-in-extra-path", "extra-in-history",
        "control", "element", "duplicate-name", "disabled", "readonly", "inert", "hidden", "dom-id", "parent", "items",
        "two-sections", "unknown-section", "empty"})
    void malformedExtraShapesAreStructureMismatches(String change) {
        var fields = new ArrayList<>(List.of(candidate("certificate.0.licenseName", TEXT),
            candidate("languageSkill.0.language", SELECT)));
        String section = SECTION;
        String parent = null;
        List<FieldsAnalysisRequest.Item> items = null;
        switch (change) {
            case "certificate-10" -> fields.add(candidate("certificate.10.licenseName", TEXT));
            case "language-10" -> fields.add(candidate("languageSkill.10.language", SELECT));
            case "leading-zero" -> fields.add(candidate("certificate.01.organization", TEXT));
            case "language-test" -> fields.add(candidate("languageTest.0.examName", TEXT));
            case "language-test-score" -> fields.add(candidate("languageTest.0.score", TEXT));
            case "software" -> fields.add(candidate("softwareSkill.0.softwareName", TEXT));
            case "award" -> fields.add(candidate("award.0.awardName", TEXT));
            case "conversational" -> fields.add(candidate("languageSkill.0.conversationalLevel", SELECT));
            case "certificate-grade" -> fields.add(candidate("certificate.0.grade", TEXT));
            case "history-name" -> fields.add(candidate("career.0.company", TEXT));
            case "history-in-extra-path" -> section = "hplace-v1-history";
            case "extra-in-history" -> {
                section = "hplace-v1-history";
                fields.clear();
                fields.add(candidate("certificate.0.licenseName", TEXT));
            }
            case "control" -> fields.set(1, candidate("languageSkill.0.language", TEXT));
            case "element" -> fields.set(1, new FieldCandidate("languageSkill.0.language", FormElement.INPUT, SELECT,
                Visibility.VISIBLE, null, "hplace.v1.languageSkill.0.language", "hplace.v1.languageSkill.0.language",
                null, null, null, null, null));
            case "duplicate-name" -> fields.add(new FieldCandidate("again", FormElement.INPUT, TEXT, Visibility.VISIBLE, null,
                "hplace.v1.certificate.0.licenseName", "hplace.v1.certificate.0.licenseName", null, null, null, null, null));
            case "disabled" -> fields.set(0, flagged("certificate.0.licenseName", true, null, null));
            case "readonly" -> fields.set(0, flagged("certificate.0.licenseName", null, true, null));
            case "inert" -> fields.set(0, flagged("certificate.0.licenseName", null, null, true));
            case "hidden" -> fields.set(0, new FieldCandidate("certificate.0.licenseName", FormElement.INPUT, TEXT,
                Visibility.HIDDEN, null, "hplace.v1.certificate.0.licenseName", "hplace.v1.certificate.0.licenseName",
                null, null, null, null, null));
            case "dom-id" -> fields.set(0, new FieldCandidate("certificate.0.licenseName", FormElement.INPUT, TEXT,
                Visibility.VISIBLE, null, "licenseGroupAnswer.0", "hplace.v1.certificate.0.licenseName",
                null, null, null, null, null));
            case "parent" -> parent = "hplace-v1-root";
            case "items" -> items = List.of(new FieldsAnalysisRequest.Item("certificate",
                List.of(candidate("certificate.1.licenseName", TEXT))));
            case "unknown-section" -> section = "hplace-v1-language";
            case "empty" -> fields.clear();
            default -> { }
        }
        var sections = new ArrayList<>(List.of(new Section(section, parent, null, fields, items)));
        if (change.equals("two-sections")) sections.add(new Section("hplace-v1-history", null, null,
            List.of(candidate("career.0.company", TEXT)), null));
        assertThat(router.route(new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH), sections)).kind())
            .as(change).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    @Test
    void extraPreparationAnswersEachAddWithAnAddRepeatableGroupPlan() {
        var names = List.of("hplace.v1.certificate.add", "hplace.v1.languageSkill.add");
        var actions = names.stream().map(name -> action("c-" + name, name)).toList();
        var request = preparation(List.of(new PreparationAnalysisRequest.Section(SECTION, null, null, actions, null)));
        assertThat(router.route(request).kind()).isEqualTo(RouteKind.ADAPTER);
        var response = new PreparationAnalysisService(Optional.empty(), router).analyze(request);
        assertThat(response.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(response.preparationPlans()).hasSize(2);
        for (int i = 0; i < names.size(); i++) {
            var plan = (AddRepeatableGroupPlan) response.preparationPlans().get(i);
            assertThat(plan.actionCandidateId()).isEqualTo("c-" + names.get(i));
            assertThat(plan.command()).isEqualTo(PreparationAnalysisResponse.Command.ADD_REPEATABLE_GROUP);
            assertThat(plan.expectedEffect()).isEqualTo(PreparationAnalysisResponse.ExpectedEffect.GROUP_COUNT_INCREMENT);
        }
        var empty = preparation(List.of(new PreparationAnalysisRequest.Section(SECTION, null, null, List.of(), null)));
        assertThat(router.route(empty).kind()).isEqualTo(RouteKind.ADAPTER);
        assertThat(new PreparationAnalysisService(Optional.empty(), router).analyze(empty).preparationPlans()).isEmpty();
        verifyNoInteractions(policies);
    }

    @ParameterizedTest
    @ValueSource(strings = {"language-test-add", "software-add", "award-add", "history-add-in-extra", "extra-add-in-history",
        "indexed", "duplicate", "dom-id", "disabled", "hidden", "select", "items", "parent", "two-sections"})
    void malformedExtraPreparationsAreStructureMismatches(String change) {
        var actions = new ArrayList<>(List.of(action("c1", "hplace.v1.certificate.add")));
        String section = SECTION;
        String parent = null;
        List<PreparationAnalysisRequest.Item> items = null;
        switch (change) {
            case "language-test-add" -> actions.add(action("x", "hplace.v1.languageTest.add"));
            case "software-add" -> actions.add(action("x", "hplace.v1.softwareSkill.add"));
            case "award-add" -> actions.add(action("x", "hplace.v1.award.add"));
            case "history-add-in-extra" -> actions.add(action("x", "hplace.v1.career.add"));
            case "extra-add-in-history" -> section = "hplace-v1-history";
            case "indexed" -> actions.add(action("x", "hplace.v1.certificate.0.add"));
            case "duplicate" -> actions.add(action("x", "hplace.v1.certificate.add"));
            case "dom-id" -> actions.add(new ActionCandidate("x", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "button-1", "hplace.v1.languageSkill.add", null, null, null));
            case "disabled" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "hplace.v1.certificate.add", "hplace.v1.certificate.add", true, null, null));
            case "hidden" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.BUTTON,
                PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.HIDDEN, null,
                "hplace.v1.certificate.add", "hplace.v1.certificate.add", null, null, null));
            case "select" -> actions.set(0, new ActionCandidate("c1", PreparationAnalysisRequest.FormElement.SELECT,
                PreparationAnalysisRequest.FormControl.SELECT, PreparationAnalysisRequest.Visibility.VISIBLE, null,
                "hplace.v1.certificate.add", "hplace.v1.certificate.add", null, null, null));
            case "items" -> items = List.of(new PreparationAnalysisRequest.Item("certificate",
                List.of(action("x", "hplace.v1.languageSkill.add"))));
            case "parent" -> parent = "hplace-v1-root";
            default -> { }
        }
        var sections = new ArrayList<>(List.of(new PreparationAnalysisRequest.Section(section, parent, null, actions, items)));
        if (change.equals("two-sections")) sections.add(new PreparationAnalysisRequest.Section("hplace-v1-history", null, null,
            List.of(action("h", "hplace.v1.career.add")), null));
        assertThat(router.route(new PreparationAnalysisRequest(2, "prep", new PreparationAnalysisRequest.Site(HOST, PATH), sections))
            .kind()).as(change).isEqualTo(RouteKind.STRUCTURE_MISMATCH);
    }

    private static FieldsAnalysisRequest request(List<FieldCandidate> fields) {
        return new FieldsAnalysisRequest(2, "fields", new Site(HOST, PATH), List.of(new Section(SECTION, null, null, fields, null)));
    }

    private static PreparationAnalysisRequest preparation(List<PreparationAnalysisRequest.Section> sections) {
        return new PreparationAnalysisRequest(2, "prep", new PreparationAnalysisRequest.Site(HOST, PATH), sections);
    }

    private static FieldCandidate candidate(String key, FormControl control) {
        var element = control == SELECT ? FormElement.SELECT : FormElement.INPUT;
        var options = control == TEXT ? null : List.of(new Option("영어", "영어"), new Option("일본어", "일본어"));
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
}

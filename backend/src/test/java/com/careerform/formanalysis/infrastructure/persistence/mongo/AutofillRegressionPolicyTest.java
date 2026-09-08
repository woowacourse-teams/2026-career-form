package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyActionResolver;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

class AutofillRegressionPolicyTest {

    @Test
    void preparesOnlyTheExactMilitaryTargetRadioThenTheStatusSelect() {
        var request = new PreparationAnalysisRequest(2, "military-chain",
            new PreparationAnalysisRequest.Site("www.skcareers.com", "/Application/Index/{postingId}"),
            List.of(new PreparationAnalysisRequest.Section("section-1", null, null, List.of(
                radioAction("target", "prsMilitarySvcYN", "대상"),
                radioAction("non-target", "prsMilitarySvcYN", "비대상"),
                radioAction("similar", "otherMilitarySvcYN", "대상"),
                new PreparationAnalysisRequest.ActionCandidate("status",
                    PreparationAnalysisRequest.FormElement.SELECT,
                    PreparationAnalysisRequest.FormControl.SELECT,
                    PreparationAnalysisRequest.Visibility.VISIBLE, "대상 분류",
                    "prsMilitarySvcStatus", "prsMilitarySvcStatus", null, null, null, null)
            ), null)));
        assertThat(new StoredPolicyActionResolver(policy("sk")).resolve(request).results())
            .containsExactly(
                new ActionResolver.SelectOptionAction("target", "military.military.militaryStatus",
                    "대상", "section-1", List.of("prsMilitarySvcStatus"),
                    List.of("군필", "미필", "면제", "복무중"), null),
                new ActionResolver.NoAction("non-target"),
                new ActionResolver.NoAction("similar"),
                new ActionResolver.SelectOptionAction("status", "military.military.militaryStatus",
                    null, "section-1", null, List.of("군필", "미필", "면제", "복무중"), null)
            );
    }

    @Test
    void mapsMilitaryTargetStatusWithoutInventingUnsupportedDetails() {
        var request = new FieldsAnalysisRequest(2, "military-fields",
            new FieldsAnalysisRequest.Site("www.skcareers.com", "/Application/Index/{postingId}"),
            List.of(new FieldsAnalysisRequest.Section("section-1", null, null, List.of(
                field("target", null, "prsMilitarySvcYN", FormControl.RADIO),
                field("specialty", "prsMilitarySvcSpecialty", "prsMilitarySvcSpecialty", FormControl.TEXT),
                field("discharge", "prsMilitarySvcDischargeType", "prsMilitarySvcDischargeType", FormControl.TEXT),
                field("veteran-type", "prsVeteranBenefitType", "prsVeteranBenefitType", FormControl.TEXT)
            ), null)));
        assertThat(new StoredPolicyFieldMappingResolver(policy("sk")).resolve(request).results())
            .containsExactly(
                new FieldMappingResolver.Match("target", new FieldMappingResolver.LookupBinding(
                    "military.military.militaryStatus", Map.of(
                        "군필", "대상", "미필", "대상", "면제", "대상", "복무중", "대상", "비대상", "비대상"
                    )
                )),
                new FieldMappingResolver.NoMatch("specialty"),
                new FieldMappingResolver.NoMatch("discharge"),
                new FieldMappingResolver.NoMatch("veteran-type")
            );
    }

    private PreparationAnalysisRequest.ActionCandidate radioAction(String id, String name, String label) {
        return new PreparationAnalysisRequest.ActionCandidate(id,
            PreparationAnalysisRequest.FormElement.INPUT, PreparationAnalysisRequest.FormControl.RADIO,
            PreparationAnalysisRequest.Visibility.VISIBLE, label, null, name, null, null, null, null);
    }

    @Test
    void mapsUniversityScaleAndAdditionalMajorsThroughTheActualSeed() {
        var resolution = resolve("educationuniversity", List.of(
            field("scale", "rcdPerf_2", null, FormControl.BUTTON),
            field("double", "dblMajorNm_2", "dblMajorNm", FormControl.TEXT),
            field("minor", "minorNm_2", "minorNm", FormControl.TEXT)
        ));

        assertThat(resolution.results()).containsExactly(
            new FieldMappingResolver.Match("scale", new FieldMappingResolver.ButtonOptionBinding(
                "education.university.gpaScale",
                Map.of("4.00", "4.0", "4.30", "4.3", "4.50", "4.5", "100.00", "100"),
                Map.of("4.0", "4", "4.3", "4.3", "4.5", "4.5", "100", "100")
            )),
            new FieldMappingResolver.Match("double", new FieldMappingResolver.DirectBinding(
                "education.university.additionalMajorName"
            )),
            new FieldMappingResolver.Match("minor", new FieldMappingResolver.DirectBinding(
                "education.university.minorName"
            ))
        );
    }

    @Test
    void doesNotReuseUniversityBindingsInOtherRowsOrUnverifiedControls() {
        for (var group : List.of("educationhighschool", "educationgraduateschool", "career")) {
            assertThat(resolve(group, List.of(
                field("scale", "rcdPerf_2", null, FormControl.BUTTON),
                field("double", "dblMajorNm_2", "dblMajorNm", FormControl.TEXT),
                field("minor", "minorNm_2", "minorNm", FormControl.TEXT)
            )).results()).containsExactly(
                new FieldMappingResolver.NoMatch("scale"),
                new FieldMappingResolver.NoMatch("double"),
                new FieldMappingResolver.NoMatch("minor")
            );
        }
        assertThat(resolve("educationuniversity", List.of(
            field("wrong-name", "dblMajorNm_2", "majorNm", FormControl.TEXT),
            field("wrong-control", "rcdPerf_2", null, FormControl.TEXT)
        )).results()).containsExactly(
            new FieldMappingResolver.NoMatch("wrong-name"),
            new FieldMappingResolver.NoMatch("wrong-control")
        );
    }

    private FieldMappingResolver.Resolution resolve(String group, List<FieldCandidate> fields) {
        return new StoredPolicyFieldMappingResolver(policy("hyundai")).resolve(new FieldsAnalysisRequest(
            2, "regression", new FieldsAnalysisRequest.Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new FieldsAnalysisRequest.Section("section-root", null, null, List.of(),
                List.of(new FieldsAnalysisRequest.Item("row-2", fields, group))))
        ));
    }

    private FieldCandidate field(String id, String domId, String name, FormControl control) {
        return new FieldCandidate(id, FormElement.INPUT, control, Visibility.VISIBLE,
            null, domId, name, null, null, null, null, null);
    }

    private FormAnalysisPolicyDocument seed(String company) {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(mock(FormAnalysisCompanyMongoRepository.class), policies).run(null);
        verify(policies, times(2)).save(captured.capture());
        return captured.getAllValues().stream().filter(value -> value.companyKey().equals(company))
            .findFirst().orElseThrow();
    }

    private CompanyFormPolicy policy(String company) {
        var seed = seed(company);
        return CompanyFormPolicy.create(seed.companyKey(), seed.version(),
            seed.preparationFingerprint(), seed.fieldsFingerprint(), seed.actionRules(),
            seed.fieldRules(), new SupportedProfileFields()::contains);
    }
}

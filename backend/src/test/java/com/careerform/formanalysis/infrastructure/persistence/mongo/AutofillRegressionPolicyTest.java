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
    void mapsExactHyundaiMilitaryAndVeteranButtonsToVerifiedDisplayAndCodes() {
        var request = new FieldsAnalysisRequest(2, "hyundai-military-buttons",
            new FieldsAnalysisRequest.Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new FieldsAnalysisRequest.Section("section-root", null, null, List.of(
                field("military-status", "milCd", null, FormControl.BUTTON),
                field("exemption-reason", "milExcptCd", null, FormControl.BUTTON),
                field("rank", "milRank", null, FormControl.BUTTON),
                field("branch", "milDitinc", null, FormControl.BUTTON),
                field("veteran-status", "branchYn", null, FormControl.BUTTON),
                field("veteran-relation", "branchRel", null, FormControl.BUTTON)
            ), null)));

        assertThat(new StoredPolicyFieldMappingResolver(policy("hyundai")).resolve(request).results())
            .containsExactly(
                buttonMatch("military-status", "military.military.militaryStatus",
                    Map.of("군필", "필", "만기전역", "필", "미필", "미필", "면제", "면제", "비대상", "비대상(여성/해외국적)"),
                    Map.of("필", "1", "미필", "2", "면제", "5", "비대상(여성/해외국적)", "7")),
                buttonMatch("exemption-reason", "military.military.exemptionReason",
                    Map.of("신체문제", "신체문제", "생계곤란", "생계곤란", "기타사유", "기타사유", "전시근로역", "전시근로역"),
                    Map.of("신체문제", "01", "생계곤란", "02", "기타사유", "03", "전시근로역", "04")),
                buttonMatch("rank", "military.military.militaryRank",
                    Map.of("병장", "병장", "상병", "상병", "일병", "일병", "이병", "이병"),
                    Map.of("병장", "41", "상병", "42", "일병", "43", "이병", "44")),
                buttonMatch("branch", "military.military.militaryBranch",
                    Map.of("육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병대"),
                    Map.of("육군", "1", "해군", "2", "공군", "3", "해병대", "4")),
                buttonMatch("veteran-status", "veteran.veteran.veteranStatus",
                    Map.of("대상", "예", "비대상", "아니오"), Map.of("예", "Y", "아니오", "N")),
                buttonMatch("veteran-relation", "veteran.veteran.veteranRelation",
                    Map.of("본인", "대상(본인)", "가족", "대상(가족)", "유족", "대상(유족)"),
                    Map.of("대상(본인)", "1", "대상(가족)", "2", "대상(유족)", "3"))
            );
    }

    @Test
    void mapsHyundaiMilitaryDatesAndVeteranNumberOnlyWithTheirExactDomIds() {
        var request = new FieldsAnalysisRequest(2, "hyundai-military-details",
            new FieldsAnalysisRequest.Site("talent.hyundai.com", "/apply/applyWrite.hc"),
            List.of(new FieldsAnalysisRequest.Section("section-root", null, null, List.of(
                field("start", "milStartDt", "milStartDt", FormControl.TEXT),
                field("end", "milEndDt", "milEndDt", FormControl.TEXT),
                field("number", "branchNo", "branchNo", FormControl.TEXT),
                field("wrong-start-id", "otherStart", "milStartDt", FormControl.TEXT),
                field("wrong-number-id", "otherNumber", "branchNo", FormControl.TEXT)
            ), null)));

        assertThat(new StoredPolicyFieldMappingResolver(policy("hyundai")).resolve(request).results())
            .containsExactly(
                new FieldMappingResolver.Match("start", new FieldMappingResolver.DerivedBinding(
                    FieldMappingResolver.DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceStartDate", null, null
                )),
                new FieldMappingResolver.Match("end", new FieldMappingResolver.DerivedBinding(
                    FieldMappingResolver.DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceEndDate", null, null
                )),
                new FieldMappingResolver.Match(
                    "number", "veteran.veteran.veteranNumber"
                ),
                new FieldMappingResolver.NoMatch("wrong-start-id"),
                new FieldMappingResolver.NoMatch("wrong-number-id")
            );
    }

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

    private FieldMappingResolver.Match buttonMatch(
        String candidateId,
        String profileFieldKey,
        Map<String, String> optionMap,
        Map<String, String> optionCodeMap
    ) {
        return new FieldMappingResolver.Match(candidateId,
            new FieldMappingResolver.ButtonOptionBinding(profileFieldKey, optionMap, optionCodeMap));
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

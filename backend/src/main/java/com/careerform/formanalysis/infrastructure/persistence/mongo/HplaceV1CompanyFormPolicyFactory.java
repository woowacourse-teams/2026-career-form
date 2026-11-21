package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;

/**
 * In-code policy for the Hplace v1 applicant app resume form (step 1). It is never stored, so the
 * versioned MRS2 documents (v3, v4) and their active-version pointer stay untouched.
 * Choices shared with MRS2 reuse the MRS2 detail bindings.
 */
final class HplaceV1CompanyFormPolicyFactory {

    static final long VERSION = 1;

    private HplaceV1CompanyFormPolicyFactory() {
    }

    static CompanyFormPolicy create(Predicate<String> isSupportedProfileKey) {
        var mrs2 = HplaceCompanyFormPolicyFactory.create().fieldRules();
        var rules = new ArrayList<FieldRule>();
        rules.add(rule("englishName.familyFirst", FormControl.TEXT, new DerivedBinding(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST)));
        for (String key : List.of("birthday", "emergencyPhone", "serviceStartDate", "serviceEndDate", "veteranNumber")) {
            rules.add(rule(key, FormControl.TEXT, mrs2Binding(mrs2, key)));
        }
        rules.add(rule("militarySpecialty", FormControl.TEXT, new DirectBinding("military.military.militarySpecialty")));
        rules.add(rule("disabilityRegistrationNumber", FormControl.TEXT,
            new DirectBinding("disability.disability.disabilityRegistrationNumber")));
        for (String key : List.of("gender", "militaryStatus", "disabilityStatus", "veteranStatus")) {
            rules.add(rule(key, FormControl.RADIO, mrs2Binding(mrs2, key)));
        }
        for (String key : List.of("militaryRank", "dischargeType", "disabilityGrade", "disabilityType", "nationality")) {
            rules.add(rule(key, FormControl.SELECT, mrs2Binding(mrs2, key)));
        }
        rules.add(rule("militaryBranch", FormControl.SELECT, new LookupBinding("military.military.militaryBranch", Map.of(
            "육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병", "전투경찰", "전경",
            "해양경찰", "해경", "의무경찰", "의경", "의무소방", "의무소방"))));
        rules.add(rule("veteranRelation", FormControl.SELECT, new LookupBinding("veteran.veteran.veteranRelation",
            HplaceCompanyFormPolicyFactory.identity("부", "모", "조부", "조모", "외조부", "외조모", "형제", "자매", "남매", "배우자", "자녀"))));
        var structures = rules.stream().map(rule -> new FieldStructure(rule.structuralName(), rule.element(), rule.control())).toList();
        return CompanyFormPolicy.create("hplace", VERSION, PreparationFingerprint.noActions(),
            new FieldsFingerprint(Set.of(HplaceFormFingerprint.V1_SECTION), structures), List.of(), rules, isSupportedProfileKey);
    }

    private static ValueBinding mrs2Binding(List<FieldRule> mrs2, String key) {
        String name = "hplace.detail." + key;
        return mrs2.stream().filter(rule -> name.equals(rule.structuralName())).findFirst().orElseThrow().valueBinding();
    }

    private static FieldRule rule(String key, FormControl control, ValueBinding binding) {
        String name = "hplace.v1." + key;
        return new FieldRule(name, control == FormControl.SELECT ? FormElement.SELECT : FormElement.INPUT,
            control, binding, false, name);
    }
}

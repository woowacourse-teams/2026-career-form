package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

final class HplaceCompanyFormPolicyFactory {

    static final long VERSION = 3;

    private HplaceCompanyFormPolicyFactory() {
    }

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "hplace-policy-v3", "hplace", VERSION, PreparationFingerprint.noActions(),
            new FieldsFingerprint(Set.of(HplaceFormFingerprint.SECTION, HplaceFormFingerprint.DETAIL_SECTION), List.of(
                new FieldStructure(HplaceFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.MOBILE, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.EMAIL, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.ENGLISH_NAME, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.BIRTHDAY, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.DETAIL_ADDRESS, FormElement.INPUT, FormControl.TEXT)
            )), List.of(), rules()
        );
    }

    private static List<FieldRule> rules() {
        var rules = new ArrayList<>(List.of(
            new FieldRule(HplaceFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT,
                new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME), false, HplaceFormFingerprint.NAME),
            new FieldRule(HplaceFormFingerprint.MOBILE, FormElement.INPUT, FormControl.TEXT,
                new DirectBinding("contact.contact.phoneNumber"), false, HplaceFormFingerprint.MOBILE),
            new FieldRule(HplaceFormFingerprint.EMAIL, FormElement.INPUT, FormControl.TEXT,
                new DirectBinding("contact.contact.email"), false, HplaceFormFingerprint.EMAIL),
            new FieldRule(HplaceFormFingerprint.BIRTHDAY, FormElement.INPUT, FormControl.TEXT,
                new DirectBinding("personal.personal.birthDate"), false, HplaceFormFingerprint.BIRTHDAY),
            new FieldRule(HplaceFormFingerprint.DETAIL_ADDRESS, FormElement.INPUT, FormControl.TEXT,
                new DirectBinding("contact.contact.addressLine2"), false, HplaceFormFingerprint.DETAIL_ADDRESS),
            new FieldRule(HplaceFormFingerprint.EMERGENCY_PHONE, FormElement.INPUT, FormControl.TEXT,
                new DirectBinding("contact.contact.emergencyPhoneNumber"), false, HplaceFormFingerprint.EMERGENCY_PHONE)
        ));
        rules.add(detail("gender", FormControl.RADIO, new LookupBinding("personal.personal.gender", Map.of("남성", "남", "여성", "여"))));
        rules.add(detail("nationality", FormControl.SELECT, new LookupBinding("personal.personal.nationality", Map.of("대한민국", "대한민국"))));
        for (String category : List.of("veteran", "disability")) {
            rules.add(detail(category + "Status", FormControl.RADIO,
                new DerivedBinding(DerivedRecipe.BOOLEAN_YN, category + "." + category + "." + category + "Status", "대상", "비대상")));
        }
        rules.add(detail("militaryStatus", FormControl.RADIO, new LookupBinding("military.military.militaryStatus",
            identity("군필", "미필", "면제", "복무중", "비대상"))));
        rules.add(detail("militaryRank", FormControl.SELECT, new LookupBinding("military.military.militaryRank",
            identity("이병", "일병", "상병", "병장", "하사", "중사", "상사", "원사", "준위", "소위", "중위", "대위",
                "소령", "중령", "대령", "준장", "소장", "중장", "대장", "원수", "기타"))));
        rules.add(detail("dischargeType", FormControl.SELECT, new LookupBinding("military.military.dischargeType",
            identity("만기제대", "소집해제", "의가사제대", "의병제대", "불명예제대", "상이제대"))));
        rules.add(detail("disabilityGrade", FormControl.SELECT, new LookupBinding("disability.disability.disabilityGrade", Map.of(
            "중증", "심한 장애인", "경증", "심하지 않은 장애인", "중증(심한장애)", "심한 장애인",
            "경증(심하지 않은 장애)", "심하지 않은 장애인", "심한 장애인", "심한 장애인", "심하지 않은 장애인", "심하지 않은 장애인"))));
        var disabilityTypes = new java.util.HashMap<>(identity("간장애", "뇌전증장애(간질장애)", "뇌병변장애", "시각장애", "신장장애",
            "심장장애", "안면변형장애", "장루/요루장애", "정신장애", "청각장애", "호흡기장애", "지체장애", "언어장애",
            "지적장애(정신박약/정신지체)", "자폐성장애(발달장애)", "췌장장애", "기타장애"));
        disabilityTypes.putAll(Map.of("안면장애", "안면변형장애", "장루・요루장애", "장루/요루장애", "기타", "기타장애"));
        rules.add(detail("disabilityType", FormControl.SELECT, new LookupBinding("disability.disability.disabilityType", disabilityTypes)));
        for (String key : List.of("veteranNumber", "veteranRelation")) {
            rules.add(detail(key, FormControl.TEXT, new DirectBinding("veteran.veteran." + key)));
        }
        for (String key : List.of("serviceStartDate", "serviceEndDate", "exemptionReason")) {
            rules.add(detail(key, FormControl.TEXT, new DirectBinding("military.military." + key)));
        }
        return List.copyOf(rules);
    }

    private static FieldRule detail(String key, FormControl control, ValueBinding binding) {
        String name = "hplace.detail." + key;
        return new FieldRule(name, control == FormControl.SELECT ? FormElement.SELECT : FormElement.INPUT,
            control, binding, false, name);
    }

    private static Map<String, String> identity(String... values) {
        return java.util.Arrays.stream(values).collect(java.util.stream.Collectors.toUnmodifiableMap(value -> value, value -> value));
    }
}

package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
import java.util.Set;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;

final class HplaceCompanyFormPolicyFactory {

    static final long VERSION = 2;

    private HplaceCompanyFormPolicyFactory() {
    }

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "hplace-policy-v2", "hplace", VERSION, PreparationFingerprint.noActions(),
            new FieldsFingerprint(Set.of(HplaceFormFingerprint.SECTION, HplaceFormFingerprint.DETAIL_SECTION), List.of(
                new FieldStructure(HplaceFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.MOBILE, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.EMAIL, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.ENGLISH_NAME, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.BIRTHDAY, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.DETAIL_ADDRESS, FormElement.INPUT, FormControl.TEXT)
            )), List.of(), List.of(
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
            )
        );
    }
}

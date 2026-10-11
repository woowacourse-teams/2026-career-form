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

    static final long VERSION = 1;

    private HplaceCompanyFormPolicyFactory() {
    }

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "hplace-policy-v1", "hplace", VERSION, PreparationFingerprint.noActions(),
            new FieldsFingerprint(Set.of(HplaceFormFingerprint.SECTION), List.of(
                new FieldStructure(HplaceFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.MOBILE, FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(HplaceFormFingerprint.EMAIL, FormElement.INPUT, FormControl.TEXT)
            )), List.of(), List.of(
                new FieldRule(HplaceFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT,
                    new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME), false, HplaceFormFingerprint.NAME),
                new FieldRule(HplaceFormFingerprint.MOBILE, FormElement.INPUT, FormControl.TEXT,
                    new DirectBinding("contact.contact.phoneNumber"), false, HplaceFormFingerprint.MOBILE),
                new FieldRule(HplaceFormFingerprint.EMAIL, FormElement.INPUT, FormControl.TEXT,
                    new DirectBinding("contact.contact.email"), false, HplaceFormFingerprint.EMAIL)
            )
        );
    }
}

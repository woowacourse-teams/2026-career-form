package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;

final class GreetingCompanyFormPolicyFactory {

    static final long VERSION = 1;

    private GreetingCompanyFormPolicyFactory() {
    }

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "greeting-policy-v1",
            "greeting",
            VERSION,
            PreparationFingerprint.noActions(),
            FieldsFingerprint.anySections(List.of(
                new FieldStructure(GreetingFormFingerprint.NAME,
                    FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(GreetingFormFingerprint.PHONE,
                    FormElement.INPUT, FormControl.TEXT)
            )),
            List.of(),
            List.of(
                new FieldRule(GreetingFormFingerprint.NAME,
                    FormElement.INPUT, FormControl.TEXT,
                    new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME),
                    false, GreetingFormFingerprint.NAME),
                new FieldRule(GreetingFormFingerprint.PHONE,
                    FormElement.INPUT, FormControl.TEXT,
                    new DirectBinding("contact.contact.phoneNumber"),
                    false, GreetingFormFingerprint.PHONE)
            )
        );
    }
}

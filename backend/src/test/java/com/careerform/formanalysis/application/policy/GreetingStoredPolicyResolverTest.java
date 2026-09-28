package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.Match;
import com.careerform.formanalysis.application.port.FieldMappingResolver.NoMatch;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

class GreetingStoredPolicyResolverTest {

    @Test
    void exactNameModeRejectsIdSpoofAndRepeatedItems() {
        CompanyFormPolicy policy = CompanyFormPolicy.create(
            "greeting", 1, PreparationFingerprint.noActions(),
            FieldsFingerprint.anySections(List.of(
                new FieldStructure(GreetingFormFingerprint.NAME,
                    FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(GreetingFormFingerprint.PHONE,
                    FormElement.INPUT, FormControl.TEXT)
            )), List.of(), List.of(
                new FieldRule(GreetingFormFingerprint.NAME,
                    FormElement.INPUT, FormControl.TEXT,
                    new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME),
                    false, GreetingFormFingerprint.NAME),
                new FieldRule(GreetingFormFingerprint.PHONE,
                    FormElement.INPUT, FormControl.TEXT,
                    new DirectBinding("contact.contact.phoneNumber"),
                    false, GreetingFormFingerprint.PHONE)
            ), ignored -> true
        );
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2, "fields-1", new Site("career.hyundai-autoever.com", "/ko/o/*/apply"),
            List.of(new Section("section-root", null, null, List.of(
                field("name", "random-id", GreetingFormFingerprint.NAME),
                field("phone", "random-id-2", GreetingFormFingerprint.PHONE),
                field("spoof", GreetingFormFingerprint.NAME, "other.name")
            ), List.of(new Item("item-1", List.of(
                field("repeat", "random-id-3", GreetingFormFingerprint.NAME)
            ), "education"))))
        );

        assertThat(new StoredPolicyFieldMappingResolver(policy, true)
            .resolve(request).results()).containsExactly(
                new Match("name", new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME)),
                new Match("phone", new DirectBinding("contact.contact.phoneNumber")),
                new NoMatch("spoof"),
                new NoMatch("repeat")
            );
    }

    private static FieldCandidate field(String id, String domId, String domName) {
        return new FieldCandidate(
            id, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            null, domId, domName, null, null, null, null, null
        );
    }
}

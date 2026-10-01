package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

class GreetingFormFingerprintTest {

    private final GreetingFormFingerprint fingerprint = new GreetingFormFingerprint();

    @Test
    void acceptsUniqueVisibleNativeNameAndPhoneAcrossOpaqueSectionIds() {
        assertThat(fingerprint.matches(request(List.of(name(), phone()), List.of())))
            .isTrue();
    }

    @Test
    void rejectsMissingDuplicateOrSpoofedSemanticNames() {
        assertThat(fingerprint.matches(request(List.of(name()), List.of()))).isFalse();
        assertThat(fingerprint.matches(request(
            List.of(name(), phone(), name()), List.of()
        ))).isFalse();
        assertThat(fingerprint.matches(request(List.of(
            new FieldCandidate("name", FormElement.INPUT, FormControl.TEXT,
                Visibility.VISIBLE, "이름", "basicInformation.name", "other.name",
                null, null, null, null, null),
            phone()
        ), List.of()))).isFalse();
    }

    @Test
    void rejectsUnsafeControlsAndRepeatedRows() {
        assertThat(fingerprint.matches(request(List.of(
            name(), new FieldCandidate("phone", FormElement.INPUT, FormControl.TEXT,
                Visibility.VISIBLE, "전화", null,
                "basicInformation.phoneNumber.nationalNumber", null,
                null, true, null, null)
        ), List.of()))).isFalse();
        assertThat(fingerprint.matches(request(
            List.of(phone()),
            List.of(new Item("repeat-1", List.of(name()), "basicinformation"))
        ))).isFalse();
    }

    private static FieldsAnalysisRequest request(
        List<FieldCandidate> fields,
        List<Item> items
    ) {
        return new FieldsAnalysisRequest(
            2, "greeting-fields", new Site("career.hyundai-autoever.com", "/ko/o/*/apply"),
            List.of(new Section("section-7", null, null, fields, items))
        );
    }

    private static FieldCandidate name() {
        return new FieldCandidate(
            "name", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            "이름", null, "basicInformation.name", null,
            null, null, null, null
        );
    }

    private static FieldCandidate phone() {
        return new FieldCandidate(
            "phone", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            "전화번호", null, "basicInformation.phoneNumber.nationalNumber", null,
            null, null, null, null
        );
    }
}

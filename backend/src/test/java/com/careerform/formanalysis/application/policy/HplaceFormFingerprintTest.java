package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

class HplaceFormFingerprintTest {
    private final HplaceFormFingerprint fingerprint = new HplaceFormFingerprint();

    @Test
    void acceptsExactlyThreeTopLevelRegistrationFields() {
        assertThat(fingerprint.matches(request("hplace-registration", fields(), null))).isTrue();
    }

    @Test
    void rejectsMissingDuplicateExtraAndNestedFields() {
        assertThat(fingerprint.matches(request("hplace-registration", fields().subList(0, 2), null))).isFalse();
        assertThat(fingerprint.matches(request("hplace-registration", List.of(field("name"), field("mobile"), field("name")), null))).isFalse();
        assertThat(fingerprint.matches(request("hplace-registration", List.of(field("name"), field("mobile"), field("email"), field("password")), null))).isFalse();
        assertThat(fingerprint.matches(request("hplace-registration", fields(), List.of(new Item("row", List.of(field("other"))))))).isFalse();
        assertThat(fingerprint.matches(request("other", fields(), null))).isFalse();
        var request = request("hplace-registration", fields(), null);
        assertThat(fingerprint.matches(new FieldsAnalysisRequest(2, "snapshot", request.site(),
            List.of(request.sections().getFirst(), request.sections().getFirst())))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "name", "missing-name", "element", "control", "hidden", "disabled", "readonly", "inert"})
    void rejectsChangedIdentityOrUnsafeControl(String change) {
        String name = "hplace.registration.name";
        var changed = new FieldCandidate("name",
            change.equals("element") ? FormElement.BUTTON : FormElement.INPUT,
            change.equals("control") ? FormControl.BUTTON : FormControl.TEXT,
            change.equals("hidden") ? Visibility.HIDDEN : Visibility.VISIBLE,
            name, change.equals("id") ? "other" : name, change.equals("missing-name") ? null : change.equals("name") ? "other" : name,
            null, change.equals("disabled") ? true : null, change.equals("readonly") ? true : null,
            change.equals("inert") ? true : null, null);
        assertThat(fingerprint.matches(request("hplace-registration", List.of(changed, field("mobile"), field("email")), null))).isFalse();
    }

    @Test
    void preparationRejectsOtherSectionsOrActions() {
        var section = new PreparationAnalysisRequest.Section("hplace-registration", null, null, List.of(), null);
        var site = new PreparationAnalysisRequest.Site("ahnlab.recruiter.co.kr", "/app/applicant/registResume");
        assertThat(fingerprint.matches(new PreparationAnalysisRequest(2, "prep", site, List.of(section)))).isTrue();
        assertThat(fingerprint.matches(new PreparationAnalysisRequest(2, "prep", site, List.of(section, section)))).isFalse();
        assertThat(fingerprint.matches(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("other", null, null, List.of(), null))))).isFalse();
        var action = new PreparationAnalysisRequest.ActionCandidate("continue", PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON, PreparationAnalysisRequest.Visibility.VISIBLE,
            null, null, null, null, null, null);
        assertThat(fingerprint.matches(new PreparationAnalysisRequest(2, "prep", site, List.of(
            new PreparationAnalysisRequest.Section("hplace-registration", null, null, List.of(action), null))))).isFalse();
    }

    private static List<FieldCandidate> fields() { return List.of(field("name"), field("mobile"), field("email")); }
    private static FieldCandidate field(String key) {
        return new FieldCandidate(key, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, null,
            "hplace.registration." + key, "hplace.registration." + key, null, null, null, null, null);
    }
    private static FieldsAnalysisRequest request(String section, List<FieldCandidate> fields, List<Item> items) {
        return new FieldsAnalysisRequest(2, "fields", new Site("ahnlab.recruiter.co.kr", "/app/applicant/registResume"),
            List.of(new Section(section, null, null, fields, items)));
    }
}

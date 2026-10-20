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

    @Test
    void detailedShapeRejectsMissingDuplicateMixedOrNestedFields() {
        var fields = List.of(detailField("englishName"), detailField("birthday"), detailField("detailAddress"));
        assertThat(fingerprint.matches(detailRequest(fields, null))).isTrue();
        // The current address is optional (com2us has none); name and birthday stay required.
        assertThat(fingerprint.matches(detailRequest(fields.subList(0, 2), null))).isTrue();
        assertThat(fingerprint.matches(detailRequest(List.of(fields.get(0), fields.get(2)), null))).isFalse();
        assertThat(fingerprint.matches(detailRequest(List.of(fields.get(1), fields.get(2)), null))).isFalse();
        assertThat(fingerprint.matches(detailRequest(List.of(fields.get(0), fields.get(1), fields.get(1)), null))).isFalse();
        assertThat(fingerprint.matches(detailRequest(List.of(fields.get(0), fields.get(1), field("email")), null))).isFalse();
        assertThat(fingerprint.matches(detailRequest(fields, List.of(new Item("row", List.of(detailField("emergencyPhone"))))))).isFalse();
        assertThat(fingerprint.matches(detailRequest(List.of(fields.get(0), fields.get(1), fields.get(2), detailField("password")), null))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "name", "missing-name", "element", "control", "hidden", "disabled", "readonly", "inert", "duplicate-candidate"})
    void detailedShapeRejectsUnsafeOrSpoofedControls(String change) {
        String name = "hplace.detail.englishName";
        var changed = new FieldCandidate(change.equals("duplicate-candidate") ? "birthday" : "englishName",
            change.equals("element") ? FormElement.BUTTON : FormElement.INPUT,
            change.equals("control") ? FormControl.BUTTON : FormControl.TEXT,
            change.equals("hidden") ? Visibility.HIDDEN : Visibility.VISIBLE,
            null, change.equals("id") ? "other" : name, change.equals("missing-name") ? null : change.equals("name") ? "other" : name,
            null, change.equals("disabled") ? true : null, change.equals("readonly") ? true : null,
            change.equals("inert") ? true : null, null);
        assertThat(fingerprint.matches(detailRequest(List.of(changed, detailField("birthday"), detailField("detailAddress")), null))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"gender", "nationality", "veteranStatus", "veteranNumber", "veteranRelation", "disabilityStatus", "disabilityGrade", "disabilityType", "militaryStatus", "militaryRank", "serviceStartDate", "serviceEndDate", "dischargeType", "exemptionReason"})
    void optionalDetailedFieldsRequireExactControlIdentity(String key) {
        boolean radio = List.of("gender", "veteranStatus", "disabilityStatus", "militaryStatus").contains(key);
        boolean select = List.of("nationality", "disabilityGrade", "disabilityType", "militaryRank", "dischargeType").contains(key);
        var fields = new java.util.ArrayList<>(List.of(detailField("englishName"), detailField("birthday"), detailField("detailAddress")));
        String name = "hplace.detail." + key;
        var element = select ? FormElement.SELECT : FormElement.INPUT;
        var control = select ? FormControl.SELECT : radio ? FormControl.RADIO : FormControl.TEXT;
        fields.add(new FieldCandidate(key, element, control, Visibility.VISIBLE, null, name, name, null, null, null, null, null));
        assertThat(fingerprint.matches(detailRequest(fields, null))).isTrue();
        fields.add(fields.getLast());
        assertThat(fingerprint.matches(detailRequest(fields, null))).isFalse();
        fields.removeLast();
        fields.set(3, new FieldCandidate(key, element, FormControl.BUTTON, Visibility.VISIBLE, null, name, name, null, null, null, null, null));
        assertThat(fingerprint.matches(detailRequest(fields, null))).isFalse();
        fields.set(3, new FieldCandidate(key, FormElement.BUTTON, control, Visibility.VISIBLE, null, name, name, null, null, null, null, null));
        assertThat(fingerprint.matches(detailRequest(fields, null))).isFalse();
        for (String unsafe : List.of("disabled", "readonly", "inert", "hidden", "id", "duplicate-id")) {
            fields.set(3, new FieldCandidate(unsafe.equals("duplicate-id") ? "birthday" : key, element, control,
                unsafe.equals("hidden") ? Visibility.HIDDEN : Visibility.VISIBLE, null,
                unsafe.equals("id") ? "unverified" : name, name, null,
                unsafe.equals("disabled"), unsafe.equals("readonly"), unsafe.equals("inert"), null));
            assertThat(fingerprint.matches(detailRequest(fields, null))).isFalse();
        }
    }

    private static FieldsAnalysisRequest detailRequest(List<FieldCandidate> fields, List<Item> items) {
        return new FieldsAnalysisRequest(2, "fields", new Site("hi.recruiter.co.kr", "/mrs2/applicant/resume/writeResume"),
            List.of(new Section("hplace-detail-basic", null, null, fields, items)));
    }

    private static FieldCandidate detailField(String key) {
        return new FieldCandidate(key, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, null,
            "hplace.detail." + key, "hplace.detail." + key, null, null, null, null, null);
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

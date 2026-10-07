package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.*;
import com.careerform.formanalysis.application.port.ActionResolver.*;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.*;

class GreetingActionResolverTest {
    @Test
    void authorizesOnlyUniqueExactVisibleEducationAddButtons() {
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, List.of(
                button("uni", "greeting:add:universities", Visibility.VISIBLE, null),
                button("grad", "greeting:add:graduateSchools", Visibility.VISIBLE, null),
                button("spoof", "other:add:universities", Visibility.VISIBLE, null),
                button("hidden", "greeting:add:universities", Visibility.HIDDEN, null),
                button("disabled", "greeting:add:graduateSchools", Visibility.VISIBLE, true)
            ), null)));
        var router = new FormAnalysisRouter((host, path) -> new NotRegistered(),
            (host, path) -> Decision.POSITIVE,
            () -> new Available(CompanyFormPolicyFixture.greeting()));
        assertThat(router.route(request).resolver().resolve(request).results()).containsExactly(
            new AddAction("uni"), new AddAction("grad"), new NoAction("spoof"),
            new NoAction("hidden"), new NoAction("disabled"));
    }

    @Test
    void rejectsDuplicateAddControlsAndLabelOnlySpoofing() {
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, List.of(
                button("a", "greeting:add:universities", Visibility.VISIBLE, null),
                button("b", "greeting:add:universities", Visibility.VISIBLE, null),
                button("label-only", null, Visibility.VISIBLE, null)
            ), null)));
        assertThat(new GreetingActionResolver().resolve(request).results()).containsExactly(
            new NoAction("a"), new NoAction("b"), new NoAction("label-only"));
    }

    @Test
    void authorizesOnlyUniqueGraduateMajorAddActionsWithinSchoolIndexBounds() {
        var names = List.of("greeting:add:graduateSchools:0:majors", "greeting:add:graduateSchools:127:majors",
            "greeting:add:universities:0:majors", "greeting:add:graduateSchools:128:majors",
            "greeting:add:graduateSchools:01:majors", "greeting:add:graduateSchools:-1:majors",
            "greeting:add:graduateSchools:0:majors:extra");
        var buttons = names.stream().map(name -> button(name, name, Visibility.VISIBLE, null)).toList();
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, buttons, null)));
        assertThat(new GreetingActionResolver().resolve(request).results()).containsExactly(
            new AddAction(names.get(0)), new AddAction(names.get(1)), new AddAction(names.get(2)),
            new NoAction(names.get(3)), new NoAction(names.get(4)), new NoAction(names.get(5)), new NoAction(names.get(6)));
        var duplicate = new PreparationAnalysisRequest(2, "prep", request.site(),
            List.of(new Section("root", null, null, List.of(
                button("first", names.get(0), Visibility.VISIBLE, null),
                button("second", names.get(0), Visibility.VISIBLE, null)), null)));
        assertThat(new GreetingActionResolver().resolve(duplicate).results())
            .containsExactly(new NoAction("first"), new NoAction("second"));
    }

    @Test
    void allowsVerifiedNewRepeatedSectionActions() {
        var supported = List.of("workExperiences", "certifiedLanguageTests", "foreignLanguageProficiencies", "certificatesLicenses", "projects");
        var buttons = supported.stream().map(group -> button(group, "greeting:add:" + group, Visibility.VISIBLE, null)).toList();
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, buttons, null)));
        assertThat(new GreetingActionResolver().resolve(request).results()).containsExactlyElementsOf(supported.stream().map(AddAction::new).toList());
    }

    @Test
    void rejectsUnverifiedGroupsMalformedActionsAndDuplicateNewActions() {
        var ids = List.of("greeting:add:highSchool", "greeting:add:projects:extra", "greeting:add:workExperiences:extra",
            "greeting:add:universities:128:majors", "greeting:add:universities:01:majors");
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, ids.stream().map(id -> button(id, id, Visibility.VISIBLE, null)).toList(), null)));
        assertThat(new GreetingActionResolver().resolve(request).results()).containsExactlyElementsOf(ids.stream().map(NoAction::new).toList());
        var duplicate = new PreparationAnalysisRequest(2, "prep", request.site(), List.of(new Section("root", null, null,
            List.of(button("first", "greeting:add:workExperiences", Visibility.VISIBLE, null),
                button("second", "greeting:add:workExperiences", Visibility.VISIBLE, null)), null)));
        assertThat(new GreetingActionResolver().resolve(duplicate).results()).containsExactly(new NoAction("first"), new NoAction("second"));
    }

    @Test
    void authorizesOnlyTheUniqueVisibleAddressSearchButton() {
        var request = new PreparationAnalysisRequest(2, "prep", new Site("a.career.greetinghr.com", "/ko/o/*/apply"),
            List.of(new Section("root", null, null, List.of(
                button("address", "greeting:search:address", Visibility.VISIBLE, null),
                button("spoof", "greeting:search:address:extra", Visibility.VISIBLE, null)), null)));
        assertThat(new GreetingActionResolver().resolve(request).results())
            .containsExactly(new SearchAddressAction("address"), new NoAction("spoof"));
        var duplicate = new PreparationAnalysisRequest(2, "prep", request.site(), List.of(new Section("root", null, null,
            List.of(button("first", "greeting:search:address", Visibility.VISIBLE, null),
                button("second", "greeting:search:address", Visibility.VISIBLE, null),
                button("hidden", "greeting:search:address", Visibility.HIDDEN, null)), null)));
        assertThat(new GreetingActionResolver().resolve(duplicate).results())
            .containsExactly(new NoAction("first"), new NoAction("second"), new NoAction("hidden"));
    }

    private ActionCandidate button(String id, String name, Visibility visibility, Boolean disabled) {
        return new ActionCandidate(id, FormElement.BUTTON, FormControl.BUTTON, visibility,
            "항목 추가", name, null, disabled, null, null);
    }
}

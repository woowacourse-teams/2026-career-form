package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.CalendarStructure;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Candidate;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Decision;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.infrastructure.AnalysisProviderSelection;

import jakarta.validation.Validation;

class InteractionDecisionServiceTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "education.university.schoolName", "education.university.schoolRegion",
        "education.university.majorName", "education.highSchool.schoolName",
        "education.graduateSchool.schoolName", "careers.career.companyName"
    })
    void acceptsCanonicalSearchFieldsThroughValidationAndRestoresIds(String key) {
        InteractionDecisionRequest request = request(key);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isEmpty();
        }
        InteractionDecisionResponse response = service(batch -> {
            assertThat(batch.decisions().getFirst().canonicalFieldKey()).isEqualTo(key);
            return new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(decision -> (InteractionDecisionProvider.Result)
                    new InteractionDecisionProvider.Selected(
                        decision.decisionId(), decision.role(),
                        decision.candidates().getFirst().candidateId()))
                .toList());
        }).decide(request);

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.snapshotId()).isEqualTo("synthetic-snapshot");
        assertThat(response.decisions()).containsExactly(
            InteractionDecisionResponse.Decision.selected("opener", Role.SEARCH_POPUP_OPENER, "open-button"),
            InteractionDecisionResponse.Decision.selected("query", Role.SEARCH_QUERY_INPUT, "query-input"),
            InteractionDecisionResponse.Decision.selected("submit", Role.SEARCH_SUBMIT, "search-button")
        );
    }

    @Test
    void acceptsCalendarRolesAndRestoresSelectedIds() {
        InteractionDecisionRequest request = calendarRequest(false);
        InteractionDecisionResponse response = service(batch ->
            new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(decision -> (InteractionDecisionProvider.Result)
                    new InteractionDecisionProvider.Selected(
                        decision.decisionId(), decision.role(),
                        decision.candidates().getFirst().candidateId()))
                .toList())).decide(request);

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.decisions()).extracting(InteractionDecisionResponse.Decision::candidateId)
            .containsExactly("calendar-opener", "calendar-year", "calendar-apply");
    }

    @Test
    void rejectsCalendarRoleCandidateThatIsReadonly() {
        InteractionDecisionResponse response = service(batch ->
            new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(decision -> (InteractionDecisionProvider.Result)
                    new InteractionDecisionProvider.Selected(
                        decision.decisionId(), decision.role(),
                        decision.candidates().getFirst().candidateId()))
                .toList())).decide(calendarRequest(true));

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.LLM_UNAVAILABLE);
        assertThat(response.decisions()).isEmpty();
    }

    @Test
    void rejectsUnknownCanonicalKeyBeforeProvider() {
        assertThatThrownBy(() -> service(batch -> {
            throw new AssertionError("Unknown canonical key must not reach provider");
        }).decide(request("education.university.schoolLocation")))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    void rejectsUnknownSelectedCandidateAndIncompleteDecisionSet() {
        InteractionDecisionResponse response = service(batch ->
            new InteractionDecisionProvider.Resolution(2, List.of(
                new InteractionDecisionProvider.Selected("d1", Role.SEARCH_POPUP_OPENER, "unknown")
            ))).decide(request("education.university.majorName"));

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.LLM_UNAVAILABLE);
        assertThat(response.decisions()).isEmpty();
    }

    @Test
    void preservesAbstentionForAllRoles() {
        InteractionDecisionResponse response = service(batch ->
            new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(decision -> (InteractionDecisionProvider.Result)
                    new InteractionDecisionProvider.Abstained(decision.decisionId(), decision.role()))
                .toList())).decide(request("education.university.schoolRegion"));

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.decisions()).hasSize(3).allSatisfy(decision -> {
            assertThat(decision.selection()).isEqualTo(InteractionDecisionResponse.Selection.ABSTAINED);
            assertThat(decision.candidateId()).isNull();
        });
    }

    @Test
    void doesNotCallAnInjectedProviderWhenAnalysisIsDisabled() {
        InteractionDecisionResponse response = new InteractionDecisionService(
            Optional.<InteractionDecisionProvider>of(batch -> {
                throw new AssertionError("Disabled analysis must not call a provider");
            }),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new InteractionObservationProjector(),
            new AnalysisProviderSelection(false, "openai")
        ).decide(request("education.university.majorName"));

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.LLM_UNAVAILABLE);
        assertThat(response.decisions()).isEmpty();
    }

    @Test
    void acceptsStructureRolesWithButtonLikeAndSelectOptionCandidates() {
        InteractionDecisionRequest request = structureRequest(
            new Decision("add-row", Role.REPEAT_ADD, "education.university.schoolName",
                List.of(candidate("add-button", Element.BUTTON, Control.BUTTON, RelationToTarget.SAME_CONTAINER))),
            new Decision("reveal", Role.SECTION_REVEAL, "careers.career.companyName",
                List.of(candidate("reveal-toggle", Element.CUSTOM, Control.BUTTON, RelationToTarget.SAME_CONTAINER))),
            new Decision("kind-master", Role.ROW_KIND_OPTION, "education.graduateSchool.schoolName",
                List.of(candidate("master-option", Element.SELECT, Control.OPTION, RelationToTarget.SAME_REPEAT_ROW)),
                TargetKind.MASTER));
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isEmpty();
        }

        InteractionDecisionResponse response = service(InteractionDecisionServiceTest::selectFirst).decide(request);

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.decisions()).containsExactly(
            InteractionDecisionResponse.Decision.selected("add-row", Role.REPEAT_ADD, "add-button"),
            InteractionDecisionResponse.Decision.selected("reveal", Role.SECTION_REVEAL, "reveal-toggle"),
            InteractionDecisionResponse.Decision.selected("kind-master", Role.ROW_KIND_OPTION, "master-option"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"REPEAT_ADD", "SECTION_REVEAL"})
    void rejectsStructureActionCandidatesThatAreNotVisibleEnabledButtons(String roleName) {
        Role role = Role.valueOf(roleName);
        List<Candidate> invalid = List.of(
            candidate("select-control", Element.SELECT, Control.OPTION, RelationToTarget.SAME_CONTAINER),
            candidate("text-input", Element.INPUT, Control.TEXT, RelationToTarget.SAME_CONTAINER),
            candidate("submit-button", Element.BUTTON, Control.SUBMIT, RelationToTarget.SAME_CONTAINER),
            new Candidate("hidden-button", Element.BUTTON, Control.BUTTON, Visibility.HIDDEN, null, null, null,
                RelationToTarget.SAME_CONTAINER, null),
            new Candidate("disabled-button", Element.BUTTON, Control.BUTTON, Visibility.VISIBLE, true, null, null,
                RelationToTarget.SAME_CONTAINER, null),
            new Candidate("inert-button", Element.BUTTON, Control.BUTTON, Visibility.VISIBLE, null, null, true,
                RelationToTarget.SAME_CONTAINER, null));
        for (Candidate candidate : invalid) {
            assertThatThrownBy(() -> service(batch -> {
                throw new AssertionError("Invalid structure candidate must not reach provider");
            }).decide(structureRequest(new Decision("structure", role, "education.university.schoolName",
                List.of(candidate))))).as(candidate.candidateId()).isInstanceOf(InvalidSnapshotException.class);
        }
    }

    @Test
    void rejectsRowKindDecisionsWithoutSelectOptionsOrTargetKind() {
        List<Decision> invalid = List.of(
            new Decision("kind", Role.ROW_KIND_OPTION, "education.university.schoolName",
                List.of(candidate("kind-button", Element.BUTTON, Control.BUTTON, RelationToTarget.SAME_REPEAT_ROW)),
                TargetKind.BACHELOR),
            new Decision("kind", Role.ROW_KIND_OPTION, "education.university.schoolName",
                List.of(candidate("kind-option", Element.SELECT, Control.OPTION, RelationToTarget.SAME_REPEAT_ROW))),
            new Decision("opener", Role.SEARCH_POPUP_OPENER, "education.university.schoolName",
                List.of(candidate("open-button", Element.BUTTON, Control.BUTTON, RelationToTarget.SAME_FIELD_GROUP)),
                TargetKind.BACHELOR),
            new Decision("opener", Role.SEARCH_POPUP_OPENER, "education.university.schoolName",
                List.of(candidate("open-option", Element.SELECT, Control.OPTION, RelationToTarget.SAME_FIELD_GROUP))));
        for (Decision decision : invalid) {
            assertThatThrownBy(() -> service(batch -> {
                throw new AssertionError("Invalid row kind observation must not reach provider");
            }).decide(structureRequest(decision))).isInstanceOf(InvalidSnapshotException.class);
        }
    }

    @Test
    void keepsStaticPolicyShortCircuitForStructureRoles() {
        InteractionDecisionResponse response = new InteractionDecisionService(
            Optional.<InteractionDecisionProvider>of(batch -> {
                throw new AssertionError("Static policy site must not call a provider");
            }),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.sk())),
            new InteractionObservationProjector()
        ).decide(structureRequest(new Decision("add-row", Role.REPEAT_ADD, "education.university.schoolName",
            List.of(candidate("add-button", Element.BUTTON, Control.BUTTON, RelationToTarget.SAME_CONTAINER)))));

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.STATIC_POLICY_PRESENT);
        assertThat(response.decisions()).isEmpty();
    }

    private static InteractionDecisionProvider.Resolution selectFirst(InteractionDecisionProvider.Batch batch) {
        return new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
            .map(decision -> (InteractionDecisionProvider.Result) new InteractionDecisionProvider.Selected(
                decision.decisionId(), decision.role(), decision.candidates().getFirst().candidateId()))
            .toList());
    }

    private static InteractionDecisionRequest structureRequest(Decision... decisions) {
        return new InteractionDecisionRequest(2, "structure-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"), List.of(decisions));
    }

    private static InteractionDecisionService service(InteractionDecisionProvider provider) {
        return new InteractionDecisionService(Optional.of(provider),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new InteractionObservationProjector());
    }

    private static InteractionDecisionRequest request(String key) {
        return new InteractionDecisionRequest(2, "synthetic-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"), List.of(
                new Decision("opener", Role.SEARCH_POPUP_OPENER, key, List.of(
                    candidate("open-button", Element.BUTTON, Control.BUTTON, RelationToTarget.SAME_FIELD_GROUP))),
                new Decision("query", Role.SEARCH_QUERY_INPUT, key, List.of(
                    candidate("query-input", Element.INPUT, Control.SEARCH, RelationToTarget.DIALOG_CONTROL))),
                new Decision("submit", Role.SEARCH_SUBMIT, key, List.of(
                    candidate("search-button", Element.BUTTON, Control.SUBMIT, RelationToTarget.DIALOG_CONTROL)))
            ));
    }

    private static Candidate candidate(String id, Element element, Control control, RelationToTarget relation) {
        return new Candidate(id, element, control, Visibility.VISIBLE, null, null, null, relation, null);
    }

    private static InteractionDecisionRequest calendarRequest(boolean readonly) {
        List<Decision> decisions = List.of(
            new Decision("open", Role.CALENDAR_OPENER, "education.university.schoolName",
                List.of(calendarCandidate("calendar-opener", readonly, RelationToTarget.SAME_FIELD_GROUP, "none"))),
            new Decision("year", Role.CALENDAR_YEAR_TRIGGER, "education.university.schoolName",
                List.of(calendarCandidate("calendar-year", readonly, RelationToTarget.SAME_CONTAINER, "none"))),
            new Decision("apply", Role.CALENDAR_APPLY, "education.university.schoolName",
                List.of(calendarCandidate("calendar-apply", readonly, RelationToTarget.DIALOG_CONTROL, "apply")))
        );
        return new InteractionDecisionRequest(2, "calendar-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"), decisions);
    }

    private static Candidate calendarCandidate(String id, boolean readonly, RelationToTarget relation,
        String valueShape) {
        return new Candidate(id, Element.BUTTON, Control.BUTTON, Visibility.VISIBLE, null, readonly, null,
            relation, null, null, new CalendarStructure("button", "click", "linked-popup", "month",
                "target-format", valueShape));
    }
}

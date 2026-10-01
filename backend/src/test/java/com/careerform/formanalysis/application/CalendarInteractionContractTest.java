package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

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
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;
import com.careerform.formanalysis.exception.InvalidSnapshotException;

import tools.jackson.databind.ObjectMapper;

class CalendarInteractionContractTest {

    @Test
    void projectsEveryFiniteCalendarRoleAndRestoresOnlyTheSelectedCandidateId() {
        List<Role> roles = List.of(Role.CALENDAR_OPENER, Role.CALENDAR_YEAR_TRIGGER,
            Role.CALENDAR_YEAR_CONTROL, Role.CALENDAR_MONTH_CONTROL, Role.CALENDAR_DAY_CONTROL,
            Role.CALENDAR_NAVIGATION, Role.CALENDAR_APPLY);
        InteractionDecisionRequest request = request(roles.stream().map(role -> decision(role, 1)).toList());
        ObjectMapper mapper = new ObjectMapper();
        InteractionDecisionService service = service(batch -> {
            assertThat(batch.decisions()).extracting(InteractionDecisionProvider.Decision::role)
                .containsExactlyElementsOf(roles);
            assertThat(mapper.writeValueAsString(batch)).contains("calendarStructure", "month-options")
                .doesNotContain("calendar-candidate-");
            return new InteractionDecisionProvider.Resolution(2, batch.decisions().stream()
                .map(decision -> (InteractionDecisionProvider.Result) new InteractionDecisionProvider.Selected(
                    decision.decisionId(), decision.role(), decision.candidates().getFirst().candidateId()))
                .toList());
        });

        InteractionDecisionResponse response = service.decide(request);

        assertThat(response.status()).isEqualTo(InteractionDecisionResponse.Status.COMPLETE);
        assertThat(response.decisions()).extracting(InteractionDecisionResponse.Decision::candidateId)
            .containsExactlyElementsOf(roles.stream().map(role -> "calendar-candidate-" + role.ordinal() + "-0").toList());
    }

    @Test
    void rejectsCalendarCandidatesWithoutFiniteStructure() {
        Decision invalid = new Decision("calendar", Role.CALENDAR_MONTH_CONTROL,
            "education.university.startDate", List.of(new Candidate("candidate", Element.BUTTON, Control.BUTTON,
                Visibility.VISIBLE, null, null, null, RelationToTarget.DIALOG_CONTROL, null, null, null)));

        assertThatThrownBy(() -> service(batch -> {
            throw new AssertionError("Invalid calendar observation must not reach provider");
        }).decide(request(List.of(invalid))))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    void rejectsACalendarCandidateWhoseFiniteShapeDoesNotMatchTheRole() {
        Candidate candidate = new Candidate("candidate", Element.BUTTON, Control.BUTTON, Visibility.VISIBLE,
            null, null, null, RelationToTarget.DIALOG_CONTROL, null, null,
            new CalendarStructure("button", "click", "linked-popup", "day", "target-label", "month-options"));
        InteractionDecisionRequest request = request(List.of(new Decision("calendar", Role.CALENDAR_DAY_CONTROL,
            "education.university.startDate", List.of(candidate))));

        assertThatThrownBy(() -> service(batch -> {
            throw new AssertionError("Invalid role shape must not reach provider");
        }).decide(request)).isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    void rejectsMoreThanEightCandidatesForOneCalendarDecision() {
        Decision invalid = decision(Role.CALENDAR_DAY_CONTROL, 9);

        assertThatThrownBy(() -> service(batch -> {
            throw new AssertionError("Oversized calendar observation must not reach provider");
        }).decide(request(List.of(invalid))))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    @Test
    void rejectsMoreThanThirtyTwoCalendarCandidateEntries() {
        List<Decision> decisions = Arrays.stream(Role.values())
            .filter(role -> role.name().startsWith("CALENDAR_"))
            .limit(5)
            .map(role -> decision(role, 7))
            .toList();

        assertThatThrownBy(() -> service(batch -> {
            throw new AssertionError("Oversized calendar observation must not reach provider");
        }).decide(request(decisions)))
            .isInstanceOf(InvalidSnapshotException.class);
    }

    private static InteractionDecisionRequest request(List<Decision> decisions) {
        return new InteractionDecisionRequest(2, "calendar-snapshot",
            new InteractionDecisionRequest.Site("example.test", "/application"), decisions);
    }

    private static Decision decision(Role role, int candidateCount) {
        List<Candidate> candidates = java.util.stream.IntStream.range(0, candidateCount)
            .mapToObj(index -> new Candidate("calendar-candidate-" + role.ordinal() + "-" + index,
                Element.BUTTON, Control.BUTTON, Visibility.VISIBLE, null, null, null,
                role == Role.CALENDAR_OPENER ? RelationToTarget.SAME_FIELD_GROUP : RelationToTarget.DIALOG_CONTROL,
                null, null, calendarStructure(role)))
            .toList();
        return new Decision(role.name(), role, "education.university.startDate", candidates);
    }

    private static CalendarStructure calendarStructure(Role role) {
        return switch (role) {
            case CALENDAR_OPENER, CALENDAR_YEAR_TRIGGER ->
                new CalendarStructure("button", "click", "linked-popup", "month", "target-format", "none");
            case CALENDAR_YEAR_CONTROL ->
                new CalendarStructure("select", "change", "linked-popup", "month", "target-format", "year-options");
            case CALENDAR_MONTH_CONTROL ->
                new CalendarStructure("select", "change", "linked-popup", "month", "month-options", "month-options");
            case CALENDAR_DAY_CONTROL ->
                new CalendarStructure("button", "click", "linked-popup", "day", "target-label", "day-grid");
            case CALENDAR_NAVIGATION ->
                new CalendarStructure("button", "click", "linked-popup", "month", "target-format", "next");
            case CALENDAR_APPLY ->
                new CalendarStructure("button", "click", "linked-popup", "month", "target-format", "apply");
            default -> throw new IllegalArgumentException("Not a calendar role");
        };
    }

    private static InteractionDecisionService service(InteractionDecisionProvider provider) {
        return new InteractionDecisionService(Optional.of(provider),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.NotRegistered()),
            new InteractionObservationProjector());
    }
}

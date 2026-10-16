package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;

import tools.jackson.databind.json.JsonMapper;

class JevInteractionDecisionProviderTest {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final String PINNED_ABSTAIN = "Cannot identify one safe, supported, unambiguous role.";
    private static final String PINNED_CANDIDATE =
        "This observed candidate only; do not choose hidden, disabled, readonly, inert or unrelated controls.";

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"SEARCH_RESULT_CONTAINER", "SEARCH_RESULT_ITEM", "SEARCH_RESULT_ACTION"})
    void retainsRequestedResultRoleAndExplicitAbstention(Role role) {
        JevClient client = mock(JevClient.class);
        when(client.choose(any(), any())).thenReturn(Map.of("shape", "candidate", "unknown-shape", JevClient.ABSTAIN));
        var result = new JevInteractionDecisionProvider(client).decide(new InteractionDecisionProvider.Batch(2,
            List.of(new InteractionDecisionProvider.Decision("shape", role, "education.university.schoolName", List.of()),
                new InteractionDecisionProvider.Decision("unknown-shape", role, "education.university.schoolName", List.of()))));
        assertThat(result.results()).containsExactly(
            new InteractionDecisionProvider.Selected("shape", role, "candidate"),
            new InteractionDecisionProvider.Abstained("unknown-shape", role));
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"SEARCH_.*", "CALENDAR_.*"}, mode = EnumSource.Mode.MATCH_ANY)
    void keepsExistingSearchAndCalendarJevRequestUnchanged(Role role) {
        var captured = capture(Map.of("d1", JevClient.ABSTAIN), batch(
            new InteractionDecisionProvider.Decision("d1", role, "education.university.schoolName", List.of(button("c1_1")))));

        var question = captured.questions().get("d1");
        assertThat(captured.questions()).containsOnlyKeys("d1");
        assertThat(question.type()).isEqualTo("choice");
        assertThat(question.instructions()).isEqualTo(pinnedInstructions(role.name(), "d1"));
        assertThat(question.criteria()).containsExactlyInAnyOrderEntriesOf(
            Map.of(JevClient.ABSTAIN, PINNED_ABSTAIN, "c1_1", PINNED_CANDIDATE));
        assertThat(MAPPER.writeValueAsString(captured.state())).isEqualTo("{\"d1\":{\"role\":\"" + role.name()
            + "\",\"canonicalFieldKey\":\"education.university.schoolName\",\"candidates\":["
            + MAPPER.writeValueAsString(button("c1_1")) + "]}}");
    }

    @Test
    void asksRepeatAddAndSectionRevealWithStructureCriteria() {
        var captured = capture(Map.of("d1", "c1_2", "d2", JevClient.ABSTAIN), batch(
            new InteractionDecisionProvider.Decision("d1", Role.REPEAT_ADD, "education.university.schoolName",
                List.of(button("c1_1"), button("c1_2"))),
            new InteractionDecisionProvider.Decision("d2", Role.SECTION_REVEAL, "careers.career.companyName",
                List.of(button("c2_1")))));

        assertThat(captured.questions().get("d1").criteria()).containsExactlyInAnyOrderEntriesOf(Map.of(
            JevClient.ABSTAIN, JevInteractionDecisionProvider.REPEAT_ADD_ABSTAIN_CRITERION,
            "c1_1", JevInteractionDecisionProvider.REPEAT_ADD_CRITERION,
            "c1_2", JevInteractionDecisionProvider.REPEAT_ADD_CRITERION));
        assertThat(captured.questions().get("d2").criteria()).containsExactlyInAnyOrderEntriesOf(Map.of(
            JevClient.ABSTAIN, JevInteractionDecisionProvider.SECTION_REVEAL_ABSTAIN_CRITERION,
            "c2_1", JevInteractionDecisionProvider.SECTION_REVEAL_CRITERION));
        assertThat(JevInteractionDecisionProvider.REPEAT_ADD_CRITERION).startsWith("ADD:");
        assertThat(JevInteractionDecisionProvider.SECTION_REVEAL_CRITERION).startsWith("REVEAL:");
        assertThat(captured.questions().get("d1").instructions()).contains("REPEAT_ADD")
            .isNotEqualTo(pinnedInstructions("REPEAT_ADD", "d1"));
        assertThat(captured.result().results()).containsExactly(
            new InteractionDecisionProvider.Selected("d1", Role.REPEAT_ADD, "c1_2"),
            new InteractionDecisionProvider.Abstained("d2", Role.SECTION_REVEAL));
    }

    @Test
    void asksEveryRowKindTargetSeparatelyAndRestoresTheChosenOption() {
        List<InteractionDecisionProvider.Decision> decisions = Arrays.stream(TargetKind.values())
            .map(kind -> new InteractionDecisionProvider.Decision("d" + (kind.ordinal() + 1), Role.ROW_KIND_OPTION,
                "education.university.schoolName", List.of(option("c" + (kind.ordinal() + 1) + "_1"),
                    option("c" + (kind.ordinal() + 1) + "_2")), kind))
            .toList();
        var captured = capture(Map.of("d1", JevClient.ABSTAIN, "d2", JevClient.ABSTAIN, "d3", JevClient.ABSTAIN,
            "d4", "c4_2", "d5", JevClient.ABSTAIN), new InteractionDecisionProvider.Batch(2, decisions));

        for (TargetKind kind : TargetKind.values()) {
            String id = "d" + (kind.ordinal() + 1);
            var question = captured.questions().get(id);
            assertThat(question.instructions()).contains(kind.name());
            assertThat(question.criteria()).containsExactlyInAnyOrderEntriesOf(Map.of(
                JevClient.ABSTAIN, JevInteractionDecisionProvider.rowKindAbstainCriterion(kind),
                "c" + (kind.ordinal() + 1) + "_1", JevInteractionDecisionProvider.rowKindCriterion(kind),
                "c" + (kind.ordinal() + 1) + "_2", JevInteractionDecisionProvider.rowKindCriterion(kind)));
        }
        assertThat(MAPPER.writeValueAsString(captured.questions()))
            .contains("HIGH_SCHOOL", "ASSOCIATE", "BACHELOR", "MASTER", "DOCTOR");
        assertThat(captured.result().results()).contains(
            new InteractionDecisionProvider.Selected("d4", Role.ROW_KIND_OPTION, "c4_2"),
            new InteractionDecisionProvider.Abstained("d1", Role.ROW_KIND_OPTION));
    }

    private static String pinnedInstructions(String role, String id) {
        return "Select the candidate with role " + role + " from observation " + id
            + ". Choose only the observed visible enabled control structurally related to the target or calendar. "
            + "Calendar roles use only the finite calendarStructure ownership, activation and valueShape evidence. "
            + "SEARCH_RESULT_CONTAINER, SEARCH_RESULT_ITEM and SEARCH_RESULT_ACTION classify structural shapes "
            + "shared across the complete result set, not an answer row. Use only finite structure evidence; "
            + "a result action requires mechanical activation evidence. Never choose result data, values, code "
            + "or execution steps.";
    }

    private static InteractionDecisionProvider.Batch batch(InteractionDecisionProvider.Decision... decisions) {
        return new InteractionDecisionProvider.Batch(2, List.of(decisions));
    }

    private static InteractionDecisionProvider.Candidate button(String id) {
        return new InteractionDecisionProvider.Candidate(id, Element.BUTTON, Control.BUTTON, Visibility.VISIBLE,
            false, false, false, RelationToTarget.SAME_FIELD_GROUP, List.of(), false);
    }

    private static InteractionDecisionProvider.Candidate option(String id) {
        return new InteractionDecisionProvider.Candidate(id, Element.SELECT, Control.OPTION, Visibility.VISIBLE,
            false, false, false, RelationToTarget.SAME_REPEAT_ROW, List.of(), false);
    }

    private static Captured capture(Map<String, String> answers, InteractionDecisionProvider.Batch batch) {
        JevClient client = mock(JevClient.class);
        ArgumentCaptor<Object> state = ArgumentCaptor.captor();
        ArgumentCaptor<Map<String, JevClient.Choice>> questions = ArgumentCaptor.captor();
        when(client.choose(state.capture(), questions.capture())).thenReturn(answers);
        var result = new JevInteractionDecisionProvider(client).decide(batch);
        return new Captured(state.getValue(), questions.getValue(), result);
    }

    private record Captured(Object state, Map<String, JevClient.Choice> questions,
        InteractionDecisionProvider.Resolution result) {
    }
}

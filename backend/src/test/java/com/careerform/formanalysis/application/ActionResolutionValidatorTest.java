package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

class ActionResolutionValidatorTest {

    private final ActionResolutionValidator validator =
        new ActionResolutionValidator();

    @Test
    void acceptsEveryCandidateExactlyOnce() {
        PreparationSnapshot snapshot = snapshot(
            action("action-1", Visibility.VISIBLE, null, null, null),
            action("action-2", Visibility.VISIBLE, null, null, null)
        );
        ActionResolution resolution = new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.RevealAction("action-1", "section-target"),
                new ActionResolution.NoAction("action-2")
            )
        );

        assertThatCode(() -> validator.validate(snapshot, resolution))
            .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @MethodSource("invalidHeadersAndCandidateSets")
    void rejectsHeaderOrCandidateSetMismatch(ActionResolution resolution) {
        assertInvalid(() -> validator.validate(validSnapshot(), resolution));
    }

    @Test
    void rejectsRevealTargetOutsideTheSnapshot() {
        ActionResolution resolution = new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.RevealAction("action-1", "missing-section"),
                new ActionResolution.NoAction("action-2")
            )
        );

        assertInvalid(() -> validator.validate(validSnapshot(), resolution));
    }

    @ParameterizedTest
    @MethodSource("ineligibleActionCandidates")
    void rejectsActionForIneligibleCandidate(
        PreparationSnapshot.ActionCandidate candidate
    ) {
        PreparationSnapshot snapshot = snapshot(
            candidate,
            action("action-2", Visibility.VISIBLE, null, null, null)
        );
        ActionResolution resolution = new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.AddAction("action-1"),
                new ActionResolution.NoAction("action-2")
            )
        );

        assertInvalid(() -> validator.validate(snapshot, resolution));
    }

    private static Stream<ActionResolution> invalidHeadersAndCandidateSets() {
        return Stream.of(
            new ActionResolution(1, "snapshot-1", validResults()),
            new ActionResolution(2, "another-snapshot", validResults()),
            new ActionResolution(2, "snapshot-1", List.of(
                new ActionResolution.NoAction("action-1")
            )),
            new ActionResolution(2, "snapshot-1", List.of(
                new ActionResolution.NoAction("action-1"),
                new ActionResolution.NoAction("action-1")
            )),
            new ActionResolution(2, "snapshot-1", List.of(
                new ActionResolution.NoAction("action-1"),
                new ActionResolution.NoAction("unknown-action")
            ))
        );
    }

    private static Stream<PreparationSnapshot.ActionCandidate> ineligibleActionCandidates() {
        return Stream.of(
            action("action-1", Visibility.HIDDEN, null, null, null),
            action("action-1", Visibility.VISIBLE, true, null, null),
            action("action-1", Visibility.VISIBLE, null, true, null),
            action("action-1", Visibility.VISIBLE, null, null, true)
        );
    }

    private static List<ActionResolution.Result> validResults() {
        return List.of(
            new ActionResolution.NoAction("action-1"),
            new ActionResolution.NoAction("action-2")
        );
    }

    private static PreparationSnapshot validSnapshot() {
        return snapshot(
            action("action-1", Visibility.VISIBLE, null, null, null),
            action("action-2", Visibility.VISIBLE, null, null, null)
        );
    }

    private static PreparationSnapshot snapshot(
        PreparationSnapshot.ActionCandidate first,
        PreparationSnapshot.ActionCandidate second
    ) {
        return new PreparationSnapshot(
            2,
            "snapshot-1",
            new Site("example.test", "/application/*"),
            List.of(
                new PreparationSnapshot.Section(
                    "section-actions",
                    null,
                    "버튼",
                    List.of(first, second),
                    List.of()
                ),
                new PreparationSnapshot.Section(
                    "section-target",
                    "section-actions",
                    "대상",
                    List.of(),
                    List.of()
                )
            )
        );
    }

    private static PreparationSnapshot.ActionCandidate action(
        String candidateId,
        Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {
        return new PreparationSnapshot.ActionCandidate(
            candidateId,
            FormElement.BUTTON,
            FormControl.BUTTON,
            visibility,
            "합성 버튼",
            null,
            null,
            disabled,
            readonly,
            inert
        );
    }

    private static void assertInvalid(Runnable validation) {
        assertThatThrownBy(validation::run)
            .isInstanceOf(InvalidResolverOutputException.class)
            .hasMessage("Resolver 출력 계약을 확인할 수 없습니다");
    }
}

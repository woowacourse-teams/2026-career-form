package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.AnalysisMode;
import com.careerform.formanalysis.domain.AnalysisStatus;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationAnalysis;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;
import com.careerform.formanalysis.domain.WarningCode;

import tools.jackson.databind.ObjectMapper;

class PreparationAnalysisServiceTest {

    @Test
    void reportsUnavailableWhenResolverIsAbsentEvenWithoutCandidates() {
        PreparationAnalysis analysis = service(Optional.empty()).analyze(emptySnapshot());

        assertUnavailable(analysis);
    }

    @Test
    void doesNotCallAvailableResolverWhenThereAreNoCandidates() {
        AtomicInteger calls = new AtomicInteger();
        ActionResolver resolver = snapshot -> {
            calls.incrementAndGet();
            throw new AssertionError("후보가 없으면 Resolver를 호출하면 안 됩니다");
        };

        PreparationAnalysis analysis = service(Optional.of(resolver))
            .analyze(emptySnapshot());

        assertThat(calls).hasValue(0);
        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.preparationPlans()).isEmpty();
        assertThat(analysis.warningCodes()).isNull();
    }

    @Test
    void mapsOnlyActionsInSnapshotTraversalOrder() {
        ActionResolver resolver = ignored -> new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.RevealAction("action-item", "section-target"),
                new ActionResolution.AddAction("action-direct")
            )
        );

        PreparationAnalysis analysis = service(Optional.of(resolver))
            .analyze(snapshot());

        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.preparationPlans()).containsExactly(
            new PreparationAnalysis.AddRepeatableGroupPlan(
                "action-direct",
                PreparationAnalysis.Command.ADD_REPEATABLE_GROUP,
                PreparationAnalysis.ExpectedEffect.GROUP_COUNT_INCREMENT
            ),
            new PreparationAnalysis.RevealSectionPlan(
                "action-item",
                PreparationAnalysis.Command.REVEAL_SECTION,
                PreparationAnalysis.ExpectedEffect.TARGET_VISIBLE,
                "section-target"
            )
        );
    }

    @Test
    void treatsAllNoActionAsCompleteEmptyPlans() {
        ActionResolver resolver = ignored -> new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.NoAction("action-item"),
                new ActionResolution.NoAction("action-direct")
            )
        );

        PreparationAnalysis analysis = service(Optional.of(resolver))
            .analyze(snapshot());

        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.COMPLETE);
        assertThat(analysis.preparationPlans()).isEmpty();
        assertThat(analysis.warningCodes()).isNull();
    }

    @Test
    void discardsAllResultsWhenResolverIsUnavailable() {
        ActionResolver resolver = ignored -> {
            throw new ResolverUnavailableException("private-provider-marker");
        };

        PreparationAnalysis analysis = service(Optional.of(resolver))
            .analyze(snapshot());

        assertUnavailable(analysis);
    }

    @Test
    void discardsValidSubsetWhenResolverOutputIsIncomplete() {
        ActionResolver resolver = ignored -> new ActionResolution(
            2,
            "snapshot-1",
            List.of(new ActionResolution.AddAction("action-direct"))
        );

        PreparationAnalysis analysis = service(Optional.of(resolver))
            .analyze(snapshot());

        assertUnavailable(analysis);
    }

    @Test
    void doesNotConvertUnexpectedApplicationBugToLlmUnavailable() {
        ActionResolver resolver = ignored -> {
            throw new IllegalStateException("synthetic-local-bug");
        };

        assertThatThrownBy(() -> service(Optional.of(resolver)).analyze(snapshot()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic-local-bug");
    }

    @Test
    void serializesRevealPlanWithOnlyTheExternalContractProperties() {
        PreparationAnalysis analysis = PreparationAnalysis.complete(
            "snapshot-1",
            List.of(new PreparationAnalysis.RevealSectionPlan(
                "action-1",
                PreparationAnalysis.Command.REVEAL_SECTION,
                PreparationAnalysis.ExpectedEffect.TARGET_VISIBLE,
                "section-target"
            ))
        );

        assertThat(new ObjectMapper().writeValueAsString(analysis)).isEqualTo(
            "{\"snapshotId\":\"snapshot-1\",\"mode\":\"GENERIC\","
                + "\"analysisStatus\":\"COMPLETE\",\"preparationPlans\":[{"
                + "\"actionCandidateId\":\"action-1\","
                + "\"command\":\"REVEAL_SECTION\","
                + "\"expectedEffect\":\"TARGET_VISIBLE\","
                + "\"targetSectionId\":\"section-target\"}]}"
        );
    }

    private static PreparationAnalysisService service(
        Optional<ActionResolver> resolver
    ) {
        return new PreparationAnalysisService(
            resolver,
            new SnapshotValidator(),
            new ActionResolutionValidator()
        );
    }

    private static void assertUnavailable(PreparationAnalysis analysis) {
        assertThat(analysis.mode()).isEqualTo(AnalysisMode.GENERIC);
        assertThat(analysis.analysisStatus()).isEqualTo(AnalysisStatus.PARTIAL);
        assertThat(analysis.warningCodes()).containsExactly(WarningCode.LLM_UNAVAILABLE);
        assertThat(analysis.preparationPlans()).isEmpty();
    }

    private static PreparationSnapshot emptySnapshot() {
        return new PreparationSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new PreparationSnapshot.Section(
                "section-actions",
                null,
                "버튼",
                List.of(),
                List.of()
            ))
        );
    }

    private static PreparationSnapshot snapshot() {
        return new PreparationSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(
                new PreparationSnapshot.Section(
                    "section-actions",
                    null,
                    "버튼",
                    List.of(action("action-direct")),
                    List.of(new PreparationSnapshot.Item(
                        "item-1",
                        List.of(action("action-item"))
                    ))
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

    private static PreparationSnapshot.ActionCandidate action(String candidateId) {
        return new PreparationSnapshot.ActionCandidate(
            candidateId,
            FormElement.BUTTON,
            FormControl.BUTTON,
            Visibility.VISIBLE,
            "합성 버튼",
            null,
            null,
            null,
            null,
            null
        );
    }

    private static Site site() {
        return new Site("example.test", "/application/*");
    }
}

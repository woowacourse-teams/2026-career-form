package com.careerform.formanalysis.domain;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PreparationAnalysis(
    String snapshotId,
    AnalysisMode mode,
    AnalysisStatus analysisStatus,
    List<PreparationPlan> preparationPlans,
    List<WarningCode> warningCodes,
    BlockCode blockCode
) {

    public PreparationAnalysis {
        preparationPlans = List.copyOf(preparationPlans);
        warningCodes = warningCodes == null ? null : List.copyOf(warningCodes);
    }

    public static PreparationAnalysis complete(
        String snapshotId,
        List<PreparationPlan> plans
    ) {
        return new PreparationAnalysis(
            snapshotId,
            AnalysisMode.GENERIC,
            AnalysisStatus.COMPLETE,
            plans,
            null,
            null
        );
    }

    public static PreparationAnalysis llmUnavailable(String snapshotId) {
        return new PreparationAnalysis(
            snapshotId,
            AnalysisMode.GENERIC,
            AnalysisStatus.PARTIAL,
            List.of(),
            List.of(WarningCode.LLM_UNAVAILABLE),
            null
        );
    }

    public sealed interface PreparationPlan permits RevealSectionPlan,
        AddRepeatableGroupPlan {
        String actionCandidateId();
    }

    public record RevealSectionPlan(
        String actionCandidateId,
        Command command,
        ExpectedEffect expectedEffect,
        String targetSectionId
    ) implements PreparationPlan {
    }

    public record AddRepeatableGroupPlan(
        String actionCandidateId,
        Command command,
        ExpectedEffect expectedEffect
    ) implements PreparationPlan {
    }

    public enum Command {
        REVEAL_SECTION,
        ADD_REPEATABLE_GROUP
    }

    public enum ExpectedEffect {
        TARGET_VISIBLE,
        GROUP_COUNT_INCREMENT
    }

    public enum BlockCode {
        ADAPTER_STRUCTURE_MISMATCH,
        UNSUPPORTED_SNAPSHOT
    }
}

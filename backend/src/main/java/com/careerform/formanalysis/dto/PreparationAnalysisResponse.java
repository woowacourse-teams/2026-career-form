package com.careerform.formanalysis.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PreparationAnalysisResponse(
    String snapshotId,
    Mode mode,
    AnalysisStatus analysisStatus,
    List<PreparationPlan> preparationPlans,
    List<WarningCode> warningCodes,
    BlockCode blockCode
) {

    public PreparationAnalysisResponse {
        preparationPlans = List.copyOf(preparationPlans);
        warningCodes = warningCodes == null ? null : List.copyOf(warningCodes);
    }

    public static PreparationAnalysisResponse complete(
        String snapshotId,
        List<PreparationPlan> plans
    ) {
        return complete(snapshotId, Mode.GENERIC, plans);
    }

    public static PreparationAnalysisResponse complete(
        String snapshotId,
        Mode mode,
        List<PreparationPlan> plans
    ) {
        return new PreparationAnalysisResponse(
            snapshotId,
            mode,
            AnalysisStatus.COMPLETE,
            plans,
            null,
            null
        );
    }

    public static PreparationAnalysisResponse llmUnavailable(String snapshotId) {
        return new PreparationAnalysisResponse(
            snapshotId,
            Mode.GENERIC,
            AnalysisStatus.PARTIAL,
            List.of(),
            List.of(WarningCode.LLM_UNAVAILABLE),
            null
        );
    }

    public static PreparationAnalysisResponse adapterStructureMismatch(
        String snapshotId
    ) {
        return new PreparationAnalysisResponse(
            snapshotId,
            Mode.ADAPTER,
            AnalysisStatus.BLOCKED,
            List.of(),
            null,
            BlockCode.ADAPTER_STRUCTURE_MISMATCH
        );
    }

    public static PreparationAnalysisResponse adapterPolicyUnavailable(
        String snapshotId
    ) {
        return new PreparationAnalysisResponse(
            snapshotId,
            Mode.ADAPTER,
            AnalysisStatus.BLOCKED,
            List.of(),
            null,
            BlockCode.ADAPTER_POLICY_UNAVAILABLE
        );
    }

    public sealed interface PreparationPlan permits RevealSectionPlan,
        AddRepeatableGroupPlan, SelectOptionToRevealPlan {
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

    public record SelectOptionToRevealPlan(
        String actionCandidateId,
        Command command,
        ExpectedEffect expectedEffect,
        String profileFieldKey,
        String targetSectionId
    ) implements PreparationPlan {
    }

    public enum Mode {
        ADAPTER,
        GENERIC
    }

    public enum AnalysisStatus {
        COMPLETE,
        PARTIAL,
        BLOCKED
    }

    public enum WarningCode {
        MANUAL_REVEAL_REQUIRED,
        LLM_UNAVAILABLE
    }

    public enum Command {
        REVEAL_SECTION,
        ADD_REPEATABLE_GROUP,
        SELECT_OPTION_TO_REVEAL
    }

    public enum ExpectedEffect {
        TARGET_VISIBLE,
        GROUP_COUNT_INCREMENT,
        TARGET_FIELDS_VISIBLE
    }

    public enum BlockCode {
        ADAPTER_STRUCTURE_MISMATCH,
        ADAPTER_POLICY_UNAVAILABLE,
        UNSUPPORTED_SNAPSHOT
    }
}

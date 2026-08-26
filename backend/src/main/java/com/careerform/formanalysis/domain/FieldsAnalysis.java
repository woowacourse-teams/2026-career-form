package com.careerform.formanalysis.domain;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldsAnalysis(
    String snapshotId,
    AnalysisMode mode,
    AnalysisStatus analysisStatus,
    List<FieldAnalysis> fields,
    List<WarningCode> warningCodes,
    BlockCode blockCode
) {

    public FieldsAnalysis {
        fields = List.copyOf(fields);
        warningCodes = warningCodes == null ? null : List.copyOf(warningCodes);
    }

    public static FieldsAnalysis complete(
        String snapshotId,
        List<FieldAnalysis> fields
    ) {
        return new FieldsAnalysis(
            snapshotId,
            AnalysisMode.GENERIC,
            AnalysisStatus.COMPLETE,
            fields,
            null,
            null
        );
    }

    public static FieldsAnalysis llmUnavailable(String snapshotId) {
        return new FieldsAnalysis(
            snapshotId,
            AnalysisMode.GENERIC,
            AnalysisStatus.PARTIAL,
            List.of(),
            List.of(WarningCode.LLM_UNAVAILABLE),
            null
        );
    }

    public sealed interface FieldAnalysis permits MatchedFieldAnalysis,
        NoMatchFieldAnalysis {
        String candidateId();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MatchedFieldAnalysis(
        String candidateId,
        MatchType matchType,
        String profileFieldKey,
        AutofillPolicy autofillPolicy,
        MappingStatus mappingStatus,
        InteractionStatus interactionStatus,
        WritePlan writePlan
    ) implements FieldAnalysis {
    }

    public record NoMatchFieldAnalysis(
        String candidateId,
        MatchType matchType,
        MappingStatus mappingStatus,
        InteractionStatus interactionStatus,
        List<ReasonCode> reasonCodes
    ) implements FieldAnalysis {

        public NoMatchFieldAnalysis {
            reasonCodes = List.copyOf(reasonCodes);
        }
    }

    public enum MatchType {
        MATCH,
        NO_MATCH
    }

    public enum MappingStatus {
        ADAPTER_VERIFIED,
        LLM_SUGGESTED
    }

    public enum InteractionStatus {
        READY,
        MANUAL_REVEAL_REQUIRED,
        BLOCKED,
        SYSTEM_CONTROL,
        UNVERIFIED
    }

    public enum ReasonCode {
        NO_MATCH
    }

    public enum WriteCommand {
        SET_TEXT,
        SELECT_OPTION,
        CHECK_RADIO,
        CHECK_CHECKBOX
    }

    public record WritePlan(WriteCommand command) {
    }

    public enum BlockCode {
        ADAPTER_STRUCTURE_MISMATCH
    }
}

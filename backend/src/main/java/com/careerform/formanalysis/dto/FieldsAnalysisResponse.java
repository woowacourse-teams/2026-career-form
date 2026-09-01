package com.careerform.formanalysis.dto;

import java.util.List;

import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldsAnalysisResponse(
    String snapshotId,
    Mode mode,
    AnalysisStatus analysisStatus,
    List<FieldAnalysis> fields,
    List<WarningCode> warningCodes,
    BlockCode blockCode
) {

    public FieldsAnalysisResponse {
        fields = List.copyOf(fields);
        warningCodes = warningCodes == null ? null : List.copyOf(warningCodes);
    }

    public static FieldsAnalysisResponse complete(
        String snapshotId,
        List<FieldAnalysis> fields
    ) {
        return complete(snapshotId, Mode.GENERIC, fields);
    }

    public static FieldsAnalysisResponse complete(
        String snapshotId,
        Mode mode,
        List<FieldAnalysis> fields
    ) {
        return new FieldsAnalysisResponse(
            snapshotId,
            mode,
            AnalysisStatus.COMPLETE,
            fields,
            null,
            null
        );
    }

    public static FieldsAnalysisResponse llmUnavailable(String snapshotId) {
        return new FieldsAnalysisResponse(
            snapshotId,
            Mode.GENERIC,
            AnalysisStatus.PARTIAL,
            List.of(),
            List.of(WarningCode.LLM_UNAVAILABLE),
            null
        );
    }

    public static FieldsAnalysisResponse adapterStructureMismatch(String snapshotId) {
        return new FieldsAnalysisResponse(
            snapshotId,
            Mode.ADAPTER,
            AnalysisStatus.BLOCKED,
            List.of(),
            null,
            BlockCode.ADAPTER_STRUCTURE_MISMATCH
        );
    }

    public static FieldsAnalysisResponse adapterPolicyUnavailable(String snapshotId) {
        return new FieldsAnalysisResponse(
            snapshotId,
            Mode.ADAPTER,
            AnalysisStatus.BLOCKED,
            List.of(),
            null,
            BlockCode.ADAPTER_POLICY_UNAVAILABLE
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
        ValueBinding valueBinding,
        AutofillPolicy autofillPolicy,
        MappingStatus mappingStatus,
        InteractionStatus interactionStatus,
        WritePlan writePlan
    ) implements FieldAnalysis {

        public MatchedFieldAnalysis(
            String candidateId,
            MatchType matchType,
            String profileFieldKey,
            AutofillPolicy autofillPolicy,
            MappingStatus mappingStatus,
            InteractionStatus interactionStatus,
            WritePlan writePlan
        ) {
            this(candidateId, matchType, new DirectBinding(profileFieldKey), autofillPolicy,
                mappingStatus, interactionStatus, writePlan);
        }
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
        UNRESOLVED_FIELD,
        LLM_UNAVAILABLE
    }

    public enum MatchType {
        MATCH,
        NO_MATCH
    }

    public enum AutofillPolicy {
        ALLOWED,
        CONDITIONAL,
        SENSITIVE_CONFIRMATION
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
        ADAPTER_STRUCTURE_MISMATCH,
        ADAPTER_POLICY_UNAVAILABLE
    }
}

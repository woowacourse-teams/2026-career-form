package com.careerform.formanalysis.generic;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/** 섹션 분류 응답과 같은 봉투(schemaVersion, status)를 쓴다. 진단에는 값 없이 호출 수와 시간만 담는다. */
public record GenericFieldsResponse(
    int schemaVersion,
    String snapshotId,
    Status status,
    List<Field> fields,
    Diagnostics diagnostics
) {

    private static final int SCHEMA_VERSION = 2;

    public GenericFieldsResponse {
        fields = List.copyOf(fields);
    }

    public static GenericFieldsResponse complete(String snapshotId, List<Field> fields, Diagnostics diagnostics) {
        return new GenericFieldsResponse(SCHEMA_VERSION, snapshotId, Status.COMPLETE, fields, diagnostics);
    }

    public static GenericFieldsResponse staticPolicyPresent(String snapshotId) {
        return new GenericFieldsResponse(SCHEMA_VERSION, snapshotId, Status.STATIC_POLICY_PRESENT, List.of(),
            new Diagnostics(0, 0));
    }

    public static GenericFieldsResponse policyUnavailable(String snapshotId) {
        return new GenericFieldsResponse(SCHEMA_VERSION, snapshotId, Status.POLICY_UNAVAILABLE, List.of(),
            new Diagnostics(0, 0));
    }

    /**
     * profileFieldKey는 매핑하지 못하면 null이다. reason은 공급자를 쓸 수 없을 때만 담는다.
     * autofillPolicy는 키가 있을 때만, writePlan은 interactionStatus가 READY일 때만 담는다.
     */
    public record Field(
        String candidateId,
        String profileFieldKey,
        double confidence,
        boolean categoryConfirmed,
        @JsonInclude(JsonInclude.Include.NON_NULL) Reason reason,
        @JsonInclude(JsonInclude.Include.NON_NULL) AutofillPolicy autofillPolicy,
        InteractionStatus interactionStatus,
        @JsonInclude(JsonInclude.Include.NON_NULL) WritePlan writePlan
    ) {

        /** 입력 판정 없이 만든 칸. 쓰기 근거가 없으므로 UNVERIFIED로 두고 autofillPolicy와 writePlan을 비운다. */
        public Field(String candidateId, String profileFieldKey, double confidence, boolean categoryConfirmed,
            Reason reason) {
            this(candidateId, profileFieldKey, confidence, categoryConfirmed, reason, null,
                InteractionStatus.UNVERIFIED, null);
        }
    }

    public record WritePlan(GenericFieldsRequest.WriteCommand command) {
    }

    public record Diagnostics(int jevCalls, long elapsedMs) {
    }

    /** 공유 응답 DTO에 의존하지 않도록 공유 열거형과 같은 상수 이름으로 복제한다. */
    public enum AutofillPolicy {
        ALLOWED,
        CONDITIONAL,
        SENSITIVE_CONFIRMATION
    }

    /** 공유 응답 DTO에 의존하지 않도록 공유 열거형과 같은 상수 이름으로 복제한다. */
    public enum InteractionStatus {
        READY,
        MANUAL_REVEAL_REQUIRED,
        BLOCKED,
        SYSTEM_CONTROL,
        UNVERIFIED
    }

    public enum Reason {
        LLM_UNAVAILABLE
    }

    public enum Status {
        COMPLETE,
        STATIC_POLICY_PRESENT,
        POLICY_UNAVAILABLE
    }
}

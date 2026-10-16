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

    private static final int SCHEMA_VERSION = 1;

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

    /** profileFieldKey는 매핑하지 못하면 null이다. reason은 공급자를 쓸 수 없을 때만 담는다. */
    public record Field(
        String candidateId,
        String profileFieldKey,
        double confidence,
        boolean categoryConfirmed,
        @JsonInclude(JsonInclude.Include.NON_NULL) Reason reason
    ) {
    }

    public record Diagnostics(int jevCalls, long elapsedMs) {
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

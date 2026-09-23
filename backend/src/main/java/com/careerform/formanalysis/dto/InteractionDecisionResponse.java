package com.careerform.formanalysis.dto;

import java.util.List;

import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;

public record InteractionDecisionResponse(
    int schemaVersion,
    String snapshotId,
    Status status,
    Mode mode,
    List<Decision> decisions
) {

    public InteractionDecisionResponse {
        decisions = List.copyOf(decisions);
    }

    public static InteractionDecisionResponse complete(
        String snapshotId,
        List<Decision> decisions
    ) {
        return new InteractionDecisionResponse(
            2,
            snapshotId,
            Status.COMPLETE,
            Mode.GENERIC,
            decisions
        );
    }

    public static InteractionDecisionResponse llmUnavailable(String snapshotId) {
        return new InteractionDecisionResponse(
            2,
            snapshotId,
            Status.LLM_UNAVAILABLE,
            Mode.GENERIC,
            List.of()
        );
    }

    public static InteractionDecisionResponse staticPolicyPresent(String snapshotId) {
        return blocked(snapshotId, Status.STATIC_POLICY_PRESENT);
    }

    public static InteractionDecisionResponse policyUnavailable(String snapshotId) {
        return blocked(snapshotId, Status.POLICY_UNAVAILABLE);
    }

    private static InteractionDecisionResponse blocked(
        String snapshotId,
        Status status
    ) {
        return new InteractionDecisionResponse(
            2,
            snapshotId,
            status,
            null,
            List.of()
        );
    }

    public record Decision(
        String decisionId,
        Role role,
        Selection selection,
        String candidateId
    ) {
        public static Decision selected(
            String decisionId,
            Role role,
            String candidateId
        ) {
            return new Decision(
                decisionId,
                role,
                Selection.SELECTED,
                candidateId
            );
        }

        public static Decision abstained(String decisionId, Role role) {
            return new Decision(
                decisionId,
                role,
                Selection.ABSTAINED,
                null
            );
        }
    }

    public enum Status {
        COMPLETE,
        LLM_UNAVAILABLE,
        STATIC_POLICY_PRESENT,
        POLICY_UNAVAILABLE
    }

    public enum Mode {
        GENERIC
    }

    public enum Selection {
        SELECTED,
        ABSTAINED
    }
}

package com.careerform.formanalysis.application.port;

import java.util.List;

import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;

public interface InteractionDecisionProvider {

    Resolution decide(Batch batch);

    record Batch(
        int schemaVersion,
        List<Decision> decisions
    ) {
        public Batch {
            decisions = List.copyOf(decisions);
        }
    }

    record Decision(
        String decisionId,
        Role role,
        String canonicalFieldKey,
        List<Candidate> candidates
    ) {
        public Decision {
            candidates = List.copyOf(candidates);
        }
    }

    record Candidate(
        String candidateId,
        Element element,
        Control control,
        Visibility visibility,
        boolean disabled,
        boolean readonly,
        boolean inert,
        RelationToTarget relationToTarget,
        List<SemanticLabel> labels,
        boolean required
    ) {
        public Candidate {
            labels = List.copyOf(labels);
        }
    }

    record SemanticLabel(String source, String text) {
    }

    record Resolution(
        int schemaVersion,
        List<Result> results
    ) {
        public Resolution {
            results = results == null ? null : List.copyOf(results);
        }
    }

    sealed interface Result permits Selected, Abstained {
        String decisionId();
        Role role();
    }

    record Selected(
        String decisionId,
        Role role,
        String candidateId
    ) implements Result {
    }

    record Abstained(String decisionId, Role role) implements Result {
    }
}

package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.FormAnalysisConstraints;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Visibility;

public final class ActionResolutionValidator {

    private static final String INVALID_MESSAGE =
        "Resolver 출력 계약을 확인할 수 없습니다";

    public void validate(
        PreparationSnapshot snapshot,
        ActionResolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != FormAnalysisConstraints.SCHEMA_VERSION
            || !snapshot.snapshotId().equals(resolution.snapshotId())
            || resolution.results() == null) {
            invalid();
        }

        Map<String, PreparationSnapshot.ActionCandidate> candidates = new HashMap<>();
        for (PreparationSnapshot.ActionCandidate candidate
            : snapshot.actionCandidatesInTraversalOrder()) {
            candidates.put(candidate.candidateId(), candidate);
        }
        Set<String> sectionIds = new HashSet<>();
        for (PreparationSnapshot.Section section : snapshot.sections()) {
            sectionIds.add(section.sectionId());
        }

        Set<String> resultIds = new HashSet<>();
        for (ActionResolution.Result result : resolution.results()) {
            if (result == null
                || result.candidateId() == null
                || !resultIds.add(result.candidateId())) {
                invalid();
            }
            PreparationSnapshot.ActionCandidate candidate =
                candidates.get(result.candidateId());
            if (candidate == null) {
                invalid();
            }
            validateAction(result, candidate, sectionIds);
        }
        if (!resultIds.equals(candidates.keySet())) {
            invalid();
        }
    }

    private static void validateAction(
        ActionResolution.Result result,
        PreparationSnapshot.ActionCandidate candidate,
        Set<String> sectionIds
    ) {
        if (result instanceof ActionResolution.NoAction) {
            return;
        }
        if (!eligible(candidate)) {
            invalid();
        }
        if (result instanceof ActionResolution.RevealAction reveal
            && (reveal.targetSectionId() == null
                || !sectionIds.contains(reveal.targetSectionId()))) {
            invalid();
        }
    }

    private static boolean eligible(PreparationSnapshot.ActionCandidate candidate) {
        return candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.disabled())
            && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }

    private static void invalid() {
        throw new InvalidResolverOutputException(INVALID_MESSAGE);
    }
}

package com.careerform.formanalysis.application;

import java.util.HashSet;
import java.util.Set;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormAnalysisConstraints;
import com.careerform.formanalysis.domain.ProfileFieldCatalog;

public final class FieldMappingResolutionValidator {

    private static final String INVALID_MESSAGE =
        "Resolver 출력 계약을 확인할 수 없습니다";

    public void validate(
        FieldsSnapshot snapshot,
        FieldMappingResolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != FormAnalysisConstraints.SCHEMA_VERSION
            || !snapshot.snapshotId().equals(resolution.snapshotId())
            || resolution.results() == null) {
            invalid();
        }

        Set<String> candidateIds = new HashSet<>(
            snapshot.fieldCandidateIdsInTraversalOrder()
        );
        Set<String> resultIds = new HashSet<>();
        for (FieldMappingResolution.Result result : resolution.results()) {
            if (result == null
                || result.candidateId() == null
                || !resultIds.add(result.candidateId())
                || !candidateIds.contains(result.candidateId())) {
                invalid();
            }
            if (result instanceof FieldMappingResolution.Match match
                && !ProfileFieldCatalog.contains(match.profileFieldKey())) {
                invalid();
            }
        }
        if (!resultIds.equals(candidateIds)) {
            invalid();
        }
    }

    private static void invalid() {
        throw new InvalidResolverOutputException(INVALID_MESSAGE);
    }
}

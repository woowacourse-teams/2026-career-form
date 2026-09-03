package com.careerform.formanalysis.application.policy;

import java.util.Set;
import java.util.stream.Collectors;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;

public final class StoredPolicyFingerprint {

    public boolean matches(
        CompanyFormPolicy policy,
        PreparationAnalysisRequest request
    ) {
        Set<String> sectionIds = request.sections().stream()
            .map(PreparationAnalysisRequest.Section::sectionId)
            .collect(Collectors.toSet());
        if (!sectionIds.containsAll(
            policy.preparationFingerprint().requiredSectionIds()
        )) {
            return false;
        }
        return policy.preparationFingerprint().requiredActions().stream()
            .allMatch(required -> request.actionCandidatesInTraversalOrder().stream()
                .anyMatch(candidate -> matches(required, candidate)));
    }

    public boolean matches(
        CompanyFormPolicy policy,
        FieldsAnalysisRequest request
    ) {
        Set<String> sectionIds = request.sections().stream()
            .map(FieldsAnalysisRequest.Section::sectionId)
            .collect(Collectors.toSet());
        if (!sectionIds.containsAll(policy.fieldsFingerprint().requiredSectionIds())) {
            return false;
        }
        return policy.fieldsFingerprint().requiredFields().stream()
            .allMatch(required -> request.fieldCandidatesInTraversalOrder().stream()
                .anyMatch(candidate -> matches(required, candidate)));
    }

    private static boolean matches(
        ActionStructure required,
        ActionCandidate candidate
    ) {
        return required.structuralNames().stream().anyMatch(name -> PolicyStructuralMetadata.matches(
                name, candidate.domId(), candidate.domName(), candidate.displayName()))
            && required.element() == candidate.element()
            && required.control() == candidate.control();
    }

    private static boolean matches(
        FieldStructure required,
        FieldCandidate candidate
    ) {
        return required.structuralName().equals(candidate.domName())
            && required.element() == candidate.element()
            && required.control() == candidate.control();
    }
}

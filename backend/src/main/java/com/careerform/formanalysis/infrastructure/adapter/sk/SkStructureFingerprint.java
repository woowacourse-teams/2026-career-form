package com.careerform.formanalysis.infrastructure.adapter.sk;

import java.util.Locale;
import java.util.Set;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;

final class SkStructureFingerprint {

    private static final String HOST = "www.skcareers.com";
    private static final String APPLICATION_PATH_PREFIX = "/Recruit/Apply/";
    private static final Set<String> REQUIRED_ACTION_NAMES = Set.of(
        "detail-toggle",
        "credential-add"
    );
    private static final Set<String> REQUIRED_FIELD_NAMES = Set.of(
        "applicant-family-name",
        "applicant-given-name",
        "applicant-email",
        "applicant-phone",
        "education-school-name",
        "education-completion-status"
    );

    boolean isCandidate(PreparationAnalysisRequest request) {
        return isCandidate(request.site().host(), request.site().pathPattern());
    }

    boolean isCandidate(FieldsAnalysisRequest request) {
        return isCandidate(request.site().host(), request.site().pathPattern());
    }

    boolean matches(PreparationAnalysisRequest request) {
        Set<String> sectionIds = request.sections().stream()
            .map(PreparationAnalysisRequest.Section::sectionId)
            .collect(java.util.stream.Collectors.toSet());
        Set<String> actionNames = request.actionCandidatesInTraversalOrder().stream()
            .filter(SkStructureFingerprint::isSupportedButton)
            .map(ActionCandidate::domName)
            .collect(java.util.stream.Collectors.toSet());
        return sectionIds.containsAll(Set.of(
            "section-profile",
            "section-detail",
            "section-credentials"
        )) && actionNames.containsAll(REQUIRED_ACTION_NAMES);
    }

    boolean matches(FieldsAnalysisRequest request) {
        Set<String> sectionIds = request.sections().stream()
            .map(FieldsAnalysisRequest.Section::sectionId)
            .collect(java.util.stream.Collectors.toSet());
        Set<String> fieldNames = request.fieldCandidatesInTraversalOrder().stream()
            .filter(SkStructureFingerprint::isSupportedFieldControl)
            .map(FieldCandidate::domName)
            .collect(java.util.stream.Collectors.toSet());
        return sectionIds.containsAll(Set.of("section-profile", "section-education"))
            && fieldNames.containsAll(REQUIRED_FIELD_NAMES);
    }

    private static boolean isCandidate(String host, String pathPattern) {
        return normalizeHost(host).equals(HOST)
            && pathPattern.startsWith(APPLICATION_PATH_PREFIX);
    }

    private static String normalizeHost(String host) {
        String normalized = host.toLowerCase(Locale.ROOT);
        return normalized.endsWith(".")
            ? normalized.substring(0, normalized.length() - 1)
            : normalized;
    }

    private static boolean isSupportedButton(ActionCandidate candidate) {
        return candidate.element() == PreparationAnalysisRequest.FormElement.BUTTON
            && candidate.control() == PreparationAnalysisRequest.FormControl.BUTTON
            && candidate.domName() != null;
    }

    private static boolean isSupportedFieldControl(FieldCandidate candidate) {
        if (candidate.domName() == null) {
            return false;
        }
        return candidate.element() == FieldsAnalysisRequest.FormElement.INPUT
            && candidate.control() == FieldsAnalysisRequest.FormControl.TEXT
            || candidate.element() == FieldsAnalysisRequest.FormElement.SELECT
            && candidate.control() == FieldsAnalysisRequest.FormControl.SELECT;
    }
}

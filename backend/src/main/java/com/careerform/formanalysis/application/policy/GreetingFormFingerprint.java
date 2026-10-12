package com.careerform.formanalysis.application.policy;

import java.util.List;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

public final class GreetingFormFingerprint {

    public static final String NAME = "basicInformation.name";
    public static final String PHONE = "basicInformation.phoneNumber.nationalNumber";

    public boolean matches(FieldsAnalysisRequest request) {
        return hasOneTopLevelInput(request, NAME)
            && hasOneTopLevelInput(request, PHONE);
    }

    private static boolean hasOneTopLevelInput(
        FieldsAnalysisRequest request,
        String semanticName
    ) {
        List<FieldCandidate> matches = request.fieldCandidatesInTraversalOrder().stream()
            .filter(candidate -> semanticName.equals(candidate.domName()))
            .toList();
        if (matches.size() != 1) {
            return false;
        }
        FieldCandidate candidate = matches.getFirst();
        return request.sections().stream()
                .flatMap(section -> section.fields().stream())
                .anyMatch(field -> field == candidate)
            && candidate.element() == FormElement.INPUT
            && candidate.control() == FormControl.TEXT
            && candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }
}

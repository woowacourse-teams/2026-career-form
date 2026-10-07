package com.careerform.formanalysis.application.policy;

import java.util.Set;
import java.util.regex.Pattern;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;

/** Only FE-verified repeated-section add buttons participate in Greeting preparation. */
public final class GreetingActionResolver implements ActionResolver {
    private static final Set<String> ADD_IDS = Set.of(
        "greeting:add:universities", "greeting:add:graduateSchools", "greeting:add:workExperiences",
        "greeting:add:certifiedLanguageTests", "greeting:add:foreignLanguageProficiencies", "greeting:add:certificatesLicenses",
        "greeting:add:projects");

    private static final String ADDRESS_SEARCH_ID = "greeting:search:address";

    private static final Pattern MAJOR_ADD = Pattern.compile(
        "^greeting:add:(?:graduateSchools|universities):(0|[1-9][0-9]{0,2}):majors$");

    @Override
    public Resolution resolve(PreparationAnalysisRequest request) {
        var candidates = request.actionCandidatesInTraversalOrder();
        return new Resolution(request.schemaVersion(), request.snapshotId(), candidates.stream()
            .<Result>map(candidate -> eligible(candidate)
                && candidates.stream().filter(GreetingActionResolver::eligible)
                    .filter(other -> candidate.domId().equals(other.domId())).count() == 1
                    ? ADDRESS_SEARCH_ID.equals(candidate.domId())
                        ? new SearchAddressAction(candidate.candidateId())
                        : new AddAction(candidate.candidateId())
                    : new NoAction(candidate.candidateId()))
            .toList());
    }

    private static boolean supportedAddId(String domId) {
        if (ADD_IDS.contains(domId) || ADDRESS_SEARCH_ID.equals(domId)) return true;
        var majorAdd = MAJOR_ADD.matcher(domId);
        return majorAdd.matches() && Integer.parseInt(majorAdd.group(1)) <= 127;
    }

    private static boolean eligible(ActionCandidate candidate) {
        return candidate.domId() != null && supportedAddId(candidate.domId())
            && candidate.element() == FormElement.BUTTON && candidate.control() == FormControl.BUTTON
            && candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.disabled()) && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }
}

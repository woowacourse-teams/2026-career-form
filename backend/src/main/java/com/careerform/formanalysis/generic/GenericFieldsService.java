package com.careerform.formanalysis.generic;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Diagnostics;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Field;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Reason;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;

@Service
public final class GenericFieldsService {

    private final Optional<JevCategoryFieldResolver> resolver;
    private final FormAnalysisRouter router;
    private final GenericFieldPolicy fieldPolicy;

    public GenericFieldsService(Optional<JevCategoryFieldResolver> resolver, FormAnalysisRouter router,
        FieldInteractionPolicy interactionPolicy, SupportedProfileFields supportedProfileFields) {
        this.resolver = resolver;
        this.router = router;
        this.fieldPolicy = new GenericFieldPolicy(interactionPolicy, supportedProfileFields);
    }

    public GenericFieldsResponse analyze(GenericFieldsRequest request) {
        validate(request);
        GenericRouteKind route = router.routeGeneric(request.site().host(), request.site().pathPattern());
        if (route == GenericRouteKind.STATIC_POLICY_PRESENT) {
            return GenericFieldsResponse.staticPolicyPresent(request.snapshotId());
        }
        if (route == GenericRouteKind.POLICY_UNAVAILABLE) {
            return GenericFieldsResponse.policyUnavailable(request.snapshotId());
        }
        long startedAt = System.nanoTime();
        Map<String, Mapping> mappings = new HashMap<>();
        for (Section section : request.sections()) {
            List<FieldCandidate> candidates = new ArrayList<>(section.fields());
            if (section.items() != null) {
                section.items().forEach(item -> candidates.addAll(item.fields()));
            }
            for (FieldCandidate candidate : candidates) {
                String key = GenericProfileSemantics.certificateDateKey(section.category(), candidate);
                if (key != null) {
                    mappings.put(candidate.candidateId(), new Mapping(key, 1.0, true, null));
                }
            }
        }
        int jevCalls = 0;
        if (resolver.isPresent()) {
            JevCategoryFieldResolver.Resolution resolution = resolver.get().resolve(request);
            resolution.mappings().forEach(mappings::putIfAbsent);
            jevCalls = resolution.jevCalls();
        }
        List<Field> fields = new ArrayList<>();
        for (FieldCandidate candidate : request.fieldCandidatesInTraversalOrder()) {
            Mapping mapping = mappings.get(candidate.candidateId());
            if (mapping == null) {
                mapping = new Mapping(null, 0.0, false, Reason.LLM_UNAVAILABLE);
            }
            GenericFieldPolicy.Assessment assessment =
                fieldPolicy.assess(candidate, mapping.profileFieldKey(), mapping.binding(),
                    request.supportedWriteCommands());
            fields.add(new Field(candidate.candidateId(), mapping.profileFieldKey(), mapping.confidence(),
                mapping.categoryConfirmed(), mapping.reason(), assessment.autofillPolicy(),
                assessment.interactionStatus(), assessment.writePlan(), mapping.binding()));
        }
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
        return GenericFieldsResponse.complete(request.snapshotId(), fields, new Diagnostics(jevCalls, elapsedMs));
    }

    private static void validate(GenericFieldsRequest request) {
        Set<String> sectionIds = new HashSet<>();
        for (Section section : request.sections()) {
            if (!sectionIds.add(section.sectionId())) {
                invalid();
            }
        }
        for (Section section : request.sections()) {
            String parent = section.parentSectionId();
            if (parent != null && (parent.equals(section.sectionId()) || !sectionIds.contains(parent))) {
                invalid();
            }
        }
        Set<String> candidateIds = new HashSet<>();
        for (FieldCandidate candidate : request.fieldCandidatesInTraversalOrder()) {
            if (!candidateIds.add(candidate.candidateId())) {
                invalid();
            }
        }
    }

    private static void invalid() {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "범용 칸 구조 요청을 처리할 수 없습니다");
    }
}

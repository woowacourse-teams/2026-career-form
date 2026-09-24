package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.application.InteractionObservationProjector.Projection;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Candidate;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Decision;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;
import com.careerform.formanalysis.dto.InteractionDecisionResponse;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.infrastructure.AnalysisProviderSelection;

@Service
public final class InteractionDecisionService {

    private static final int SCHEMA_VERSION = 2;
    private static final int MAX_DECISIONS = 8;
    private static final int MAX_CANDIDATES_PER_DECISION = 24;
    private static final int MAX_TOTAL_CANDIDATES = 96;
    private static final Set<String> CANONICAL_FIELDS = new SupportedProfileFields().keys();
    private static final String INVALID_SNAPSHOT_MESSAGE =
        "동적 관찰 snapshot 관계를 확인할 수 없습니다";
    private static final String INVALID_RESOLUTION_MESSAGE =
        "동적 판단 출력 계약을 확인할 수 없습니다";

    private final Optional<InteractionDecisionProvider> provider;
    private final FormAnalysisRouter router;
    private final InteractionObservationProjector projector;
    private final boolean analysisEnabled;

    public InteractionDecisionService(
        Optional<InteractionDecisionProvider> provider,
        FormAnalysisRouter router,
        InteractionObservationProjector projector
    ) {
        this(provider, router, projector, new AnalysisProviderSelection(true, "openai"));
    }

    @Autowired
    public InteractionDecisionService(
        Optional<InteractionDecisionProvider> provider,
        FormAnalysisRouter router,
        InteractionObservationProjector projector,
        AnalysisProviderSelection selection
    ) {
        this.provider = provider;
        this.router = router;
        this.projector = projector;
        this.analysisEnabled = selection.enabled();
    }

    public InteractionDecisionResponse decide(InteractionDecisionRequest request) {
        validateSnapshot(request);
        GenericRouteKind route = router.routeGeneric(
            request.site().host(),
            request.site().pathPattern()
        );
        if (route == GenericRouteKind.STATIC_POLICY_PRESENT) {
            return InteractionDecisionResponse.staticPolicyPresent(
                request.snapshotId()
            );
        }
        if (route == GenericRouteKind.POLICY_UNAVAILABLE) {
            return InteractionDecisionResponse.policyUnavailable(
                request.snapshotId()
            );
        }
        if (!analysisEnabled || provider.isEmpty()) {
            return InteractionDecisionResponse.llmUnavailable(
                request.snapshotId()
            );
        }

        try {
            Projection projection = projector.project(request);
            InteractionDecisionProvider.Resolution providerResolution = provider
                .orElseThrow()
                .decide(projection.batch());
            validateProjectedResolution(
                projection.batch(),
                providerResolution
            );
            InteractionDecisionProvider.Resolution resolution = projection
                .restore(providerResolution);
            validateResolution(request, resolution);
            return InteractionDecisionResponse.complete(
                request.snapshotId(),
                responseDecisions(request, resolution)
            );
        }
        catch (ResolverException exception) {
            return InteractionDecisionResponse.llmUnavailable(
                request.snapshotId()
            );
        }
    }

    private static void validateProjectedResolution(
        InteractionDecisionProvider.Batch batch,
        InteractionDecisionProvider.Resolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != SCHEMA_VERSION
            || resolution.results() == null) {
            invalidResolution();
        }
        Map<String, InteractionDecisionProvider.Decision> decisions =
            new LinkedHashMap<>();
        for (InteractionDecisionProvider.Decision decision : batch.decisions()) {
            decisions.put(decision.decisionId(), decision);
        }
        Set<String> resultIds = new HashSet<>();
        for (InteractionDecisionProvider.Result result : resolution.results()) {
            if (result == null
                || isBlank(result.decisionId())
                || !resultIds.add(result.decisionId())) {
                invalidResolution();
            }
            InteractionDecisionProvider.Decision decision = decisions.get(
                result.decisionId()
            );
            if (decision == null || decision.role() != result.role()) {
                invalidResolution();
            }
            if (result instanceof InteractionDecisionProvider.Selected selected) {
                boolean candidateExists = decision.candidates().stream().anyMatch(
                    candidate -> candidate.candidateId().equals(
                        selected.candidateId()
                    )
                );
                if (!candidateExists) {
                    invalidResolution();
                }
            }
            else if (!(result instanceof InteractionDecisionProvider.Abstained)) {
                invalidResolution();
            }
        }
        if (!resultIds.equals(decisions.keySet())) {
            invalidResolution();
        }
    }

    private static void validateSnapshot(InteractionDecisionRequest request) {
        if (request == null
            || request.schemaVersion() != SCHEMA_VERSION
            || request.site() == null
            || isBlank(request.snapshotId())
            || request.decisions() == null
            || request.decisions().isEmpty()
            || request.decisions().size() > MAX_DECISIONS) {
            invalidSnapshot();
        }
        Set<String> decisionIds = new HashSet<>();
        Set<String> candidateIds = new HashSet<>();
        int candidateCount = 0;
        for (Decision decision : request.decisions()) {
            if (decision == null
                || isBlank(decision.decisionId())
                || !isOpaqueId(decision.decisionId())
                || !decisionIds.add(decision.decisionId())
                || decision.role() == null
                || isBlank(decision.canonicalFieldKey())
                || !CANONICAL_FIELDS.contains(decision.canonicalFieldKey())
                || decision.candidates() == null
                || decision.candidates().isEmpty()
                || decision.candidates().size() > MAX_CANDIDATES_PER_DECISION) {
                invalidSnapshot();
            }
            for (Candidate candidate : decision.candidates()) {
                if (candidate == null
                    || isBlank(candidate.candidateId())
                    || !isOpaqueId(candidate.candidateId())
                    || !candidateIds.add(candidate.candidateId())
                    || candidate.element() == null
                    || candidate.control() == null
                    || candidate.visibility() == null
                    || candidate.relationToTarget() == null) {
                    invalidSnapshot();
                }
                candidateCount++;
            }
        }
        if (candidateCount > MAX_TOTAL_CANDIDATES) {
            invalidSnapshot();
        }
    }

    private static void validateResolution(
        InteractionDecisionRequest request,
        InteractionDecisionProvider.Resolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != SCHEMA_VERSION
            || resolution.results() == null) {
            invalidResolution();
        }

        Map<String, Decision> decisions = new LinkedHashMap<>();
        for (Decision decision : request.decisions()) {
            decisions.put(decision.decisionId(), decision);
        }
        Set<String> resultIds = new HashSet<>();
        for (InteractionDecisionProvider.Result result : resolution.results()) {
            if (result == null
                || isBlank(result.decisionId())
                || !resultIds.add(result.decisionId())) {
                invalidResolution();
            }
            Decision decision = decisions.get(result.decisionId());
            if (decision == null || decision.role() != result.role()) {
                invalidResolution();
            }
            if (result instanceof InteractionDecisionProvider.Selected selected) {
                Candidate candidate = candidate(decision, selected.candidateId());
                if (candidate == null || !eligible(decision.role(), candidate)) {
                    invalidResolution();
                }
            }
            else if (!(result instanceof InteractionDecisionProvider.Abstained)) {
                invalidResolution();
            }
        }
        if (!resultIds.equals(decisions.keySet())) {
            invalidResolution();
        }
    }

    private static Candidate candidate(Decision decision, String candidateId) {
        if (isBlank(candidateId)) {
            return null;
        }
        return decision.candidates().stream()
            .filter(candidate -> candidate.candidateId().equals(candidateId))
            .findFirst()
            .orElse(null);
    }

    private static boolean eligible(Role role, Candidate candidate) {
        if (candidate.visibility() != Visibility.VISIBLE
            || Boolean.TRUE.equals(candidate.disabled())
            || Boolean.TRUE.equals(candidate.inert())) {
            return false;
        }
        return switch (role) {
            case SEARCH_POPUP_OPENER -> !Boolean.TRUE.equals(candidate.readonly())
                && (candidate.element() == Element.BUTTON
                    || candidate.element() == Element.LINK
                    || candidate.element() == Element.INPUT)
                && candidate.control() == Control.BUTTON
                && (candidate.relationToTarget()
                    == InteractionDecisionRequest.RelationToTarget.SAME_FIELD_GROUP
                    || candidate.relationToTarget()
                        == InteractionDecisionRequest.RelationToTarget.SAME_REPEAT_ROW);
            case SEARCH_QUERY_INPUT -> !Boolean.TRUE.equals(candidate.readonly())
                && candidate.element() == Element.INPUT
                && (candidate.control() == Control.TEXT
                    || candidate.control() == Control.SEARCH)
                && (candidate.relationToTarget()
                    == InteractionDecisionRequest.RelationToTarget.DIALOG_CONTROL
                    || candidate.relationToTarget()
                        == InteractionDecisionRequest.RelationToTarget.SAME_CONTAINER);
            case SEARCH_SUBMIT -> !Boolean.TRUE.equals(candidate.readonly())
                && (candidate.element() == Element.BUTTON
                    || candidate.element() == Element.INPUT)
                && (candidate.control() == Control.BUTTON
                    || candidate.control() == Control.SUBMIT)
                && (candidate.relationToTarget()
                    == InteractionDecisionRequest.RelationToTarget.DIALOG_CONTROL
                    || candidate.relationToTarget()
                        == InteractionDecisionRequest.RelationToTarget.SAME_CONTAINER);
        };
    }

    private static List<InteractionDecisionResponse.Decision> responseDecisions(
        InteractionDecisionRequest request,
        InteractionDecisionProvider.Resolution resolution
    ) {
        Map<String, InteractionDecisionProvider.Result> byId = new HashMap<>();
        for (InteractionDecisionProvider.Result result : resolution.results()) {
            byId.put(result.decisionId(), result);
        }
        return request.decisions().stream().map(decision -> {
            InteractionDecisionProvider.Result result = byId.get(
                decision.decisionId()
            );
            if (result instanceof InteractionDecisionProvider.Selected selected) {
                return InteractionDecisionResponse.Decision.selected(
                    decision.decisionId(),
                    decision.role(),
                    selected.candidateId()
                );
            }
            return InteractionDecisionResponse.Decision.abstained(
                decision.decisionId(),
                decision.role()
            );
        }).toList();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isOpaqueId(String value) {
        return value != null
            && value.matches("[A-Za-z][A-Za-z0-9_-]{0,63}");
    }

    private static void invalidSnapshot() {
        throw new InvalidSnapshotException(INVALID_SNAPSHOT_MESSAGE);
    }

    private static void invalidResolution() {
        throw new ResolverException(INVALID_RESOLUTION_MESSAGE);
    }
}

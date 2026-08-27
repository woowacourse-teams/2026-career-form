package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.AddRepeatableGroupPlan;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.Command;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.ExpectedEffect;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.PreparationPlan;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse.RevealSectionPlan;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.exception.ResolverException;

@Service
public final class PreparationAnalysisService {

    private static final int SCHEMA_VERSION = 2;
    private static final String INVALID_SNAPSHOT_MESSAGE =
        "지원서 snapshot 관계를 확인할 수 없습니다";
    private static final String INVALID_RESOLUTION_MESSAGE =
        "Resolver 출력 계약을 확인할 수 없습니다";

    private final Optional<ActionResolver> resolver;

    public PreparationAnalysisService(Optional<ActionResolver> resolver) {
        this.resolver = resolver;
    }

    public PreparationAnalysisResponse analyze(PreparationAnalysisRequest request) {
        validateSnapshot(request);
        if (resolver.isEmpty()) {
            return PreparationAnalysisResponse.llmUnavailable(request.snapshotId());
        }
        if (request.actionCandidatesInTraversalOrder().isEmpty()) {
            return PreparationAnalysisResponse.complete(request.snapshotId(), List.of());
        }
        try {
            ActionResolver.Resolution resolution = resolver.orElseThrow().resolve(request);
            validateResolution(request, resolution);
            return PreparationAnalysisResponse.complete(
                request.snapshotId(),
                mapPlansInRequestOrder(request, resolution)
            );
        }
        catch (ResolverException exception) {
            return PreparationAnalysisResponse.llmUnavailable(request.snapshotId());
        }
    }

    private static void validateSnapshot(PreparationAnalysisRequest request) {
        if (request == null
            || request.schemaVersion() != SCHEMA_VERSION
            || isBlank(request.snapshotId())
            || request.sections() == null
            || request.sections().isEmpty()) {
            invalidSnapshot();
        }

        Set<String> sectionIds = new HashSet<>();
        Set<String> candidateIds = new HashSet<>();
        for (Section section : request.sections()) {
            if (section == null
                || isBlank(section.sectionId())
                || !sectionIds.add(section.sectionId())
                || section.actionCandidates() == null) {
                invalidSnapshot();
            }
        }
        for (ActionCandidate candidate : request.actionCandidatesInTraversalOrder()) {
            if (candidate == null
                || isBlank(candidate.candidateId())
                || !candidateIds.add(candidate.candidateId())) {
                invalidSnapshot();
            }
        }
    }

    private static void validateResolution(
        PreparationAnalysisRequest request,
        ActionResolver.Resolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != SCHEMA_VERSION
            || !request.snapshotId().equals(resolution.snapshotId())
            || resolution.results() == null) {
            invalidResolution();
        }

        Map<String, ActionCandidate> candidates = new LinkedHashMap<>();
        for (ActionCandidate candidate : request.actionCandidatesInTraversalOrder()) {
            candidates.put(candidate.candidateId(), candidate);
        }
        Set<String> sectionIds = new HashSet<>();
        for (Section section : request.sections()) {
            sectionIds.add(section.sectionId());
        }

        Set<String> resultIds = new HashSet<>();
        for (ActionResolver.Result result : resolution.results()) {
            if (result == null
                || isBlank(result.candidateId())
                || !resultIds.add(result.candidateId())) {
                invalidResolution();
            }
            ActionCandidate candidate = candidates.get(result.candidateId());
            if (candidate == null) {
                invalidResolution();
            }
            validateAction(result, candidate, sectionIds);
        }
        if (!resultIds.equals(candidates.keySet())) {
            invalidResolution();
        }
    }

    private static void validateAction(
        ActionResolver.Result result,
        ActionCandidate candidate,
        Set<String> sectionIds
    ) {
        if (result instanceof ActionResolver.NoAction) {
            return;
        }
        if (candidate.visibility() != Visibility.VISIBLE
            || Boolean.TRUE.equals(candidate.disabled())
            || Boolean.TRUE.equals(candidate.readonly())
            || Boolean.TRUE.equals(candidate.inert())) {
            invalidResolution();
        }
        if (result instanceof ActionResolver.RevealAction reveal
            && (isBlank(reveal.targetSectionId())
                || !sectionIds.contains(reveal.targetSectionId()))) {
            invalidResolution();
        }
    }

    private static List<PreparationPlan> mapPlansInRequestOrder(
        PreparationAnalysisRequest request,
        ActionResolver.Resolution resolution
    ) {
        Map<String, ActionResolver.Result> byCandidate = new HashMap<>();
        for (ActionResolver.Result result : resolution.results()) {
            byCandidate.put(result.candidateId(), result);
        }
        return request.actionCandidateIdsInTraversalOrder().stream()
            .map(byCandidate::get)
            .filter(result -> !(result instanceof ActionResolver.NoAction))
            .map(PreparationAnalysisService::toPlan)
            .toList();
    }

    private static PreparationPlan toPlan(ActionResolver.Result result) {
        if (result instanceof ActionResolver.RevealAction reveal) {
            return new RevealSectionPlan(
                reveal.candidateId(),
                Command.REVEAL_SECTION,
                ExpectedEffect.TARGET_VISIBLE,
                reveal.targetSectionId()
            );
        }
        ActionResolver.AddAction add = (ActionResolver.AddAction) result;
        return new AddRepeatableGroupPlan(
            add.candidateId(),
            Command.ADD_REPEATABLE_GROUP,
            ExpectedEffect.GROUP_COUNT_INCREMENT
        );
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static void invalidSnapshot() {
        throw new InvalidSnapshotException(INVALID_SNAPSHOT_MESSAGE);
    }

    private static void invalidResolution() {
        throw new ResolverException(INVALID_RESOLUTION_MESSAGE);
    }
}

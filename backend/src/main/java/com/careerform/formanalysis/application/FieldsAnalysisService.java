package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.FieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.NoMatchFieldAnalysis;
import com.careerform.formanalysis.exception.InvalidSnapshotException;
import com.careerform.formanalysis.exception.ResolverException;

@Service
public final class FieldsAnalysisService {

    private static final int SCHEMA_VERSION = 2;
    private static final String INVALID_SNAPSHOT_MESSAGE =
        "지원서 snapshot 관계를 확인할 수 없습니다";
    private static final String INVALID_RESOLUTION_MESSAGE =
        "Resolver 출력 계약을 확인할 수 없습니다";

    private final Optional<FieldMappingResolver> resolver;
    private final FieldInteractionPolicy interactionPolicy;
    private final SupportedProfileFields supportedProfileFields;

    public FieldsAnalysisService(
        Optional<FieldMappingResolver> resolver,
        FieldInteractionPolicy interactionPolicy,
        SupportedProfileFields supportedProfileFields
    ) {
        this.resolver = resolver;
        this.interactionPolicy = interactionPolicy;
        this.supportedProfileFields = supportedProfileFields;
    }

    public FieldsAnalysisResponse analyze(FieldsAnalysisRequest request) {
        validateSnapshot(request);
        if (resolver.isEmpty()) {
            return FieldsAnalysisResponse.llmUnavailable(request.snapshotId());
        }
        if (request.fieldCandidatesInTraversalOrder().isEmpty()) {
            return FieldsAnalysisResponse.complete(request.snapshotId(), List.of());
        }
        try {
            FieldMappingResolver.Resolution resolution =
                resolver.orElseThrow().resolve(request);
            validateResolution(request, resolution);
            return FieldsAnalysisResponse.complete(
                request.snapshotId(),
                mapFieldsInRequestOrder(request, resolution)
            );
        }
        catch (ResolverException exception) {
            return FieldsAnalysisResponse.llmUnavailable(request.snapshotId());
        }
    }

    private static void validateSnapshot(FieldsAnalysisRequest request) {
        if (request == null
            || request.schemaVersion() != SCHEMA_VERSION
            || isBlank(request.snapshotId())
            || request.sections() == null
            || request.sections().isEmpty()) {
            invalidSnapshot();
        }

        Set<String> candidateIds = new HashSet<>();
        for (Section section : request.sections()) {
            if (section == null
                || isBlank(section.sectionId())
                || section.fields() == null) {
                invalidSnapshot();
            }
        }
        for (FieldCandidate candidate : request.fieldCandidatesInTraversalOrder()) {
            if (candidate == null
                || isBlank(candidate.candidateId())
                || !candidateIds.add(candidate.candidateId())) {
                invalidSnapshot();
            }
        }
    }

    private void validateResolution(
        FieldsAnalysisRequest request,
        FieldMappingResolver.Resolution resolution
    ) {
        if (resolution == null
            || resolution.schemaVersion() != SCHEMA_VERSION
            || !request.snapshotId().equals(resolution.snapshotId())
            || resolution.results() == null) {
            invalidResolution();
        }

        Map<String, FieldCandidate> candidates = new LinkedHashMap<>();
        for (FieldCandidate candidate : request.fieldCandidatesInTraversalOrder()) {
            candidates.put(candidate.candidateId(), candidate);
        }
        Set<String> resultIds = new HashSet<>();
        for (FieldMappingResolver.Result result : resolution.results()) {
            if (result == null
                || isBlank(result.candidateId())
                || !resultIds.add(result.candidateId())
                || !candidates.containsKey(result.candidateId())) {
                invalidResolution();
            }
            if (result instanceof FieldMappingResolver.Match match
                && !supportedProfileFields.contains(match.profileFieldKey())) {
                invalidResolution();
            }
        }
        if (!resultIds.equals(candidates.keySet())) {
            invalidResolution();
        }
    }

    private List<FieldAnalysis> mapFieldsInRequestOrder(
        FieldsAnalysisRequest request,
        FieldMappingResolver.Resolution resolution
    ) {
        Map<String, FieldMappingResolver.Result> mappings = new HashMap<>();
        for (FieldMappingResolver.Result result : resolution.results()) {
            mappings.put(result.candidateId(), result);
        }
        return request.fieldCandidatesInTraversalOrder().stream()
            .map(candidate -> toAnalysis(candidate, mappings.get(candidate.candidateId())))
            .toList();
    }

    private FieldAnalysis toAnalysis(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        FieldInteractionPolicy.Decision decision =
            interactionPolicy.evaluate(candidate, mapping);
        if (mapping instanceof FieldMappingResolver.NoMatch) {
            return new NoMatchFieldAnalysis(
                candidate.candidateId(),
                MatchType.NO_MATCH,
                MappingStatus.LLM_SUGGESTED,
                decision.interactionStatus(),
                decision.reasonCodes()
            );
        }
        FieldMappingResolver.Match match = (FieldMappingResolver.Match) mapping;
        return new MatchedFieldAnalysis(
            candidate.candidateId(),
            MatchType.MATCH,
            match.profileFieldKey(),
            supportedProfileFields.policyOf(match.profileFieldKey()).orElseThrow(),
            MappingStatus.LLM_SUGGESTED,
            decision.interactionStatus(),
            decision.writePlan()
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

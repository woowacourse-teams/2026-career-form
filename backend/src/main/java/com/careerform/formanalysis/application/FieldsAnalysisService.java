package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.careerform.formanalysis.application.FormAnalysisRouter.FieldRoute;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.FieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MappingStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchType;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.MatchedFieldAnalysis;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.Mode;
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
    private final FormAnalysisRouter router;
    private final FieldInteractionPolicy interactionPolicy;
    private final SupportedProfileFields supportedProfileFields;

    public FieldsAnalysisService(
        Optional<FieldMappingResolver> resolver,
        FormAnalysisRouter router,
        FieldInteractionPolicy interactionPolicy,
        SupportedProfileFields supportedProfileFields
    ) {
        this.resolver = resolver;
        this.router = router;
        this.interactionPolicy = interactionPolicy;
        this.supportedProfileFields = supportedProfileFields;
    }

    public FieldsAnalysisResponse analyze(FieldsAnalysisRequest request) {
        validateSnapshot(request);
        FieldRoute route = router.route(request);
        if (route.kind() == RouteKind.STRUCTURE_MISMATCH) {
            return FieldsAnalysisResponse.adapterStructureMismatch(request.snapshotId());
        }
        if (route.kind() == RouteKind.POLICY_UNAVAILABLE) {
            return FieldsAnalysisResponse.adapterPolicyUnavailable(request.snapshotId());
        }
        Mode mode = route.kind() == RouteKind.ADAPTER
            ? Mode.ADAPTER
            : Mode.GENERIC;
        MappingStatus mappingStatus = route.kind() == RouteKind.ADAPTER
            ? MappingStatus.ADAPTER_VERIFIED
            : MappingStatus.LLM_SUGGESTED;
        Optional<FieldMappingResolver> selectedResolver =
            route.kind() == RouteKind.ADAPTER
                ? Optional.of(route.resolver())
                : resolver;
        if (selectedResolver.isEmpty()) {
            return FieldsAnalysisResponse.llmUnavailable(request.snapshotId());
        }
        if (request.fieldCandidatesInTraversalOrder().isEmpty()) {
            return FieldsAnalysisResponse.complete(request.snapshotId(), mode, List.of());
        }
        try {
            FieldMappingResolver.Resolution resolution =
                selectedResolver.orElseThrow().resolve(request);
            validateResolution(request, resolution);
            return FieldsAnalysisResponse.complete(
                request.snapshotId(),
                mode,
                mapFieldsInRequestOrder(request, resolution, mappingStatus)
            );
        }
        catch (ResolverException exception) {
            return mode == Mode.ADAPTER
                ? FieldsAnalysisResponse.adapterStructureMismatch(request.snapshotId())
                : FieldsAnalysisResponse.llmUnavailable(request.snapshotId());
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
            if (result instanceof FieldMappingResolver.Match match) {
                ValueBinding binding = match.valueBinding();
                if (binding instanceof DirectBinding direct
                    && !supportedProfileFields.contains(direct.profileFieldKey())) {
                    invalidResolution();
                }
            }
        }
        if (!resultIds.equals(candidates.keySet())) {
            invalidResolution();
        }
    }

    private List<FieldAnalysis> mapFieldsInRequestOrder(
        FieldsAnalysisRequest request,
        FieldMappingResolver.Resolution resolution,
        MappingStatus mappingStatus
    ) {
        Map<String, FieldMappingResolver.Result> mappings = new HashMap<>();
        for (FieldMappingResolver.Result result : resolution.results()) {
            mappings.put(result.candidateId(), result);
        }
        return request.fieldCandidatesInTraversalOrder().stream()
            .map(candidate -> toAnalysis(
                candidate,
                mappings.get(candidate.candidateId()),
                mappingStatus
            ))
            .toList();
    }

    private FieldAnalysis toAnalysis(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping,
        MappingStatus mappingStatus
    ) {
        FieldInteractionPolicy.Decision decision =
            interactionPolicy.evaluate(candidate, mapping);
        if (mapping instanceof FieldMappingResolver.NoMatch) {
            return new NoMatchFieldAnalysis(
                candidate.candidateId(),
                MatchType.NO_MATCH,
                mappingStatus,
                decision.interactionStatus(),
                decision.reasonCodes()
            );
        }
        FieldMappingResolver.Match match = (FieldMappingResolver.Match) mapping;
        String directKey = match.valueBinding() instanceof DirectBinding direct
            ? direct.profileFieldKey()
            : null;
        AutofillPolicy autofillPolicy = directKey == null
            ? AutofillPolicy.ALLOWED
            : supportedProfileFields.policyOf(directKey).orElseThrow();
        return new MatchedFieldAnalysis(
            candidate.candidateId(),
            MatchType.MATCH,
            match.valueBinding(),
            autofillPolicy,
            mappingStatus,
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

package com.careerform.formanalysis.generic;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
    private final SupportedProfileFields supportedProfileFields;

    public GenericFieldsService(Optional<JevCategoryFieldResolver> resolver, FormAnalysisRouter router,
        FieldInteractionPolicy interactionPolicy, SupportedProfileFields supportedProfileFields) {
        this.resolver = resolver;
        this.router = router;
        this.fieldPolicy = new GenericFieldPolicy(interactionPolicy, supportedProfileFields);
        this.supportedProfileFields = supportedProfileFields;
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
        Set<String> inferred = new HashSet<>();
        for (Section section : request.sections()) {
            inferPairedDates(section.fields(), mappings, inferred);
            if (section.items() != null) {
                section.items().forEach(item -> {
                    inferPairedDates(item.fields(), mappings, inferred);
                });
            }
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
                assessment.interactionStatus(), assessment.writePlan(), mapping.binding(),
                inferred.contains(candidate.candidateId()) ? GenericFieldsResponse.Inference.PAIRED_DATE
                    : null));
        }
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
        return GenericFieldsResponse.complete(request.snapshotId(), fields, new Diagnostics(jevCalls, elapsedMs));
    }

    private void inferPairedDates(List<FieldCandidate> fields, Map<String, Mapping> mappings, Set<String> inferred) {
        Map<String, List<FieldCandidate>> containers = new LinkedHashMap<>();
        for (FieldCandidate field : fields) {
            if (field.containerId() != null) {
                containers.computeIfAbsent(field.containerId(), ignored -> new ArrayList<>()).add(field);
            }
        }
        for (List<FieldCandidate> pair : containers.values()) {
            if (pair.size() != 2 || pair.stream().anyMatch(field ->
                field.visibility() != GenericFieldsRequest.Visibility.VISIBLE
                    || !hasDateEvidence(field)
                    || field.element() != GenericFieldsRequest.FormElement.INPUT
                    || field.control() != GenericFieldsRequest.FormControl.TEXT)) {
                continue;
            }
            FieldCandidate start = pair.getFirst();
            FieldCandidate end = pair.getLast();
            Mapping startMapping = mappings.get(start.candidateId());
            Mapping endMapping = mappings.get(end.candidateId());
            if (sameRow(start, end) && abstained(startMapping) && abstained(endMapping)) {
                inferRowDates(fields, pair, mappings, inferred);
                continue;
            }
            if (!sameRow(start, end) || startMapping == null || startMapping.profileFieldKey() != null
                || startMapping.binding() != null || startMapping.reason() != null
                || endMapping == null || endMapping.profileFieldKey() == null
                || endMapping.binding() != null || endMapping.reason() != null
                || !endMapping.profileFieldKey().endsWith(".endDate")) {
                continue;
            }
            String endKey = endMapping.profileFieldKey();
            String startKey = endKey.substring(0, endKey.length() - "endDate".length()) + "startDate";
            if (!supportedProfileFields.contains(startKey) || fields.stream().anyMatch(field ->
                sameRow(start, field) && mappings.containsKey(field.candidateId())
                    && startKey.equals(mappings.get(field.candidateId()).profileFieldKey()))) {
                continue;
            }
            mappings.put(start.candidateId(),
                new Mapping(startKey, endMapping.confidence(), endMapping.categoryConfirmed(), null));
            inferred.add(start.candidateId());
        }
    }

    private static final java.util.regex.Pattern DATE_EVIDENCE = java.util.regex.Pattern.compile(
        "(년\\s*월|연\\s*월|년월일|일자|날짜|기간|\\bdate\\b|y{2,4}[-./ ]?mm|\\bmm\\b|\\bdd\\b)",
        java.util.regex.Pattern.CASE_INSENSITIVE);

    /** 칸 자신의 입력 형식이나 라벨이 날짜를 가리킬 때만 날짜 쌍으로 본다. */
    private static boolean hasDateEvidence(FieldCandidate field) {
        var context = field.semanticContext();
        if (context != null && context.inputType() == GenericFieldsRequest.InputType.DATE) {
            return true;
        }
        List<String> texts = new ArrayList<>();
        texts.add(field.displayName());
        texts.add(field.placeholder());
        if (context != null && context.labels() != null) {
            context.labels().stream()
                .filter(label -> label.source() != GenericFieldsRequest.SemanticSource.SECTION_HEADING)
                .forEach(label -> texts.add(label.text()));
        }
        return texts.stream().anyMatch(text -> text != null && DATE_EVIDENCE.matcher(text).find());
    }

    private static boolean abstained(Mapping mapping) {
        return mapping != null && mapping.profileFieldKey() == null && mapping.binding() == null
            && mapping.reason() == null;
    }

    /** 두 날짜가 모두 기권하면 같은 행의 다른 매핑이 한 항목 묶음으로만 모일 때 그 묶음의 기간으로 본다. */
    private void inferRowDates(List<FieldCandidate> fields, List<FieldCandidate> pair,
        Map<String, Mapping> mappings, Set<String> inferred) {
        FieldCandidate start = pair.getFirst();
        Set<String> prefixes = new HashSet<>();
        int siblings = 0;
        double confidence = 1.0;
        boolean confirmed = true;
        for (FieldCandidate field : fields) {
            Mapping mapping = mappings.get(field.candidateId());
            if (pair.contains(field) || !sameRow(start, field) || mapping == null
                || mapping.profileFieldKey() == null) {
                continue;
            }
            String key = mapping.profileFieldKey();
            prefixes.add(key.substring(0, key.lastIndexOf('.') + 1));
            if (key.endsWith(".startDate") || key.endsWith(".endDate")) {
                return;
            }
            siblings++;
            confidence = Math.min(confidence, mapping.confidence());
            confirmed &= mapping.categoryConfirmed();
        }
        if (siblings < 2 || prefixes.size() != 1) {
            return;
        }
        String prefix = prefixes.iterator().next();
        if (!supportedProfileFields.contains(prefix + "startDate")
            || !supportedProfileFields.contains(prefix + "endDate")) {
            return;
        }
        mappings.put(start.candidateId(), new Mapping(prefix + "startDate", confidence, confirmed, null));
        mappings.put(pair.getLast().candidateId(), new Mapping(prefix + "endDate", confidence, confirmed, null));
        inferred.add(start.candidateId());
        inferred.add(pair.getLast().candidateId());
    }

    private static boolean sameRow(FieldCandidate first, FieldCandidate second) {
        return Objects.equals(first.semanticContext() == null ? null : first.semanticContext().repeat(),
            second.semanticContext() == null ? null : second.semanticContext().repeat());
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

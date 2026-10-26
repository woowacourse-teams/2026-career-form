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
        for (Section section : request.sections()) {
            List<FieldCandidate> candidates = new ArrayList<>(section.fields());
            if (section.items() != null) {
                section.items().forEach(item -> candidates.addAll(item.fields()));
            }
            for (FieldCandidate candidate : candidates) {
                String key = GenericProfileSemantics.choiceKey(section.displayName(), candidate);
                if (key != null && supportedProfileFields.contains(key)) {
                    mappings.put(candidate.candidateId(), new Mapping(key, 1.0, true, null));
                }
            }
            for (FieldCandidate candidate : candidates) {
                String military = GenericProfileSemantics.militaryKey(section.category(), section.displayName(),
                    candidate);
                Mapping current = mappings.get(candidate.candidateId());
                // 합성 선택지는 병역 상태를 직접 밝힌다. 모델이 다른 병역 키를 준 경우도 바로잡는다.
                if (military != null && supportedProfileFields.contains(military) && (current == null
                    || current.binding() == null && current.reason() == null && (current.profileFieldKey() == null
                        || current.profileFieldKey().startsWith("military.")))) {
                    mappings.put(candidate.candidateId(),
                        new Mapping(military, 1.0, current == null || current.categoryConfirmed(), null));
                }
            }
            for (FieldCandidate candidate : candidates) {
                String key = GenericProfileSemantics.englishNameKey(section.category(), candidate);
                Mapping current = mappings.get(candidate.candidateId());
                // 명시된 단일 성·이름 라벨은 전체 영문 이름 조합 판정보다 구체적이다.
                if (key != null && supportedProfileFields.contains(key) && (current == null
                    || current.profileFieldKey() == null && current.reason() == null
                        && (current.binding() == null || current.binding() instanceof GenericFieldsResponse.NameBinding name
                            && name.recipe().name().startsWith("ENGLISH_FULL_NAME")))) {
                    mappings.put(candidate.candidateId(),
                        new Mapping(key, 1.0, current == null || current.categoryConfirmed(), null));
                }
            }
        }
        for (Section section : request.sections()) {
            List<FieldCandidate> candidates = new ArrayList<>(section.fields());
            if (section.items() != null) {
                section.items().forEach(item -> candidates.addAll(item.fields()));
            }
            for (FieldCandidate candidate : candidates) {
                Mapping current = mappings.get(candidate.candidateId());
                if (current != null && (current.binding() != null || current.reason() != null)) {
                    continue;
                }
                String key = GenericProfileSemantics.certificateNumberKey(section.category(), candidate,
                    current == null ? null : current.profileFieldKey());
                if (key != null && supportedProfileFields.contains(key)) {
                    mappings.put(candidate.candidateId(),
                        new Mapping(key, 1.0, current == null || current.categoryConfirmed(), null));
                }
            }
        }
        for (Section section : request.sections()) {
            List<FieldCandidate> candidates = new ArrayList<>(section.fields());
            if (section.items() != null) {
                section.items().forEach(item -> candidates.addAll(item.fields()));
            }
            applyPersonalAndSensitiveRules(section, candidates, mappings);
        }
        // 이름은 한 줄 입력칸에만 쓴다. 자기소개서 같은 여러 줄 칸에 이름을 넣지 않는다.
        for (FieldCandidate candidate : request.fieldCandidatesInTraversalOrder()) {
            Mapping mapping = mappings.get(candidate.candidateId());
            if (mapping != null && candidate.element() == GenericFieldsRequest.FormElement.TEXTAREA
                && (mapping.binding() instanceof GenericFieldsResponse.NameBinding || mapping.profileFieldKey() != null
                    && NAME_KEYS.contains(mapping.profileFieldKey()))) {
                mappings.put(candidate.candidateId(),
                    new Mapping(null, mapping.confidence(), mapping.categoryConfirmed(), null));
            }
        }
        Set<String> inferred = new HashSet<>();
        Map<String, GenericFieldsResponse.Inference> resultTargets = new HashMap<>();
        for (Section section : request.sections()) {
            inferPairedDates(section.fields(), mappings, inferred);
            markLanguageResultTargets(section.fields(), mappings, resultTargets);
            if (section.items() != null) {
                section.items().forEach(item -> {
                    inferPairedDates(item.fields(), mappings, inferred);
                    markLanguageResultTargets(item.fields(), mappings, resultTargets);
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
                    : resultTargets.get(candidate.candidateId())));
        }
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
        return GenericFieldsResponse.complete(request.snapshotId(), fields, new Diagnostics(jevCalls, elapsedMs));
    }

    /** 이름 한 칸·생년월일 선택칸·보훈장애 상세칸을 칸 자신의 라벨과 구조로 정한다. 모델이 정한 다른 범주 키는 덮어쓰지 않는다. */
    private void applyPersonalAndSensitiveRules(Section section, List<FieldCandidate> candidates,
        Map<String, Mapping> mappings) {
        if ("PERSONAL".equals(section.category())) {
            List<FieldCandidate> names = candidates.stream()
                .filter(GenericProfileSemantics::isSingleKoreanNameLabel).toList();
            boolean separateParts = candidates.stream().anyMatch(GenericProfileSemantics::isFamilyNameLabel)
                || candidates.stream().map(field -> mappings.get(field.candidateId())).filter(Objects::nonNull)
                    .map(Mapping::profileFieldKey).anyMatch(key -> "personal.personal.koreanFamilyName".equals(key)
                        || "personal.personal.koreanGivenName".equals(key));
            if (names.size() == 1 && !separateParts && abstained(mappings.get(names.getFirst().candidateId()))) {
                Mapping current = mappings.get(names.getFirst().candidateId());
                mappings.put(names.getFirst().candidateId(), new Mapping(null, 1.0,
                    current == null || current.categoryConfirmed(), null,
                    new GenericFieldsResponse.NameBinding(
                        com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe.KOREAN_FULL_NAME)));
            }
            Map<GenericFieldsResponse.DatePart, FieldCandidate> parts = new LinkedHashMap<>();
            boolean ambiguous = false;
            for (FieldCandidate field : candidates) {
                if (!GenericProfileSemantics.isBirthDateLabel(field) || !abstained(mappings.get(field.candidateId()))) {
                    continue;
                }
                GenericFieldsResponse.DatePart part = GenericProfileSemantics.datePartOf(field);
                if (part == null) {
                    continue;
                }
                ambiguous |= parts.putIfAbsent(part, field) != null;
            }
            if (!ambiguous && parts.size() >= 2 && supportedProfileFields.contains(BIRTH_DATE)) {
                parts.forEach((part, field) -> {
                    Mapping current = mappings.get(field.candidateId());
                    mappings.put(field.candidateId(), new Mapping(BIRTH_DATE, 1.0,
                        current == null || current.categoryConfirmed(), null,
                        new GenericFieldsResponse.DatePartBinding(part)));
                });
            }
        }
        boolean veteranSection = candidates.stream().map(field -> mappings.get(field.candidateId()))
            .filter(Objects::nonNull).map(Mapping::profileFieldKey)
            .anyMatch(key -> key != null && key.startsWith("veteran."));
        for (FieldCandidate field : candidates) {
            Mapping current = mappings.get(field.candidateId());
            String currentKey = current == null ? null : current.profileFieldKey();
            String detail = GenericProfileSemantics.disabilityDetailKey(field);
            String family = "disability.";
            if (detail == null && veteranSection && GenericProfileSemantics.isRelationLabel(field)) {
                detail = "veteran.veteran.veteranRelation";
                family = "veteran.";
            }
            if (detail == null || !supportedProfileFields.contains(detail)
                || !(abstained(current) || currentKey != null && currentKey.startsWith(family)
                    && (current.binding() == null && current.reason() == null))) {
                continue;
            }
            mappings.put(field.candidateId(), new Mapping(detail, 1.0, current == null || current.categoryConfirmed(), null));
        }
    }

    private static final String BIRTH_DATE = "personal.personal.birthDate";

    private static final String LANGUAGE_RESULT = "languages.languageTest.grade";
    private static final java.util.regex.Pattern SCORE_LABEL =
        java.util.regex.Pattern.compile("(?:시험|취득)?점수|score", java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern GRADE_LABEL =
        java.util.regex.Pattern.compile("등급|급수|레벨|grade|level", java.util.regex.Pattern.CASE_INSENSITIVE);

    /**
     * 한 어학 기록 안에 기권한 점수 입력칸과 등급 선택칸이 하나씩 있으면 둘 다 후보로 표시한다.
     * 어느 칸이 맞는지는 값 모양에 달려 있어 서버는 고르지 않는다(LANGUAGE_RESULT_CRITERION).
     */
    private void markLanguageResultTargets(List<FieldCandidate> fields, Map<String, Mapping> mappings,
        Map<String, GenericFieldsResponse.Inference> targets) {
        boolean languageRecord = false;
        List<String> resultMapped = new ArrayList<>();
        for (FieldCandidate field : fields) {
            Mapping mapping = mappings.get(field.candidateId());
            String key = mapping == null ? null : mapping.profileFieldKey();
            if (LANGUAGE_RESULT.equals(key)) {
                resultMapped.add(field.candidateId());
            }
            languageRecord |= key != null && key.startsWith("languages.languageTest.");
        }
        if (!languageRecord) {
            return;
        }
        List<FieldCandidate> scores = resultCandidates(fields, mappings, GenericFieldsRequest.FormElement.INPUT,
            SCORE_LABEL);
        List<FieldCandidate> grades = resultCandidates(fields, mappings, GenericFieldsRequest.FormElement.SELECT,
            GRADE_LABEL);
        if (scores.size() != 1 || grades.size() != 1) {
            return;
        }
        FieldCandidate score = scores.getFirst();
        FieldCandidate grade = grades.getFirst();
        // 모델이 한 칸만 골랐으면 그 판정을 따른다. 둘 다 기권했거나 둘 다 같은 키를 받은 경우만 후보로 남긴다.
        boolean bothAbstained = resultMapped.isEmpty();
        boolean bothDuplicated = resultMapped.size() == 2 && resultMapped.contains(score.candidateId())
            && resultMapped.contains(grade.candidateId());
        if (!bothAbstained && !bothDuplicated) {
            return;
        }
        for (FieldCandidate field : List.of(score, grade)) {
            Mapping current = mappings.get(field.candidateId());
            mappings.put(field.candidateId(), new Mapping(LANGUAGE_RESULT,
                current == null || current.profileFieldKey() == null ? 0.9 : current.confidence(),
                current == null || current.categoryConfirmed(), null));
        }
        targets.put(score.candidateId(), GenericFieldsResponse.Inference.LANGUAGE_SCORE);
        targets.put(grade.candidateId(), GenericFieldsResponse.Inference.LANGUAGE_GRADE);
    }

    private static List<FieldCandidate> resultCandidates(List<FieldCandidate> fields, Map<String, Mapping> mappings,
        GenericFieldsRequest.FormElement element, java.util.regex.Pattern label) {
        return fields.stream().filter(field -> {
            Mapping mapping = mappings.get(field.candidateId());
            String name = field.displayName() == null ? "" : java.text.Normalizer.normalize(field.displayName(),
                java.text.Normalizer.Form.NFKC).replaceAll("[\\s()\\[\\]*:]+", "");
            boolean open = mapping == null || mapping.binding() == null && mapping.reason() == null
                && (mapping.profileFieldKey() == null || LANGUAGE_RESULT.equals(mapping.profileFieldKey()));
            return field.visibility() == GenericFieldsRequest.Visibility.VISIBLE && field.element() == element
                && open && label.matcher(name).matches();
        }).toList();
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

    private static final Set<String> NAME_KEYS = Set.of("personal.personal.koreanFamilyName",
        "personal.personal.koreanGivenName", "personal.personal.englishFamilyName",
        "personal.personal.englishGivenName");

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

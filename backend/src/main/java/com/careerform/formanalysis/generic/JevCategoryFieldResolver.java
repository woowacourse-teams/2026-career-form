package com.careerform.formanalysis.generic;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.exception.TokenLimitExceeded;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Reason;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

/**
 * 섹션 범주 키로 선택지를 좁혀 칸을 JEV answer()로 매칭한다.
 * 섹션 단위 제한 병렬, 섹션 안 배치, 토큰 초과 반분 재시도, 서버 전체 동시 호출 상한을 이 클래스 안에서만 처리한다.
 */
@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class JevCategoryFieldResolver {

    static final String ABSTAIN_CRITERION =
        "No supported unambiguous applicant profile field, or insufficient de-identified meaning.";
    private static final Logger log = LoggerFactory.getLogger(JevCategoryFieldResolver.class);

    private final JevClient client;
    private final SupportedProfileFields fields;
    private final SectionCategories categories;
    private final int sectionConcurrency;
    private final int fieldBatchSize;
    private final Semaphore permits;
    private final long permitTimeoutMs;

    @Autowired
    public JevCategoryFieldResolver(
        JevClient client,
        SupportedProfileFields fields,
        SectionCategories categories,
        @Value("${career-form.analysis.jev.section-concurrency:3}") int sectionConcurrency,
        @Value("${career-form.analysis.jev.field-batch-size:5}") int fieldBatchSize,
        @Value("${career-form.analysis.jev.max-concurrent:10}") int maxConcurrent,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") long permitTimeoutMs
    ) {
        this(client, fields, categories, sectionConcurrency, fieldBatchSize, permits(maxConcurrent), permitTimeoutMs);
    }

    JevCategoryFieldResolver(
        JevClient client,
        SupportedProfileFields fields,
        SectionCategories categories,
        int sectionConcurrency,
        int fieldBatchSize,
        Semaphore permits,
        long permitTimeoutMs
    ) {
        if (sectionConcurrency < 1 || fieldBatchSize < 1 || fieldBatchSize > 128 || permitTimeoutMs < 0) {
            throw new IllegalStateException("Invalid generic field analysis configuration");
        }
        this.client = client;
        this.fields = fields;
        this.categories = categories;
        this.sectionConcurrency = sectionConcurrency;
        this.fieldBatchSize = fieldBatchSize;
        this.permits = permits;
        this.permitTimeoutMs = permitTimeoutMs;
    }

    public record Mapping(String profileFieldKey, double confidence, boolean categoryConfirmed, Reason reason) {
    }

    public record Resolution(Map<String, Mapping> mappings, int jevCalls) {

        public Resolution {
            mappings = Map.copyOf(mappings);
        }
    }

    public Resolution resolve(GenericFieldsRequest request) {
        Map<String, Section> sectionsById = new HashMap<>();
        request.sections().forEach(section -> sectionsById.put(section.sectionId(), section));
        ConcurrentLinkedQueue<SectionWork> queue = new ConcurrentLinkedQueue<>();
        for (Section section : request.sections()) {
            SectionWork work = plan(section, sectionsById.get(section.parentSectionId()));
            if (!work.questions().isEmpty()) {
                queue.add(work);
            }
        }
        Map<String, Mapping> mappings = new ConcurrentHashMap<>();
        AtomicInteger jevCalls = new AtomicInteger();
        int workers = Math.min(sectionConcurrency, queue.size());
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> running = new ArrayList<>();
            for (int worker = 0; worker < workers; worker++) {
                running.add(executor.submit(() -> {
                    SectionWork next;
                    while ((next = queue.poll()) != null) {
                        mappings.putAll(resolveSection(next, jevCalls));
                    }
                }));
            }
            for (Future<?> future : running) {
                await(future);
            }
        }
        return new Resolution(mappings, jevCalls.get());
    }

    private Map<String, Mapping> resolveSection(SectionWork work, AtomicInteger jevCalls) {
        Map<String, JevClient.Judgement> answers = new HashMap<>();
        try {
            for (int start = 0; start < work.questions().size(); start += fieldBatchSize) {
                List<Question> batch = List.copyOf(work.questions()
                    .subList(start, Math.min(start + fieldBatchSize, work.questions().size())));
                ask(work, batch, answers, jevCalls);
            }
        }
        catch (ResolverException | PermitUnavailable exception) {
            log.warn("GENERIC_FIELDS_SECTION_UNAVAILABLE reason={} fields={}",
                exception.getClass().getSimpleName(), work.assignment().size());
            Map<String, Mapping> unavailable = new LinkedHashMap<>();
            work.assignment().keySet().forEach(candidateId -> unavailable.put(candidateId,
                new Mapping(null, 0.0, work.confirmed(), Reason.LLM_UNAVAILABLE)));
            return unavailable;
        }
        Map<String, Mapping> mappings = new LinkedHashMap<>();
        work.assignment().forEach((candidateId, questionId) -> {
            JevClient.Judgement judgement = answers.get(questionId);
            if (judgement == null) {
                mappings.put(candidateId, new Mapping(null, 0.0, work.confirmed(), null));
                return;
            }
            String key = JevClient.ABSTAIN.equals(judgement.choice()) ? null : judgement.choice();
            mappings.put(candidateId, new Mapping(key, judgement.confidence(), work.confirmed(), null));
        });
        return mappings;
    }

    /** 토큰 한도를 넘으면 배치를 반으로 나누고, 질문 1개도 넘으면 축소 state로 1회만 다시 묻는다. */
    private void ask(SectionWork work, List<Question> batch, Map<String, JevClient.Judgement> answers,
        AtomicInteger jevCalls) {
        try {
            answers.putAll(call(work, batch, state(work, work.questions(), false), jevCalls));
        }
        catch (TokenLimitExceeded exceeded) {
            if (batch.size() > 1) {
                int half = (batch.size() + 1) / 2;
                log.warn("GENERIC_FIELDS_TOKEN_LIMIT_SPLIT questions={} halves={}+{}",
                    batch.size(), half, batch.size() - half);
                ask(work, batch.subList(0, half), answers, jevCalls);
                ask(work, batch.subList(half, batch.size()), answers, jevCalls);
                return;
            }
            log.warn("GENERIC_FIELDS_TOKEN_LIMIT_REDUCED_STATE_RETRY questions=1 stateFields=1");
            try {
                answers.putAll(call(work, batch, state(work, batch, true), jevCalls));
            }
            catch (TokenLimitExceeded again) {
                log.warn("GENERIC_FIELDS_TOKEN_LIMIT_NULL_MAPPING questions=1");
            }
        }
    }

    private Map<String, JevClient.Judgement> call(SectionWork work, List<Question> batch, Map<String, Object> state,
        AtomicInteger jevCalls) {
        Map<String, JevClient.Choice> questions = new LinkedHashMap<>();
        batch.forEach(question -> questions.put(question.id(),
            new JevClient.Choice(instructions(question.id()), work.criteria())));
        try {
            if (!permits.tryAcquire(permitTimeoutMs, TimeUnit.MILLISECONDS)) {
                throw new PermitUnavailable();
            }
        }
        catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new PermitUnavailable();
        }
        try {
            jevCalls.incrementAndGet();
            return client.answer(state, questions);
        }
        finally {
            permits.release();
        }
    }

    static String instructions(String questionId) {
        return "Map fields." + questionId + " of this job application form section to exactly one applicant "
            + "profile field using its de-identified observation, the section context and confusionBoundaries. "
            + "Choose ABSTAIN for absent or ambiguous evidence. Do not split full names or invent values.";
    }

    private Map<String, Object> state(SectionWork work, List<Question> included, boolean reduced) {
        Map<String, Object> section = new LinkedHashMap<>(work.context());
        if (reduced) {
            section.remove("parent");
        }
        Map<String, Object> observed = new LinkedHashMap<>();
        included.forEach(question -> observed.put(question.id(), question.observation()));
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("section", section);
        state.put("fields", observed);
        state.put("confusionBoundaries", fields.promptGuidance());
        return state;
    }

    private SectionWork plan(Section section, Section parent) {
        String category = section.category();
        boolean confirmed = categories.contains(category)
            && !SectionCategories.MIXED.equals(category)
            && !SectionCategories.ABSTAIN.equals(category);
        List<String> keys = confirmed
            ? categories.keysOf(category)
            : fields.keys().stream()
                .filter(key -> !SectionCategories.NONE.equals(SectionCategories.categoryOf(key)))
                .toList();
        Map<String, String> criteria = new LinkedHashMap<>();
        keys.forEach(key -> criteria.put(key, "Applicant profile field " + key));
        criteria.put(JevClient.ABSTAIN, ABSTAIN_CRITERION);

        Map<String, Object> context = new LinkedHashMap<>();
        text(context, "label", section.displayName());
        if (confirmed) {
            context.put("category", category);
        }
        if (parent != null) {
            Map<String, Object> parentContext = new LinkedHashMap<>();
            text(parentContext, "label", parent.displayName());
            context.put("parent", parentContext);
        }

        List<Question> questions = new ArrayList<>();
        Map<String, String> assignment = new LinkedHashMap<>();
        for (FieldCandidate field : section.fields()) {
            assignment.put(field.candidateId(), add(questions, observation(field, -1)));
        }
        if (section.items() != null) {
            Map<String, List<String>> askedRows = new HashMap<>();
            for (int row = 0; row < section.items().size(); row++) {
                Item item = section.items().get(row);
                String fingerprint = fingerprint(item);
                List<String> asked = askedRows.get(fingerprint);
                if (asked != null) {
                    for (int index = 0; index < item.fields().size(); index++) {
                        assignment.put(item.fields().get(index).candidateId(), asked.get(index));
                    }
                    continue;
                }
                List<String> ids = new ArrayList<>();
                for (FieldCandidate field : item.fields()) {
                    String id = add(questions, observation(field, row));
                    ids.add(id);
                    assignment.put(field.candidateId(), id);
                }
                askedRows.put(fingerprint, ids);
            }
        }
        return new SectionWork(confirmed, Map.copyOf(criteria), context, List.copyOf(questions), assignment);
    }

    private static String add(List<Question> questions, Map<String, Object> observation) {
        String id = "field_" + questions.size();
        questions.add(new Question(id, observation));
        return id;
    }

    /** 행 번호와 후보 id를 뺀 라벨·칸 종류 순서. 같으면 같은 구조의 반복 행으로 본다. */
    private static String fingerprint(Item item) {
        List<String> parts = new ArrayList<>();
        parts.add(String.valueOf(item.itemGroupId()));
        for (FieldCandidate field : item.fields()) {
            Map<String, Object> observation = observation(field, -1);
            observation.remove("repeat");
            parts.add(observation.toString());
        }
        return String.join("\u0001", parts);
    }

    private static Map<String, Object> observation(FieldCandidate field, int row) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (row >= 0) {
            result.put("rowIndex", row);
        }
        text(result, "label", field.displayName());
        text(result, "placeholder", field.placeholder());
        result.put("element", field.element());
        result.put("control", field.control());
        result.put("visibility", field.visibility());
        var context = field.semanticContext();
        if (context != null) {
            if (context.labels() != null) {
                List<String> labels = context.labels().stream()
                    .map(label -> ProviderSemanticSanitizer.sanitize(label.text()))
                    .filter(Objects::nonNull).distinct().toList();
                if (!labels.isEmpty()) {
                    result.put("labels", labels);
                }
            }
            if (context.inputType() != null) {
                result.put("inputType", context.inputType());
            }
            if (context.autocomplete() != null) {
                result.put("autocomplete", context.autocomplete());
            }
            if (context.repeat() != null) {
                result.put("repeat", Map.of("rowIndex", context.repeat().rowIndex(),
                    "rowCount", context.repeat().rowCount()));
            }
        }
        if (field.options() != null) {
            result.put("options", field.options().stream()
                .map(option -> ProviderSemanticSanitizer.sanitize(option.displayName()))
                .filter(Objects::nonNull).distinct().toList());
        }
        return result;
    }

    private static void text(Map<String, Object> target, String key, String raw) {
        String safe = ProviderSemanticSanitizer.sanitize(raw);
        if (safe != null) {
            target.put(key, safe);
        }
    }

    private static void await(Future<?> future) {
        try {
            future.get();
        }
        catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("범용 칸 매칭이 중단되었습니다", exception);
        }
        catch (ExecutionException exception) {
            if (exception.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException(exception.getCause());
        }
    }

    private static Semaphore permits(int maxConcurrent) {
        if (maxConcurrent < 1) {
            throw new IllegalStateException("Invalid generic field analysis configuration");
        }
        return new Semaphore(maxConcurrent, true);
    }

    private record Question(String id, Map<String, Object> observation) {
    }

    private record SectionWork(
        boolean confirmed,
        Map<String, String> criteria,
        Map<String, Object> context,
        List<Question> questions,
        Map<String, String> assignment
    ) {
    }

    /** 서버 전체 동시 호출 상한 대기가 timeout을 넘었다. 값이나 응답 본문을 담지 않는다. */
    private static final class PermitUnavailable extends RuntimeException {

        PermitUnavailable() {
            super("JEV 동시 호출 상한 대기 시간을 넘었습니다", null, false, false);
        }
    }
}

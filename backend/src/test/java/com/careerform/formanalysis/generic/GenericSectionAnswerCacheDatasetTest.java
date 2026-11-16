package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.formanalysis.application.port.ChoiceModel;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * 평가 데이터셋의 칸 분석 요청으로 캐시가 줄이는 공급자 호출 수를 잰다. 호출 수는 답의 내용이 아니라 질문을 묶는 방식에
 * 달려 있어 공급자 키 없이 잴 수 있다. 아래 고정 값은 backend/docs/generic-section-answer-cache.md의 측정값과 같다.
 */
@DisplayName("평가 데이터셋 v5로 잰 섹션 결과 캐시의 공급자 호출 수")
class GenericSectionAnswerCacheDatasetTest {

    private static final int FIELD_BATCH_SIZE = 5;

    @Test
    @DisplayName("칸 분석 요청 4개를 순서대로 넣으면 섹션 31개 가운데 13개가 적중해 공급자 호출이 47회에서 29회로 준다")
    void cacheReducesProviderCallsOnDatasetV5() {
        List<GenericFieldsRequest> requests = new DatasetLoader(
            DatasetLoader.classpath(getClass().getClassLoader())).load("generic-matching", 5).cases().stream()
            .flatMap(evaluationCase -> evaluationCase.calls().stream())
            .filter(call -> call.kind() == CallKind.GENERIC_FIELDS)
            .map(call -> GenericFieldsJevHttp.JSON.treeToValue(call.request(), GenericFieldsRequest.class))
            .toList();
        var registry = new SimpleMeterRegistry();
        var countedWithout = new CountingModel();
        var countedWith = new CountingModel();
        var without = new ChoiceFieldResolver(countedWithout, FIELDS, CATEGORIES, 1, FIELD_BATCH_SIZE, 10, 8000);
        var with = new ChoiceFieldResolver(countedWith, FIELDS, CATEGORIES, 1, FIELD_BATCH_SIZE, new Semaphore(10), 8000,
            new SectionAnswerCache(true, 5000, Duration.ofDays(7), registry));

        var hit = registry.counter(SectionAnswerCache.METRIC, "outcome", "hit");
        var miss = registry.counter(SectionAnswerCache.METRIC, "outcome", "miss");
        List<String> hitsPerSections = new ArrayList<>();
        for (GenericFieldsRequest request : requests) {
            int hitsBefore = (int) hit.count();
            int sectionsBefore = (int) (hit.count() + miss.count());
            assertThat(with.resolve(request).mappings()).isEqualTo(without.resolve(request).mappings());
            hitsPerSections.add(request.site().host() + " " + ((int) hit.count() - hitsBefore) + "/"
                + ((int) (hit.count() + miss.count()) - sectionsBefore));
        }

        int hits = (int) hit.count();
        assertThat(requests).hasSize(4);
        assertThat(countedWith.calls.get()).isLessThan(countedWithout.calls.get());
        assertThat(Map.of("sections", hits + (int) miss.count(), "hits", hits,
            "callsWithoutCache", countedWithout.calls.get(), "callsWithCache", countedWith.calls.get()))
            .isEqualTo(Map.of("sections", 31, "hits", 13, "callsWithoutCache", 47, "callsWithCache", 29));
        assertThat(hitsPerSections).containsExactly("career.woowahan.com 0/8", "career.woowahan.com 7/8",
            "career.woowahan.com 6/8", "careers.nhn.com 0/7");
    }

    /** 모든 질문에 판단 보류로 답하고 호출 횟수만 센다. */
    private static final class CountingModel implements ChoiceModel {

        private final AtomicInteger calls = new AtomicInteger();

        @Override
        public String provider() {
            return "counting";
        }

        @Override
        public String model() {
            return "counting";
        }

        @Override
        public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
            calls.incrementAndGet();
            Map<String, Judgement> result = new LinkedHashMap<>();
            questions.keySet().forEach(id -> result.put(id, new Judgement(ABSTAIN, 0.5, Map.of())));
            return result;
        }

        @Override
        public Map<String, String> choose(Object state, Map<String, Question> questions) {
            throw new UnsupportedOperationException();
        }
    }
}

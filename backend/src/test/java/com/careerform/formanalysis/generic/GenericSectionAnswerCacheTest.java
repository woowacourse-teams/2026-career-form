package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.repeatedSection;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.section;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.tokenLimit;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.generic.ChoiceFieldResolver.Mapping;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Reason;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("범용 칸 분석의 섹션 단위 결과 캐시")
class GenericSectionAnswerCacheTest {

    private static final String SCHOOL = "education.university.schoolName";
    private static final String MAJOR = "education.university.majorName";

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final SectionAnswerCache cache = new SectionAnswerCache(true, 5000, Duration.ofDays(7), registry);

    @Test
    @DisplayName("공급자에 보낼 내용이 같은 섹션을 두 번 분석하면 두 번째에는 공급자를 부르지 않고 매핑이 같다")
    void secondAnalysisOfSameSectionSkipsProvider() {
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL, "field_1", MAJOR), 0.77));
        var request = request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("school", "학교명"), field("major", "전공")))));
        var resolver = resolver(cache);

        var first = resolver.resolve(request);
        var second = resolver.resolve(request);

        assertThat(first.modelCalls()).isEqualTo(1);
        assertThat(second.modelCalls()).isZero();
        assertThat(http.calls()).hasSize(1);
        assertThat(second.mappings()).isEqualTo(first.mappings()).containsOnly(
            Map.entry("school", new Mapping(SCHOOL, 0.77, true, null)),
            Map.entry("major", new Mapping(MAJOR, 0.77, true, null)));
    }

    @Test
    @DisplayName("앞 섹션에 줄이 더 있어 candidateId만 밀린 요청은 적중하고 답이 지금 요청의 candidateId에 붙는다")
    void shiftedCandidateIdsHitAndAttachToCurrentRequest() {
        http.respond(call -> "LANGUAGE".equals(call.category())
            ? answerAll(call, null, 0.5)
            : answers(call, Map.of("field_0", SCHOOL, "field_1", MAJOR), 0.9));
        var resolver = resolver(cache);
        resolver.resolve(request("example.test", List.of(
            section("lang", "LANGUAGE", List.of(field("candidate-0", "시험명"))),
            section("edu", "EDUCATION", List.of(field("candidate-1", "학교명"), field("candidate-2", "전공"))))));

        var shifted = resolver.resolve(request("example.test", List.of(
            section("lang", "LANGUAGE", List.of(field("candidate-0", "시험명"), field("candidate-1", "등급"))),
            section("edu", "EDUCATION", List.of(field("candidate-2", "학교명"), field("candidate-3", "전공"))))));

        assertThat(shifted.modelCalls()).isEqualTo(1);
        assertThat(http.calls()).extracting(GenericFieldsJevHttp.Call::category)
            .containsExactly("LANGUAGE", "EDUCATION", "LANGUAGE");
        assertThat(shifted.mappings().get("candidate-2")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
        assertThat(shifted.mappings().get("candidate-3")).isEqualTo(new Mapping(MAJOR, 0.9, true, null));
    }

    @Test
    @DisplayName("묶음 값이 같은 반복 줄이 하나인 요청과 셋인 요청은 같은 답을 쓴다")
    void oneRowAndThreeRowsShareAnswers() {
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL, "field_1", MAJOR), 0.9));
        var resolver = resolver(cache);
        resolver.resolve(request("example.test", List.of(repeatedSection("edu", "EDUCATION", rows(1)))));

        var three = resolver.resolve(request("example.test", List.of(repeatedSection("edu", "EDUCATION", rows(3)))));

        assertThat(http.calls()).hasSize(1);
        assertThat(three.modelCalls()).isZero();
        for (int row = 0; row < 3; row++) {
            assertThat(three.mappings().get("school-" + row)).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
            assertThat(three.mappings().get("major-" + row)).isEqualTo(new Mapping(MAJOR, 0.9, true, null));
        }
    }

    @Test
    @DisplayName("섹션 제목, 상위 제목, 범주, 라벨, placeholder, 입력 종류, 선택지 가운데 하나가 다르면 적중하지 않는다")
    void anyDifferenceSentToProviderMisses() {
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var resolver = resolver(cache);
        Map<String, GenericFieldsRequest> variants = new LinkedHashMap<>();
        variants.put("기준", variant("학력", "지원서", "EDUCATION", "학교명", "학교명", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("섹션 제목", variant("최종 학력", "지원서", "EDUCATION", "학교명", "학교명", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("상위 제목", variant("학력", "입사 지원", "EDUCATION", "학교명", "학교명", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("범주", variant("학력", "지원서", "LANGUAGE", "학교명", "학교명", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("라벨", variant("학력", "지원서", "EDUCATION", "전공", "학교명", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("placeholder", variant("학력", "지원서", "EDUCATION", "학교명", "전공", FormControl.SELECT,
            List.of("재학", "졸업")));
        variants.put("입력 종류", variant("학력", "지원서", "EDUCATION", "학교명", "학교명", FormControl.RADIO,
            List.of("재학", "졸업")));
        variants.put("선택지", variant("학력", "지원서", "EDUCATION", "학교명", "학교명", FormControl.SELECT,
            List.of("재학", "중퇴")));

        int expectedCalls = 0;
        for (var variant : variants.entrySet()) {
            var resolution = resolver.resolve(variant.getValue());
            expectedCalls++;
            assertThat(resolution.modelCalls()).as(variant.getKey()).isEqualTo(1);
            assertThat(http.calls()).as(variant.getKey()).hasSize(expectedCalls);
        }
        assertThat(resolver.resolve(variants.get("기준")).modelCalls()).isZero();
    }

    @Test
    @DisplayName("host, 경로, snapshotId, 섹션 id, DOM의 id와 name만 다른 같은 섹션은 적중한다")
    void requestOnlyIdentifiersDoNotSplitCache() {
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var resolver = resolver(cache);
        resolver.resolve(new GenericFieldsRequest(2, "snapshot-a",
            new GenericFieldsRequest.Site("first.example.test", "/apply/alpha"),
            List.of(new Section("section-1", null, "학력", List.of(domField("candidate-0", "dom-a", "name-a")), null,
                "EDUCATION"))));

        var other = resolver.resolve(new GenericFieldsRequest(2, "snapshot-b",
            new GenericFieldsRequest.Site("second.example.test", "/recruit/beta/form"),
            List.of(new Section("section-9", null, "학력", List.of(domField("candidate-7", "dom-b", "name-b")), null,
                "EDUCATION"))));

        assertThat(http.calls()).hasSize(1);
        assertThat(other.modelCalls()).isZero();
        assertThat(other.mappings().get("candidate-7")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
    }

    @Test
    @DisplayName("공급자가 실패한 섹션은 저장하지 않고 다음 요청이 공급자를 다시 부른다")
    void failedSectionIsNotStored() {
        var request = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("school", "학교명")))));
        var resolver = resolver(cache);
        http.respond(call -> new GenericFieldsJevHttp.Reply(503, "{}"));

        var failed = resolver.resolve(request);
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var retried = resolver.resolve(request);
        var cached = resolver.resolve(request);

        assertThat(failed.mappings().get("school")).isEqualTo(new Mapping(null, 0.0, true, Reason.LLM_UNAVAILABLE));
        assertThat(retried.modelCalls()).isEqualTo(1);
        assertThat(retried.mappings().get("school")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
        assertThat(cached.modelCalls()).isZero();
        assertThat(cached.mappings()).isEqualTo(retried.mappings());
    }

    @Test
    @DisplayName("허가 대기 초과로 답하지 못한 섹션은 저장하지 않는다")
    void permitTimeoutIsNotStored() throws Exception {
        var permits = new Semaphore(1);
        var resolver = new ChoiceFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 1, 5, permits, 1,
            cache);
        var request = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("school", "학교명")))));
        http.respond(call -> answerAll(call, SCHOOL, 0.9));

        permits.acquire();
        var waited = resolver.resolve(request);
        permits.release();
        var resumed = resolver.resolve(request);

        assertThat(waited.mappings().get("school").reason()).isEqualTo(Reason.LLM_UNAVAILABLE);
        assertThat(resumed.modelCalls()).isEqualTo(1);
        assertThat(resumed.mappings().get("school")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
    }

    @Test
    @DisplayName("토큰 한도로 한 질문의 답이 빠진 섹션은 저장하지 않는다")
    void tokenLimitGapIsNotStored() {
        var request = request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("school", "학교명"), field("major", "전공")))));
        var resolver = resolver(cache);
        http.respond(call -> call.questionIds().contains("field_1") ? tokenLimit() : answerAll(call, SCHOOL, 0.9));

        var gapped = resolver.resolve(request);
        int callsWithGap = http.calls().size();
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL, "field_1", MAJOR), 0.9));
        var complete = resolver.resolve(request);
        var cached = resolver.resolve(request);

        assertThat(gapped.mappings().get("school")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
        assertThat(gapped.mappings().get("major")).isEqualTo(new Mapping(null, 0.0, true, null));
        assertThat(callsWithGap).isEqualTo(4);
        assertThat(complete.modelCalls()).isEqualTo(1);
        assertThat(complete.mappings().get("major")).isEqualTo(new Mapping(MAJOR, 0.9, true, null));
        assertThat(cached.modelCalls()).isZero();
    }

    @Test
    @DisplayName("판단 보류는 답이므로 저장하고 확신도까지 그대로 돌려준다")
    void abstainIsStored() {
        var request = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("other", "설명")))));
        var resolver = resolver(cache);
        http.respond(call -> answerAll(call, null, 0.31));

        var first = resolver.resolve(request);
        var second = resolver.resolve(request);

        assertThat(http.calls()).hasSize(1);
        assertThat(second.mappings()).isEqualTo(first.mappings())
            .containsOnly(Map.entry("other", new Mapping(null, 0.31, true, null)));
    }

    @Test
    @DisplayName("평가용 사본(withModel, withBatching)은 원본이 채운 캐시를 읽지 않고 캐시에 쓰지도 않는다")
    void evaluationCopiesNeitherReadNorWrite() {
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var original = resolver(cache);
        var first = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("school", "학교명")))));
        var second = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("major", "전공")))));
        original.resolve(first);
        var otherHttp = new GenericFieldsJevHttp();
        otherHttp.respond(call -> answerAll(call, SCHOOL, 0.9));

        assertThat(original.withBatching(1, 5).resolve(first).modelCalls()).isEqualTo(1);
        assertThat(original.withBatching(1, 5).resolve(first).modelCalls()).isEqualTo(1);
        assertThat(original.withModel(GenericFieldsJevHttp.client(otherHttp), 1, 5).resolve(first).modelCalls())
            .isEqualTo(1);
        assertThat(original.withModel(GenericFieldsJevHttp.client(otherHttp), 1, 5).resolve(second).modelCalls())
            .isEqualTo(1);
        assertThat(original.withBatching(1, 5).resolve(second).modelCalls()).isEqualTo(1);

        assertThat(original.resolve(second).modelCalls()).isEqualTo(1);
        assertThat(original.resolve(first).modelCalls()).isZero();
        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "hit").count()).isEqualTo(1.0);
        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "miss").count()).isEqualTo(2.0);
    }

    @Test
    @DisplayName("캐시 없이 만든 분석기는 같은 섹션도 매번 공급자를 부른다")
    void resolverBuiltWithoutCacheAlwaysAsks() {
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var request = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("school", "학교명")))));
        var plain = new ChoiceFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 1, 5, 10, 8000);

        assertThat(plain.resolve(request).modelCalls()).isEqualTo(1);
        assertThat(plain.resolve(request).modelCalls()).isEqualTo(1);
    }

    @Test
    @DisplayName("설정으로 끄면 공급자 호출 횟수와 매핑이 캐시가 없을 때와 같고 지표도 오르지 않는다")
    void disabledCacheKeepsCurrentBehaviour() {
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL), 0.9));
        var request = request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("school", "학교명"), field("other", "설명")))));
        var disabled = resolver(new SectionAnswerCache(false, 5000, Duration.ofDays(7), registry));
        var plain = new ChoiceFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 1, 5, 10, 8000);

        var first = disabled.resolve(request);
        var second = disabled.resolve(request);
        var expected = plain.resolve(request);

        assertThat(first.modelCalls()).isEqualTo(1);
        assertThat(second.modelCalls()).isEqualTo(1);
        assertThat(first.mappings()).isEqualTo(expected.mappings());
        assertThat(second.mappings()).isEqualTo(expected.mappings());
        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "hit").count()).isZero();
        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "miss").count()).isZero();
    }

    @Test
    @DisplayName("적중과 실패 횟수를 outcome 태그가 붙은 카운터로 센다")
    void countsHitsAndMisses() {
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        var resolver = resolver(cache);
        var request = request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("school", "학교명"))),
            section("lang", "LANGUAGE", List.of(field("test", "시험명")))));

        assertThat(registry.find(SectionAnswerCache.METRIC).counters()).hasSize(2);
        resolver.resolve(request);
        resolver.resolve(request);
        resolver.resolve(request);

        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "miss").count()).isEqualTo(2.0);
        assertThat(registry.counter(SectionAnswerCache.METRIC, "outcome", "hit").count()).isEqualTo(4.0);
    }

    @Test
    @DisplayName("기한이 지난 답은 버리고 공급자를 다시 부른다")
    void expiredEntryIsAskedAgain() {
        var nanos = new AtomicLong();
        var expiring = new SectionAnswerCache(true, 5000, Duration.ofDays(7), registry, nanos::get);
        var resolver = resolver(expiring);
        var request = request("example.test", List.of(section("edu", "EDUCATION", List.of(field("school", "학교명")))));
        http.respond(call -> answerAll(call, SCHOOL, 0.9));
        resolver.resolve(request);

        nanos.set(Duration.ofDays(7).minusSeconds(1).toNanos());
        int beforeExpiry = resolver.resolve(request).modelCalls();
        nanos.set(Duration.ofDays(7).plusSeconds(1).toNanos());
        int afterExpiry = resolver.resolve(request).modelCalls();

        assertThat(beforeExpiry).isZero();
        assertThat(afterExpiry).isEqualTo(1);
    }

    @Test
    @DisplayName("크기 상한을 넘게 넣어도 저장된 섹션 수는 상한 안에 머문다")
    void keepsAtMostConfiguredSections() {
        var small = new SectionAnswerCache(true, 2, Duration.ofDays(7), registry);
        var judgement = Map.of("field_0", new ChoiceModel.Judgement(SCHOOL, 0.9, Map.of()));

        IntStream.range(0, 20).forEach(index -> small.store(
            small.key("jev-test", Map.of("section", Map.of("label", "섹션 " + index)), Map.of()), judgement));

        assertThat(small.size()).isLessThanOrEqualTo(2);
    }

    @Test
    @DisplayName("키는 선택 기준의 순서와 무관하고 모델 이름, 섹션 상태, 선택 기준 가운데 하나가 다르면 달라진다")
    void keyIsOrderIndependentAndCoversModelStateAndCriteria() {
        Map<String, Object> state = Map.of("section", Map.of("label", "학력"), "fields", Map.of("field_0",
            Map.of("label", "학교명", "element", FormElement.INPUT)));
        Map<String, String> forward = new LinkedHashMap<>();
        forward.put("a", "first");
        forward.put("b", "second");
        Map<String, String> backward = new LinkedHashMap<>();
        backward.put("b", "second");
        backward.put("a", "first");

        String key = cache.key("jev-latest", state, forward);

        assertThat(key).matches("[0-9a-f]{64}").isEqualTo(cache.key("jev-latest", state, backward));
        assertThat(cache.key("jev-next", state, forward)).isNotEqualTo(key);
        assertThat(cache.key("jev-latest", Map.of("section", Map.of("label", "경력")), forward)).isNotEqualTo(key);
        assertThat(cache.key("jev-latest", state, Map.of("a", "first", "b", "changed"))).isNotEqualTo(key);
    }

    @Test
    @DisplayName("저장한 답에는 선택과 확신도만 남기고 선택지별 확률은 두지 않는다")
    void storesOnlyChoiceAndConfidence() {
        String key = cache.key("jev-test", Map.of("section", Map.of("label", "학력")), Map.of());

        cache.store(key, Map.of("field_0", new ChoiceModel.Judgement(SCHOOL, 0.9, Map.of(SCHOOL, 0.9, MAJOR, 0.1))));

        assertThat(cache.find(key)).containsOnly(
            Map.entry("field_0", new ChoiceModel.Judgement(SCHOOL, 0.9, Map.of())));
    }

    @Test
    @DisplayName("켠 캐시의 크기 상한이나 기한이 0 이하이면 시작하지 않는다")
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new SectionAnswerCache(true, 0, Duration.ofDays(7), registry))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new SectionAnswerCache(true, 5000, Duration.ZERO, registry))
            .isInstanceOf(IllegalStateException.class);
    }

    private ChoiceFieldResolver resolver(SectionAnswerCache answerCache) {
        return new ChoiceFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES, 1, 5, new Semaphore(10),
            8000, answerCache);
    }

    private static List<Item> rows(int count) {
        return IntStream.range(0, count).mapToObj(row -> new Item("row-" + row,
            List.of(field("school-" + row, "학교명"), field("major-" + row, "전공")), "education")).toList();
    }

    private static FieldCandidate domField(String candidateId, String domId, String domName) {
        return new FieldCandidate(candidateId, FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "학교명",
            domId, domName, null, null, null, null, null);
    }

    /** 상위 섹션(칸 없음) 아래에 칸 하나짜리 섹션을 둔 요청. 인자 하나만 바꿔 공급자에 가는 내용의 차이를 만든다. */
    private static GenericFieldsRequest variant(String title, String parentTitle, String category, String label,
        String placeholder, FormControl control, List<String> options) {
        List<Option> choices = IntStream.range(0, options.size())
            .mapToObj(index -> new Option("option-" + index, options.get(index))).toList();
        var candidate = new FieldCandidate("candidate-0", FormElement.SELECT, control, Visibility.VISIBLE, label,
            null, null, placeholder, null, null, null, choices);
        return request("example.test", List.of(
            new Section("parent", null, parentTitle, List.of(), null, null),
            new Section("child", "parent", title, List.of(candidate), null, category)));
    }
}

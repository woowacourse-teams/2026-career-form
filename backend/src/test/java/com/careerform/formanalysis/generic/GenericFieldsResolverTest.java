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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Item;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Reason;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver.Mapping;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

@DisplayName("범용 섹션별 칸 매칭 resolver")
class GenericFieldsResolverTest {

    private static final String SCHOOL = "education.university.schoolName";
    private static final String MAJOR = "education.university.majorName";
    private static final String SYNTHETIC_VALUE = "SYNTHETIC_PRIVATE_8421";

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @Test
    @DisplayName("확정 범주 섹션은 그 범주 키와 ABSTAIN만, MIXED·ABSTAIN·미확정 범주는 NONE을 뺀 전체 키로 묻는다")
    void narrowsCriteriaToSectionCategory() {
        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("c-edu", "학교명"))),
            section("mixed", "MIXED", List.of(field("c-mixed", "학교명"))),
            section("abstain", "ABSTAIN", List.of(field("c-abstain", "학교명"))),
            section("unknown", null, List.of(field("c-unknown", "학교명"))),
            section("other", "HOBBY", List.of(field("c-other", "학교명"))))));

        Set<String> education = keys(key -> key.startsWith("education."));
        Set<String> allButNone = keys(key -> !SectionCategories.categoryOf(key).equals(SectionCategories.NONE));
        assertThat(http.calls()).hasSize(5);
        for (var call : http.calls()) {
            Set<String> criteria = new HashSet<>(call.criteria(call.questionIds().getFirst()));
            assertThat(criteria).isEqualTo("EDUCATION".equals(call.category()) ? education : allButNone);
        }
        assertThat(resolution.mappings().get("c-edu").categoryConfirmed()).isTrue();
        assertThat(List.of("c-mixed", "c-abstain", "c-unknown", "c-other"))
            .allSatisfy(id -> assertThat(resolution.mappings().get(id).categoryConfirmed()).isFalse());
    }

    @Test
    @DisplayName("섹션 4개는 섹션 동시 상한 3개의 작업자로만 JEV를 호출한다")
    void limitsSectionConcurrency() throws Exception {
        var entered = new CountDownLatch(3);
        var release = new CountDownLatch(1);
        var active = new AtomicInteger();
        var maxActive = new AtomicInteger();
        http.respond(call -> {
            maxActive.accumulateAndGet(active.incrementAndGet(), Math::max);
            entered.countDown();
            try {
                assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                return answerAll(call, SCHOOL, 0.9);
            }
            finally {
                active.decrementAndGet();
            }
        });
        var resolver = resolver(3, 5, 10);
        var pending = CompletableFuture.supplyAsync(() -> resolver.resolve(request("example.test", List.of(
            section("s1", "EDUCATION", List.of(field("c1", "학교명"))),
            section("s2", "EDUCATION", List.of(field("c2", "학교명"))),
            section("s3", "EDUCATION", List.of(field("c3", "학교명"))),
            section("s4", "EDUCATION", List.of(field("c4", "학교명")))))));

        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(active.get()).isEqualTo(3);
        release.countDown();
        var resolution = pending.get(10, TimeUnit.SECONDS);

        assertThat(http.calls()).hasSize(4);
        assertThat(maxActive.get()).isEqualTo(3);
        assertThat(http.calls().stream().map(GenericFieldsJevHttp.Call::thread).distinct()).hasSize(3);
        assertThat(resolution.mappings()).hasSize(4)
            .allSatisfy((id, mapping) -> assertThat(mapping.profileFieldKey()).isEqualTo(SCHOOL));
    }

    @Test
    @DisplayName("구조 지문이 같은 반복 행 3개는 첫 행만 한 번 묻고 나머지 행은 같은 매핑으로 복제한다")
    void asksOnlyFirstRowOfStructurallyIdenticalRows() {
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL, "field_1", MAJOR), 0.77));
        List<Item> rows = IntStream.range(0, 3).mapToObj(row -> new Item("row-" + row,
            List.of(field("school-" + row, "학교명"), field("major-" + row, "전공")))).toList();

        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            repeatedSection("edu", "EDUCATION", rows))));

        assertThat(http.calls()).hasSize(1);
        assertThat(http.calls().getFirst().questionIds()).containsExactly("field_0", "field_1");
        assertThat(http.calls().getFirst().state().path("fields").size()).isEqualTo(2);
        for (int row = 0; row < 3; row++) {
            assertThat(resolution.mappings().get("school-" + row)).isEqualTo(new Mapping(SCHOOL, 0.77, true, null));
            assertThat(resolution.mappings().get("major-" + row)).isEqualTo(new Mapping(MAJOR, 0.77, true, null));
        }
        assertThat(resolution.jevCalls()).isEqualTo(1);
    }

    @Test
    @DisplayName("한 섹션의 JEV 장애는 그 섹션만 null 매핑과 LLM_UNAVAILABLE로 응답한다")
    void providerFailureOnlyAffectsThatSection() {
        http.respond(call -> "LANGUAGE".equals(call.category())
            ? new GenericFieldsJevHttp.Reply(503, "{}")
            : answerAll(call, SCHOOL, 0.9));

        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("edu-1", "학교명"))),
            section("lang", "LANGUAGE", List.of(field("lang-1", "시험명"), field("lang-2", "등급"))))));

        assertThat(resolution.mappings().get("edu-1")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
        assertThat(List.of("lang-1", "lang-2")).allSatisfy(id -> assertThat(resolution.mappings().get(id))
            .isEqualTo(new Mapping(null, 0.0, true, Reason.LLM_UNAVAILABLE)));
    }

    @Test
    @DisplayName("서버 전체 동시 호출 상한 대기가 timeout을 넘으면 JEV를 호출하지 않고 LLM_UNAVAILABLE로 응답한다")
    void serverWideLimitTimeoutIsUnavailable() throws Exception {
        var permits = new Semaphore(1);
        var resolver = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(http), FIELDS, CATEGORIES,
            3, 5, permits, 1);
        var request = request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("edu-1", "학교명")))));
        http.respond(call -> answerAll(call, SCHOOL, 0.9));

        permits.acquire();
        var waited = resolver.resolve(request);
        permits.release();
        var resumed = resolver.resolve(request);

        assertThat(waited.mappings().get("edu-1")).isEqualTo(new Mapping(null, 0.0, true, Reason.LLM_UNAVAILABLE));
        assertThat(waited.jevCalls()).isZero();
        assertThat(resumed.mappings().get("edu-1")).isEqualTo(new Mapping(SCHOOL, 0.9, true, null));
        assertThat(http.calls()).hasSize(1);
        assertThat(permits.availablePermits()).isEqualTo(1);
    }

    @Test
    @DisplayName("질문 12개 섹션은 5/5/2 배치로 호출한다")
    void batchesQuestionsByFive() {
        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("edu", "EDUCATION", fields(12)))));

        assertThat(http.calls()).extracting(call -> call.questionIds().size()).containsExactly(5, 5, 2);
        assertThat(http.calls().getFirst().state().path("fields").size()).isEqualTo(12);
        assertThat(resolution.jevCalls()).isEqualTo(3);
    }

    @Test
    @DisplayName("TokenLimitExceeded는 배치를 반으로 나눠 재시도하고 질문 1개도 초과하면 state를 줄여 1회 재시도한 뒤 그 칸만 null로 둔다")
    void tokenLimitSplitsBatchesThenReducesStateOnce() {
        http.respond(call -> {
            List<String> ids = call.questionIds();
            boolean fullState = call.state().path("fields").size() > 1;
            if (ids.size() >= 3 || ids.contains("field_1") || (ids.contains("field_0") && fullState)) {
                return tokenLimit();
            }
            return answerAll(call, SCHOOL, 0.9);
        });

        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("edu", "EDUCATION", fields(12)))));

        assertThat(http.calls()).extracting(call -> call.questionIds().size())
            .containsExactly(5, 3, 2, 1, 1, 1, 1, 1, 2, 5, 3, 2, 1, 2, 2);
        var reduced = http.calls().stream().filter(call -> call.state().path("fields").size() == 1).toList();
        assertThat(reduced).extracting(GenericFieldsJevHttp.Call::questionIds)
            .containsExactly(List.of("field_0"), List.of("field_1"));
        assertThat(reduced).allSatisfy(call -> assertThat(call.state().path("section").has("parent")).isFalse());
        assertThat(resolution.jevCalls()).isEqualTo(15);
        assertThat(resolution.mappings().get("c1")).isEqualTo(new Mapping(null, 0.0, true, null));
        assertThat(IntStream.range(0, 12).filter(index -> index != 1).mapToObj(index -> "c" + index))
            .allSatisfy(id -> assertThat(resolution.mappings().get(id)).isEqualTo(new Mapping(SCHOOL, 0.9, true, null)));
    }

    @Test
    @DisplayName("answer()의 confidence를 min-confidence 컷 없이 그대로 전달하고 ABSTAIN은 null 매핑으로 둔다")
    void passesConfidenceThroughWithoutCut() {
        http.respond(call -> answers(call, Map.of("field_0", SCHOOL), 0.31));

        var resolution = resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("edu", "EDUCATION", List.of(field("school", "학교명"), field("other", "설명"))))));

        assertThat(resolution.mappings().get("school")).isEqualTo(new Mapping(SCHOOL, 0.31, true, null));
        assertThat(resolution.mappings().get("other")).isEqualTo(new Mapping(null, 0.31, true, null));
    }

    @Test
    @DisplayName("공급자 요청에는 정제된 라벨만 보내고 페이지 원문 값과 부모 밖 섹션을 보내지 않는다")
    void sendsOnlySanitizedSectionAndParentState() {
        var parent = new GenericFieldsRequest.Section("sec-parent", null, "학력", List.of(field("cand-parent", "학교명")), null,
            "EDUCATION");
        var child = new GenericFieldsRequest.Section("sec-child", "sec-parent", "대학교",
            List.of(new FieldCandidate("cand-child", GenericFieldsRequest.FormElement.INPUT,
                GenericFieldsRequest.FormControl.TEXT, GenericFieldsRequest.Visibility.VISIBLE,
                "학교명 " + SYNTHETIC_VALUE, null, null, SYNTHETIC_VALUE, null, null, null, null)),
            null, "EDUCATION");
        var unrelated = section("sec-lang", "LANGUAGE", List.of(field("cand-lang", "시험명 " + SYNTHETIC_VALUE)));

        resolver(1, 5, 10).resolve(request("example.test", List.of(parent, child, unrelated)));

        assertThat(http.bodies()).hasSize(3).allSatisfy(body -> assertThat(body)
            .doesNotContain(SYNTHETIC_VALUE, "cand-", "sec-"));
        var childCall = http.calls().stream()
            .filter(call -> call.state().path("section").has("parent")).toList();
        assertThat(childCall).hasSize(1);
        assertThat(childCall.getFirst().state().path("fields").size()).isEqualTo(1);
        assertThat(childCall.getFirst().state().path("confusionBoundaries").asString())
            .isEqualTo(FIELDS.promptGuidance());
    }

    private JevCategoryFieldResolver resolver(int sectionConcurrency, int batchSize, int maxConcurrent) {
        JevClient client = GenericFieldsJevHttp.client(http);
        return new JevCategoryFieldResolver(client, FIELDS, CATEGORIES, sectionConcurrency, batchSize,
            maxConcurrent, 8000);
    }

    private static List<FieldCandidate> fields(int count) {
        List<FieldCandidate> fields = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            fields.add(field("c" + index, "학교명"));
        }
        return fields;
    }

    private static Set<String> keys(java.util.function.Predicate<String> filter) {
        Set<String> keys = new HashSet<>();
        FIELDS.keys().stream().filter(filter).forEach(keys::add);
        keys.add(JevClient.ABSTAIN);
        return keys;
    }
}

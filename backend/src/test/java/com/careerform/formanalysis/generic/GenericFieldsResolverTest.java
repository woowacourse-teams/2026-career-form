package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.field;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.fixture;
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
        for (String key : List.copyOf(education)) {
            if (FIELDS.isDateField(key)) {
                for (String part : List.of("YEAR", "MONTH", "DAY")) {
                    education.add("DATE_PART:" + key + ":" + part);
                }
            }
        }
        for (String key : List.copyOf(allButNone)) {
            if (FIELDS.isDateField(key)) {
                for (String part : List.of("YEAR", "MONTH", "DAY")) {
                    allButNone.add("DATE_PART:" + key + ":" + part);
                }
            }
        }
        allButNone.addAll(List.of("KOREAN_FULL_NAME", "ENGLISH_FULL_NAME_GIVEN_FIRST",
            "ENGLISH_FULL_NAME_FAMILY_FIRST"));
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

    private static final String RESPONSIBILITIES = "careers.career.responsibilities";
    private static final String CERTIFICATE_NAME = "certifications.certificate.name";
    private static final String CERTIFICATE_ISSUER = "certifications.certificate.issuer";
    private static final String TEST_NAME = "languages.languageTest.testName";
    private static final String TEST_GRADE = "languages.languageTest.grade";
    private static final List<String> TARGET_KEYS =
        List.of(RESPONSIBILITIES, CERTIFICATE_NAME, CERTIFICATE_ISSUER, TEST_NAME, TEST_GRADE);
    private static final List<String> FIXTURES =
        List.of("naver-career-sections.request.json", "independent-synthetic-sections.request.json");

    /** 전달 경로 특성화용 판단. 동시 존재하는 점수·등급은 아래 payload 기반 판단에서 함께 기권한다. */
    private static final Map<String, String> IDEAL = Map.ofEntries(
        Map.entry("CAREER|업무내용(요약)", RESPONSIBILITIES), Map.entry("CAREER|담당 업무", RESPONSIBILITIES),
        Map.entry("CERTIFICATE|자격/면허종류", CERTIFICATE_NAME), Map.entry("CERTIFICATE|자격증명", CERTIFICATE_NAME),
        Map.entry("CERTIFICATE|발급기관", CERTIFICATE_ISSUER), Map.entry("CERTIFICATE|수여 기관", CERTIFICATE_ISSUER),
        Map.entry("LANGUAGE|시험", TEST_NAME), Map.entry("LANGUAGE|어학 시험명", TEST_NAME));

    private static String ideal(String category, String label) {
        return IDEAL.get(category + "|" + label);
    }

    /** 섹션에서 JEV가 실제로 받는 질문 순서: 섹션 칸 다음 첫 반복 행(구조가 같은 행은 한 번만 묻는다). */
    private static List<FieldCandidate> askedCandidates(GenericFieldsRequest.Section section) {
        List<FieldCandidate> asked = new ArrayList<>(section.fields());
        if (section.items() != null && !section.items().isEmpty()) {
            asked.addAll(section.items().getFirst().fields());
        }
        return asked;
    }

    /** 정제된 관측 문구와 무관하게 요청 구조 의미로 판단하는 이상적인 JEV. */
    private static GenericFieldsJevHttp.Reply idealReply(GenericFieldsRequest request,
        GenericFieldsJevHttp.Call call) {
        var section = request.sections().stream()
            .filter(candidate -> candidate.category().equals(call.category())).findFirst().orElseThrow();
        List<FieldCandidate> asked = askedCandidates(section);
        Map<String, String> choices = new java.util.LinkedHashMap<>();
        for (int index = 0; index < asked.size(); index++) {
            choices.put("field_" + index, ideal(section.category(), asked.get(index).displayName()));
        }
        return answers(call, choices, 0.9);
    }

    private static Map<String, String> expectedByCandidate(GenericFieldsRequest request) {
        Map<String, String> expected = new java.util.LinkedHashMap<>();
        for (var section : request.sections()) {
            List<FieldCandidate> all = new ArrayList<>(section.fields());
            if (section.items() != null) {
                section.items().forEach(item -> all.addAll(item.fields()));
            }
            all.forEach(candidate -> expected.put(candidate.candidateId(),
                ideal(section.category(), candidate.displayName())));
        }
        return expected;
    }

    @Test
    @DisplayName("두 독립 fixture에서 대상 5개 키가 해당 범주 criteria에만 있고 다른 범주 키는 섞이지 않는다")
    void targetKeysAreOfferedOnlyInsideTheirCategory() {
        for (String name : FIXTURES) {
            var local = new GenericFieldsJevHttp();
            local.respond(call -> answerAll(call, null, 0.9));
            new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS, CATEGORIES, 3, 5, 10, 8000)
                .resolve(fixture(name));

            assertThat(local.calls()).hasSize(3);
            for (var call : local.calls()) {
                Set<String> criteria = new HashSet<>(call.criteria(call.questionIds().getFirst()));
                String prefix = switch (call.category()) {
                    case "CAREER" -> "careers.";
                    case "CERTIFICATE" -> "certifications.";
                    default -> "languages.";
                };
                assertThat(criteria).contains(JevClient.ABSTAIN)
                    .allSatisfy(key -> assertThat(key.startsWith(prefix) || key.equals(JevClient.ABSTAIN)
                        || key.startsWith("DATE_PART:" + prefix)).as(key).isTrue());
                assertThat(criteria).containsAll(TARGET_KEYS.stream().filter(key -> key.startsWith(prefix)).toList());
            }
        }
    }

    @Test
    @DisplayName("두 독립 fixture에서 이상적인 JEV 판단이 기존 키로 전달되고 모호한 칸은 연결되지 않는다")
    void clearTargetsReachMappingsAndAmbiguousFieldsStayUnlinked() {
        for (String name : FIXTURES) {
            GenericFieldsRequest request = fixture(name);
            var local = new GenericFieldsJevHttp();
            local.respond(call -> idealReply(request, call));
            var resolution = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS, CATEGORIES,
                3, 5, 10, 8000).resolve(request);

            Map<String, String> expected = expectedByCandidate(request);
            expected.forEach((candidateId, key) -> {
                assertThat(resolution.mappings()).containsKey(candidateId);
                Mapping mapping = resolution.mappings().get(candidateId);
                assertThat(mapping.profileFieldKey()).as(name + " " + candidateId).isEqualTo(key);
                assertThat(mapping.categoryConfirmed()).isTrue();
                assertThat(mapping.reason()).isNull();
            });
            // 두 원본 모두 별도 점수·등급 칸이 함께 있다. 같은 키의 단독 대상은 별도 ablation 검사에서 확인한다.
            assertThat(expected.values().stream().filter(java.util.Objects::nonNull).distinct().toList())
                .containsExactlyInAnyOrderElementsOf(TARGET_KEYS.stream().filter(key -> !TEST_GRADE.equals(key)).toList());
        }
    }

    @Test
    @DisplayName("다른 범주 키를 고른 응답은 범주 한정 때문에 연결되지 않는다")
    void crossCategoryChoiceIsNotLinked() {
        GenericFieldsRequest request = fixture(FIXTURES.getFirst());
        http.respond(call -> answerAll(call, CERTIFICATE_ISSUER, 0.9));
        var resolution = resolver(3, 5, 10).resolve(request);

        assertThat(resolution.mappings().get("nv-cert-issuer").profileFieldKey()).isEqualTo(CERTIFICATE_ISSUER);
        assertThat(resolution.mappings().get("nv-lang-issuer").profileFieldKey()).isNull();
        assertThat(resolution.mappings().get("nv-career-job-0").profileFieldKey()).isNull();
    }

    @Test
    @DisplayName("잘못된 범주·JEV 기권·단일 질문 토큰 초과는 공급자 요청 흔적으로 구분된다")
    void wrongCategoryAbstainAndTokenLimitLeaveDifferentTraces() {
        GenericFieldsRequest request = fixture(FIXTURES.getFirst());
        var careerOnly = new GenericFieldsRequest(2, "snap", request.site(), List.of(request.sections().getFirst()));

        // 잘못된 범주: criteria에 대상 키가 아예 없고, JEV는 기권만 고를 수 있다.
        var wrong = new GenericFieldsRequest(2, "snap", request.site(), List.of(new GenericFieldsRequest.Section(
            "sec-wrong", null, "경력사항", List.of(), careerOnly.sections().getFirst().items(), "EDUCATION")));
        http.respond(call -> answerAll(call, RESPONSIBILITIES, 0.9));
        assertThat(resolver(1, 5, 10).resolve(wrong).mappings().get("nv-career-job-0").profileFieldKey()).isNull();
        assertThat(http.calls().getFirst().criteria(http.calls().getFirst().questionIds().getLast()))
            .doesNotContain(RESPONSIBILITIES);

        // 기권: criteria에 키가 있으나 JEV가 ABSTAIN을 고른다.
        var abstainHttp = new GenericFieldsJevHttp();
        abstainHttp.respond(call -> answerAll(call, JevClient.ABSTAIN, 0.9));
        var abstained = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(abstainHttp), FIELDS, CATEGORIES, 1, 5, 10, 8000)
            .resolve(careerOnly);
        assertThat(abstained.mappings().get("nv-career-job-0").profileFieldKey()).isNull();
        assertThat(abstainHttp.calls().getFirst().criteria(abstainHttp.calls().getFirst().questionIds().getFirst()))
            .contains(RESPONSIBILITIES);

        // 단일 질문 토큰 초과: 축소 state로 한 번 더 묻고도 넘으면 null이 되며 호출 수가 늘어난다.
        var limitHttp = new GenericFieldsJevHttp();
        limitHttp.respond(call -> tokenLimit());
        var limited = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(limitHttp), FIELDS, CATEGORIES, 1, 5, 10, 8000)
            .resolve(careerOnly);
        assertThat(limited.mappings().get("nv-career-job-0").profileFieldKey()).isNull();
        assertThat(limited.mappings().get("nv-career-job-0").reason()).isNull();
        assertThat(limitHttp.calls()).hasSizeGreaterThan(1);
        assertThat(limitHttp.calls().getLast().state().path("fields").size()).isEqualTo(1);
    }

    @Test
    @DisplayName("대상 키의 criteria 설명은 키 이름만 되풀이하지 않고 서로 구별된다")
    void criteriaDescribeMeaningBeyondKeyName() {
        for (String name : FIXTURES) {
            var local = new GenericFieldsJevHttp();
            local.respond(call -> answerAll(call, null, 0.9));
            new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS, CATEGORIES, 3, 5, 10, 8000)
                .resolve(fixture(name));

            Set<String> descriptions = new HashSet<>();
            for (var call : local.calls()) {
                String question = call.questionIds().getFirst();
                for (String key : TARGET_KEYS) {
                    var node = call.request().path("questions").path(question).path("criteria").path(key);
                    if (node.isMissingNode()) {
                        continue;
                    }
                    assertThat(node.asString()).as(name + " " + key).contains(key)
                        .isNotEqualTo("Applicant profile field " + key);
                    descriptions.add(node.asString());
                }
            }
            assertThat(descriptions).hasSize(TARGET_KEYS.size());
        }
    }

    @Test
    @DisplayName("두 독립 fixture에서 대상 칸의 라벨 의미가 정제 뒤에도 공급자 관측에 남는다")
    void targetFieldsKeepMeaningfulObservation() {
        for (String name : FIXTURES) {
            GenericFieldsRequest request = fixture(name);
            var local = new GenericFieldsJevHttp();
            local.respond(call -> idealReply(request, call));
            new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS, CATEGORIES, 3, 5, 10, 8000)
                .resolve(request);

            for (var call : local.calls()) {
                var section = request.sections().stream()
                    .filter(candidate -> candidate.category().equals(call.category())).findFirst().orElseThrow();
                List<FieldCandidate> asked = askedCandidates(section);
                for (int index = 0; index < asked.size(); index++) {
                    if (ideal(section.category(), asked.get(index).displayName()) == null) {
                        continue;
                    }
                    var observation = call.state().path("fields").path("field_" + index);
                    assertThat(observation.has("label") || observation.has("labels"))
                        .as(name + " " + asked.get(index).displayName()).isTrue();
                }
            }
        }
    }

    @Test
    @DisplayName("공급자 관측은 구조 필드를 전달하고 행 개수는 보내지 않으며 rowIndex만 유지한다")
    void observationProjectsStructureWithoutCounts() {
        var naverHttp = new GenericFieldsJevHttp();
        naverHttp.respond(call -> answerAll(call, null, 0.9));
        new JevCategoryFieldResolver(GenericFieldsJevHttp.client(naverHttp), FIELDS, CATEGORIES, 3, 5, 10, 8000)
            .resolve(fixture(FIXTURES.getFirst()));
        var syntheticHttp = new GenericFieldsJevHttp();
        syntheticHttp.respond(call -> answerAll(call, null, 0.9));
        new JevCategoryFieldResolver(GenericFieldsJevHttp.client(syntheticHttp), FIELDS, CATEGORIES, 3, 5, 10, 8000)
            .resolve(fixture(FIXTURES.getLast()));

        assertThat(naverHttp.bodies()).allSatisfy(body -> assertThat(body).doesNotContain("rowCount"));
        assertThat(syntheticHttp.bodies()).allSatisfy(body -> assertThat(body).doesNotContain("rowCount"));
        var naverFields = new ArrayList<tools.jackson.databind.JsonNode>();
        naverHttp.calls().forEach(call -> call.state().path("fields").forEach(naverFields::add));
        assertThat(naverFields).anySatisfy(node -> {
            assertThat(node.path("maxLength").asInt()).isEqualTo(30);
            assertThat(node.path("repeat").path("rowIndex").asInt(-1)).isZero();
            assertThat(node.path("labelSources").size()).isPositive();
        });
        var syntheticFields = new ArrayList<tools.jackson.databind.JsonNode>();
        syntheticHttp.calls().forEach(call -> call.state().path("fields").forEach(syntheticFields::add));
        assertThat(syntheticFields).anySatisfy(node -> {
            assertThat(node.path("maxLength").asInt()).isEqualTo(500);
            assertThat(node.path("required").asBoolean()).isTrue();
        });
    }

    @Test
    @DisplayName("라벨 의미 보강은 확정된 경력·자격·어학 섹션에만 적용된다")
    void labelVocabularyAppliesOnlyToConfirmedCareerCertificateLanguageSections() {
        http.respond(call -> answerAll(call, null, 0.9));
        resolver(3, 5, 10).resolve(request("example.test", List.of(
            section("career", "CAREER", List.of(field("c-career", "업무내용"))),
            section("education", "EDUCATION", List.of(field("c-education", "업무내용"))),
            section("mixed", "MIXED", List.of(field("c-mixed", "업무내용"))))));

        for (var call : http.calls()) {
            var label = call.state().path("fields").path("field_0").path("label").asString();
            assertThat(label).as(call.category()).startsWith("업무내용");
            assertThat(label.contains("job duties")).as(call.category()).isEqualTo("CAREER".equals(call.category()));
        }
    }

    @Test
    @DisplayName("두 구조에서 점수만 또는 등급만 물으면 기존 등급·점수 키를 전달한다")
    void scoreOnlyAndGradeOnlyUseExistingResultKey() {
        for (String name : FIXTURES) {
            boolean sourceStructure = name.equals(FIXTURES.getFirst());
            String scoreId = sourceStructure ? "nv-lang-score" : "sy-lang-points";
            String gradeId = sourceStructure ? "nv-lang-grade" : "sy-lang-level";
            for (String omittedId : List.of(scoreId, gradeId)) {
                var local = new GenericFieldsJevHttp();
                local.respond(GenericFieldsResolverTest::languageResultReply);
                var request = languageRequest(fixture(name), omittedId);
                var resolution = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS,
                    CATEGORIES, 1, 5, 10, 8000).resolve(request);

                String targetId = omittedId.equals(scoreId) ? gradeId : scoreId;
                assertThat(resolution.mappings().get(targetId).profileFieldKey())
                    .as(name + " " + targetId).isEqualTo(TEST_GRADE);
                var criteria = local.calls().getFirst().request().path("questions").path("field_0").path("criteria");
                var resultContract = GenericFieldsJevHttp.JSON.readTree(criteria.path(TEST_GRADE).asString());
                assertThat(resultContract.path("profileFieldKey").asString()).isEqualTo(TEST_GRADE);
                List<String> kinds = new ArrayList<>();
                resultContract.path("acceptedTargetKinds").forEach(kind -> kinds.add(kind.asString()));
                assertThat(kinds).containsExactlyInAnyOrder("NUMERIC_SCORE", "GRADE");
                assertThat(local.bodies()).allSatisfy(body -> assertThat(body)
                    .doesNotContain("rowCount", "profileItemCount", "currentValue"));
            }
        }
    }

    @Test
    @DisplayName("점수와 등급이 한 기록에 함께 있고 구조로 결정할 수 없으면 둘 다 기권한다")
    void competingScoreAndGradeTargetsAbstain() {
        for (String name : FIXTURES) {
            var local = new GenericFieldsJevHttp();
            local.respond(GenericFieldsResolverTest::languageResultReply);
            var resolution = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS,
                CATEGORIES, 1, 5, 10, 8000).resolve(languageRequest(fixture(name), null));

            String scoreId = name.equals(FIXTURES.getFirst()) ? "nv-lang-score" : "sy-lang-points";
            String gradeId = name.equals(FIXTURES.getFirst()) ? "nv-lang-grade" : "sy-lang-level";
            assertThat(resolution.mappings().get(scoreId).profileFieldKey()).isNull();
            assertThat(resolution.mappings().get(gradeId).profileFieldKey()).isNull();
            assertThat(local.calls()).hasSize(1);
        }
    }

    /** 원본은 점수와 등급을 함께 가진다. 단독 칸 검사는 반대 칸만 제거한 명시적인 합성 ablation이다. */
    private static GenericFieldsRequest languageRequest(GenericFieldsRequest source, String omittedId) {
        var language = source.sections().stream()
            .filter(section -> "LANGUAGE".equals(section.category())).findFirst().orElseThrow();
        var candidates = askedCandidates(language).stream()
            .filter(candidate -> !candidate.candidateId().equals(omittedId)).toList();
        return new GenericFieldsRequest(2, "synthetic-language-ablation", source.site(),
            List.of(new GenericFieldsRequest.Section("language", null, language.displayName(),
                candidates, null, "LANGUAGE")));
    }

    /** 후보 ID가 아니라 실제 공급자 payload의 구조 계약과 마스킹한 원문 관측만 읽는 모의 판단. */
    private static GenericFieldsJevHttp.Reply languageResultReply(GenericFieldsJevHttp.Call call) {
        String description = call.request().path("questions").path(call.questionIds().getFirst())
            .path("criteria").path(TEST_GRADE).asString();
        if (!description.startsWith("{")) {
            return answerAll(call, JevClient.ABSTAIN, 0.9);
        }
        var contract = GenericFieldsJevHttp.JSON.readTree(description);
        Set<String> accepted = new HashSet<>();
        contract.path("acceptedTargetKinds").forEach(kind -> accepted.add(kind.asString()));
        Map<String, String> kinds = new java.util.LinkedHashMap<>();
        for (String id : call.questionIds()) {
            var observation = call.state().path("fields").path(id);
            String label = observation.path("label").asString().toLowerCase(java.util.Locale.ROOT);
            if (List.of("점수", "성적", "score").stream().anyMatch(label::contains)) {
                kinds.put(id, "NUMERIC_SCORE");
            }
            else if (List.of("등급", "급수", "grade", "level").stream().anyMatch(label::contains)) {
                kinds.put(id, "GRADE");
            }
        }
        boolean ambiguous = kinds.containsValue("NUMERIC_SCORE") && kinds.containsValue("GRADE");
        Map<String, String> choices = new java.util.LinkedHashMap<>();
        kinds.forEach((id, kind) -> choices.put(id, !ambiguous && accepted.contains(kind) ? TEST_GRADE : null));
        if (ambiguous) {
            assertThat(contract.path("multipleTargetPolicy").asString())
                .isEqualTo("ABSTAIN_IF_UNRESOLVED");
        }
        return answers(call, choices, 0.9);
    }

    @Test
    @DisplayName("출처 구조의 명시적 합성 변이와 독립 합성 구조에서 업무내용과 프로젝트 상세를 구분한다")
    void responsibilitiesAndProjectDetailsAreDistinctOnBothStructures() {
        for (String name : List.of("naver-career.synthetic-adversarial.request.json", FIXTURES.getLast())) {
            var request = fixture(name);
            var career = request.sections().stream().filter(section -> "CAREER".equals(section.category()))
                .findFirst().orElseThrow();
            assertThat(askedCandidates(career))
                .as(name + " must include a project-details counterexample")
                .anyMatch(candidate -> candidate.candidateId().contains("project"));
            var local = new GenericFieldsJevHttp();
            local.respond(call -> {
                Map<String, String> choices = new java.util.LinkedHashMap<>();
                for (String id : call.questionIds()) {
                    String label = call.state().path("fields").path(id).path("label").asString();
                    choices.put(id, label.contains("job duties") && !label.contains("project")
                        && !label.contains("프로젝트") ? RESPONSIBILITIES : null);
                }
                return answers(call, choices, 0.9);
            });
            var careerOnly = new GenericFieldsRequest(2, request.snapshotId(), request.site(), List.of(career));
            var resolution = new JevCategoryFieldResolver(GenericFieldsJevHttp.client(local), FIELDS,
                CATEGORIES, 1, 5, 10, 8000).resolve(careerOnly);

            String dutyId = name.equals(FIXTURES.getLast()) ? "sy-exp-duty" : "nv-career-job-0";
            assertThat(resolution.mappings().get(dutyId).profileFieldKey()).isEqualTo(RESPONSIBILITIES);
            var projectIds = request.fieldCandidateIdsInTraversalOrder().stream()
                .filter(id -> id.contains("project")).toList();
            assertThat(projectIds).isNotEmpty().allSatisfy(id ->
                assertThat(resolution.mappings().get(id).profileFieldKey()).isNull());
            assertThat(local.calls()).allSatisfy(call -> {
                List<String> observedLabels = new ArrayList<>();
                call.state().path("fields").forEach(node -> observedLabels.add(node.path("label").asString()));
                assertThat(observedLabels)
                    .anyMatch(label -> label.contains("project") || label.contains("프로젝트"));
                assertThat(call.criteria(call.questionIds().getFirst()))
                    .noneMatch(key -> key.startsWith("projects."));
            });
        }
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

package com.careerform.formanalysis.generic;

import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.CATEGORIES;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.FIELDS;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.JSON;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answerAll;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.answers;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.client;
import static com.careerform.formanalysis.generic.GenericFieldsJevHttp.request;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormControl;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FormElement;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Option;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Section;
import com.careerform.formanalysis.generic.GenericFieldsRequest.Visibility;

/**
 * 전체 날짜 TEXT 칸(생년월일)의 범용 JEV 매칭 경로를 두 무관한 비식별 구조로 추적한다.
 * 모의 응답은 코드 경로를 고정할 뿐 실제 JEV 판단이나 실사이트 CSS 상태의 증거가 아니다.
 */
@DisplayName("범용 전체 날짜 텍스트 칸 매칭 경로")
class GenericDateTextMatchingTest {

    private static final String DATE = "personal.personal.birthDate";
    private static final List<String> PARTS = List.of("YEAR", "MONTH", "DAY");
    private static final CompanyFormPolicyProvider POLICIES = (host, path) ->
        new CompanyFormPolicyProvider.NotRegistered();

    /** 구조 A: 편집 가능한 일반 텍스트 입력. */
    private static final FieldCandidate EDITABLE = new FieldCandidate("date", FormElement.INPUT, FormControl.TEXT,
        Visibility.VISIBLE, "생년월일", null, null, null, null, null, null, null);
    /** 구조 B: 달력 위젯이 값을 채우는 읽기 전용 텍스트 입력. */
    private static final FieldCandidate READONLY = new FieldCandidate("date", FormElement.INPUT, FormControl.TEXT,
        Visibility.VISIBLE, "생년월일", null, null, "YYYY-MM-DD", null, true, null, null,
        new GenericFieldsRequest.SemanticContext(null, GenericFieldsRequest.InputType.TEXT, null, null, null, null,
            null, null));
    private static final List<GenericFieldsRequest.WriteCommand> DATE_WRITES = List.of(
        GenericFieldsRequest.WriteCommand.SET_TEXT, GenericFieldsRequest.WriteCommand.SELECT_DATE);

    private final GenericFieldsJevHttp http = new GenericFieldsJevHttp();

    @Test
    @DisplayName("fixture와 독립 합성 문서의 실제 분류 응답 범주를 매칭 요청으로 전달하고 전체 경로를 캡처한다")
    void classificationResponsesDriveMatchingForBothSourceStructures() throws Exception {
        var fixture = Path.of("../frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/sanitized.html");
        String synthetic = """
            <section><h2>인적사항</h2><table><tr>
              <th><label for="calendar-date">생년월일</label></th>
              <td><input id="calendar-date" type="text" readonly placeholder="YYYY-MM-DD"></td>
            </tr></table></section>
            """;
        var structures = List.of(
            sourceStructure(fixture.toString(), Files.readString(fixture), "birthday"),
            sourceStructure("independent-synthetic-calendar-table", synthetic, "calendar-date"));
        for (var structure : structures) {
            for (String providerCategory : List.of("PERSONAL", "MIXED", "ABSTAIN", "EDUCATION")) {
                int classificationCallIndex = http.calls().size();
                http.respond(call -> answerAll(call, providerCategory, 0.95));
                var classificationRequest = new SectionClassificationRequest(1, "synthetic-snapshot",
                    new SectionClassificationRequest.Site("example.test", "/apply"),
                    List.of(new SectionClassificationRequest.Section("source-section", null, structure.title(),
                        List.of(structure.candidate().displayName()),
                        List.of(SectionClassificationRequest.ControlKind.TEXT), false)));
                var classification = new SectionClassificationService(
                    Optional.of(new JevSectionClassifier(client(http), CATEGORIES)),
                    new FormAnalysisRouter(POLICIES), CATEGORIES).classify(classificationRequest);
                var returnedSection = classification.sections().getFirst();
                assertThat(classification.status()).isEqualTo(SectionClassificationResponse.Status.COMPLETE);
                assertThat(returnedSection.category()).isEqualTo(providerCategory);
                var classificationCall = http.calls().get(classificationCallIndex);
                assertThat(classificationCall.questionIds()).containsExactly("section_0");
                var observedSection = classificationCall.state().path("sections").path("section_0");
                assertThat(observedSection.path("labels").get(0).asString()).isEqualTo("birth date");
                assertThat(observedSection.path("controlKinds").get(0).asString()).isEqualTo("text");

                for (String selected : List.of(DATE, "DATE_PART:" + DATE + ":YEAR",
                    "DATE_PART:" + DATE + ":MONTH", "DATE_PART:" + DATE + ":DAY", "ABSTAIN")) {
                    boolean excluded = returnedSection.category().equals("EDUCATION");
                    String providerChoice = excluded ? "ABSTAIN" : selected;
                    int matchingCallIndex = http.calls().size();
                    http.respond(call -> answerAll(call, providerChoice, 0.95));
                    var matchingRequest = new GenericFieldsRequest(2, classification.snapshotId(),
                        new GenericFieldsRequest.Site("example.test", "/apply"),
                        List.of(new Section(returnedSection.sectionId(), null, structure.title(),
                            List.of(structure.candidate()), null, returnedSection.category())), DATE_WRITES);
                    var result = service().analyze(matchingRequest).fields().getFirst();
                    var matchingCall = http.calls().get(matchingCallIndex);
                    var observation = matchingCall.state().path("fields").path("field_0");
                    assertThat(observation.path("label").asString()).isEqualTo("birth date");
                    assertThat(observation.path("element").asString()).isEqualTo("input");
                    assertThat(observation.path("control").asString()).isEqualTo("text");
                    assertThat(observation.path("visibility").asString()).isEqualTo("visible");
                    assertThat(matchingRequest.sections().getFirst().category())
                        .isEqualTo(returnedSection.category());
                    var criteria = matchingCall.criteria("field_0");
                    assertThat(criteria.contains(DATE)).isEqualTo(!excluded);
                    for (String part : PARTS) {
                        assertThat(criteria.contains("DATE_PART:" + DATE + ":" + part)).isEqualTo(!excluded);
                    }
                    if (!excluded && selected.equals(DATE)) {
                        assertThat(result.profileFieldKey()).isEqualTo(DATE);
                        assertThat(result.binding()).isNull();
                        assertThat(result.reason()).isNull();
                        assertThat(result.interactionStatus().name()).isEqualTo("READY");
                        assertThat(result.writePlan().command().name())
                            .isEqualTo(Boolean.TRUE.equals(structure.candidate().readonly())
                                ? "SELECT_DATE" : "SET_TEXT");
                    }
                    else {
                        assertUnmatched(result);
                    }
                    Map<String, Object> trace = new LinkedHashMap<>();
                    trace.put("source", structure.source());
                    trace.put("sourceSha256", structure.sha256());
                    trace.put("projection", "test-only label-for/input-id projection, not the FE collector");
                    trace.put("visibilityMode", "modeled VISIBLE; no CSS or geometry evaluation");
                    trace.put("providerMode", "MOCK_HTTP; not live JEV classification or selection");
                    trace.put("classificationRequest", classificationRequest);
                    trace.put("classificationProviderRequest", classificationCall.request());
                    trace.put("classificationMockChoice", providerCategory);
                    trace.put("classificationResponse", classification);
                    trace.put("matchingRequest", matchingRequest);
                    trace.put("matchingProviderRequest", matchingCall.request());
                    trace.put("requestedChoiceCase", selected);
                    trace.put("matchingMockChoice", providerChoice);
                    trace.put("response", result);
                    Map<String, Object> outcome = new LinkedHashMap<>();
                    outcome.put("profileFieldKey", result.profileFieldKey());
                    outcome.put("binding", result.binding());
                    outcome.put("reason", result.reason());
                    outcome.put("interactionStatus", result.interactionStatus());
                    outcome.put("writePlan", result.writePlan());
                    trace.put("outcome", outcome);
                    System.out.println("CF280_TRACE " + JSON.writeValueAsString(trace));
                }
            }
        }
    }

    private record SourceStructure(String source, String sha256, String title, FieldCandidate candidate) {
    }

    /** Test-only projection of a known sanitized source, not a production DOM collector. */
    private static SourceStructure sourceStructure(String source, String html, String inputId) throws Exception {
        var input = Pattern.compile("<input\\b[^>]*\\bid=\"" + Pattern.quote(inputId) + "\"[^>]*>")
            .matcher(html);
        assertThat(input.find()).as("source input").isTrue();
        String tag = input.group();
        assertThat(tag).contains("type=\"text\"");
        var label = Pattern.compile("<label\\b[^>]*\\bfor=\"" + Pattern.quote(inputId)
            + "\"[^>]*>([^<]+)</label>").matcher(html);
        assertThat(label.find()).as("source label-for association").isTrue();
        String title = null;
        var heading = Pattern.compile("<h2\\b[^>]*>([^<]+)</h2>").matcher(html.substring(0, input.start()));
        while (heading.find()) {
            title = heading.group(1).trim();
        }
        assertThat(title).isNotNull();
        var placeholder = Pattern.compile("\\bplaceholder=\"([^\"]+)\"").matcher(tag);
        var candidate = new FieldCandidate("date", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            label.group(1).trim(), null, null, placeholder.find() ? placeholder.group(1) : null,
            tag.matches("(?s).*\\sdisabled(?:\\s|=|>).*") ? true : null,
            tag.matches("(?s).*\\sreadonly(?:\\s|=|>).*") ? true : null, null, null,
            new GenericFieldsRequest.SemanticContext(null, GenericFieldsRequest.InputType.TEXT, null, null,
                null, null, null, null));
        String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(html.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        return new SourceStructure(source, sha256, title, candidate);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PERSONAL", "MIXED", "ABSTAIN"})
    @DisplayName("PERSONAL·MIXED·ABSTAIN 섹션의 전체 날짜 TEXT는 DIRECT birthDate와 DATE_PART 3종을 선택지로 받는다")
    void directDateIsOfferedForPersonalMixedAndAbstain(String category) {
        for (FieldCandidate structure : List.of(EDITABLE, READONLY)) {
            int before = http.calls().size();
            analyze(category, structure, null);
            var criteria = http.calls().get(before).criteria("field_0");
            assertThat(criteria).contains(DATE, "ABSTAIN");
            PARTS.forEach(part -> assertThat(criteria).contains("DATE_PART:" + DATE + ":" + part));
        }
    }

    @Test
    @DisplayName("섹션이 PERSONAL이 아닌 다른 범주로 확정되면 birthDate 자체가 선택지에 없다")
    void directDateIsAbsentWhenAnotherCategoryIsConfirmed() {
        for (String category : List.of("EDUCATION", "CAREER", "CERTIFICATE")) {
            int before = http.calls().size();
            analyze(category, EDITABLE, null);
            var criteria = http.calls().get(before).criteria("field_0");
            assertThat(criteria).doesNotContain(DATE);
            PARTS.forEach(part -> assertThat(criteria).doesNotContain("DATE_PART:" + DATE + ":" + part));
        }
        assertThat(CATEGORIES.keysOf("PERSONAL")).contains(DATE);
        assertThat(CATEGORIES.keysOf("EDUCATION")).doesNotContain(DATE);
    }

    @Test
    @DisplayName("DIRECT 선택은 키를 그대로 돌려주고 DATE_PART 3종은 키와 binding을 없앤다. ABSTAIN은 안전한 미연결이다")
    void choiceOutcomesForTheSameTextField() {
        for (String category : List.of("PERSONAL", "MIXED", "ABSTAIN")) {
            for (FieldCandidate structure : List.of(EDITABLE, READONLY)) {
                var direct = analyze(category, structure, DATE);
                assertThat(direct.profileFieldKey()).isEqualTo(DATE);
                assertThat(JSON.valueToTree(direct).has("binding")).isFalse();
                assertThat(direct.reason()).isNull();
                assertThat(direct.interactionStatus().name()).isEqualTo("READY");
                assertThat(direct.writePlan().command().name())
                    .isEqualTo(structure == READONLY ? "SELECT_DATE" : "SET_TEXT");
                for (String part : PARTS) {
                    assertUnmatched(analyze(category, structure, "DATE_PART:" + DATE + ":" + part));
                }
                assertUnmatched(analyze(category, structure, "ABSTAIN"));
            }
        }
    }

    @Test
    @DisplayName("날짜 부분 SELECT와 전체 날짜 TEXT가 한 문서에 있으면 SELECT의 DATE_PART는 유지되고 TEXT의 DATE_PART만 거부된다")
    void partSelectsKeepBindingWhileFullDateTextAbstains() {
        var year = select("year", "생년월일 년", "1999", "2000");
        var month = select("month", "생년월일 월", "01월", "12월");
        var day = select("day", "생년월일 일", "01일", "31일");
        var full = new FieldCandidate("full", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE, "생년월일",
            null, null, null, null, null, null, null);
        var misled = new FieldCandidate("full-misled", FormElement.INPUT, FormControl.TEXT, Visibility.VISIBLE,
            "생년월일", null, null, null, null, null, null, null);
        http.respond(call -> answers(call, Map.of(
            "field_0", "DATE_PART:" + DATE + ":YEAR",
            "field_1", "DATE_PART:" + DATE + ":MONTH",
            "field_2", "DATE_PART:" + DATE + ":DAY",
            "field_3", DATE,
            "field_4", "DATE_PART:" + DATE + ":YEAR"), 0.99));
        var response = service().analyze(request("example.test",
            List.of(new Section("personal", null, "인적사항", List.of(year, month, day, full, misled), null,
                "PERSONAL"))));
        var fields = response.fields();
        assertThat(fields).extracting(GenericFieldsResponse.Field::profileFieldKey)
            .containsExactly(DATE, DATE, DATE, DATE, null);
        assertThat(fields.subList(0, 3)).extracting(item ->
            JSON.valueToTree(item).path("binding").path("part").asString()).containsExactly("YEAR", "MONTH", "DAY");
        assertThat(JSON.valueToTree(fields.get(3)).has("binding")).isFalse();
        assertUnmatched(fields.get(4));
    }

    @Test
    @DisplayName("공급자 요청에는 프로필 값·현재 입력값 표지·프로필 항목 개수가 없다")
    void providerRequestsCarryNoProfileValuesOrCounts() {
        for (FieldCandidate structure : List.of(EDITABLE, READONLY)) {
            analyze("PERSONAL", structure, DATE);
        }
        assertThat(http.bodies()).isNotEmpty().allSatisfy(body -> assertThat(body).doesNotContain(
            "SYNTHETIC_CURRENT_VALUE", "SYNTHETIC_PROFILE_VALUE", "profileItemCount", "currentValue",
            "profileValues"));
    }

    private GenericFieldsResponse.Field analyze(String category, FieldCandidate candidate, String choice) {
        http.respond(call -> answerAll(call, choice, 0.95));
        return service().analyze(new GenericFieldsRequest(2, "synthetic-snapshot",
            new GenericFieldsRequest.Site("example.test", "/apply"),
            List.of(new Section("personal", null, "인적사항", List.of(candidate), null, category)), DATE_WRITES))
            .fields().getFirst();
    }

    private GenericFieldsService service() {
        return new GenericFieldsService(Optional.of(new JevCategoryFieldResolver(
            client(http), FIELDS, CATEGORIES, 3, 5, 10, 8000)), new FormAnalysisRouter(POLICIES),
            new FieldInteractionPolicy(), FIELDS);
    }

    private static FieldCandidate select(String id, String label, String... labels) {
        var choices = new ArrayList<Option>();
        choices.add(new Option("empty", ""));
        for (int index = 0; index < labels.length; index++) {
            choices.add(new Option(id + "-option-" + index, labels[index]));
        }
        return new FieldCandidate(id, FormElement.SELECT, FormControl.SELECT, Visibility.VISIBLE, label,
            null, null, null, null, null, null, choices);
    }

    private static void assertUnmatched(GenericFieldsResponse.Field field) {
        assertThat(field.profileFieldKey()).isNull();
        assertThat(field.reason()).isNull();
        assertThat(JSON.valueToTree(field).has("binding")).isFalse();
        assertThat(field.interactionStatus().name()).isEqualTo("BLOCKED");
        assertThat(field.autofillPolicy()).isNull();
        assertThat(field.writePlan()).isNull();
    }
}

package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;

import tools.jackson.databind.ObjectMapper;

@DisplayName("분석 요청의 비식별 품질 관측")
class QualityObservationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void capturedProjectionPreservesThePreviouslyStoredStructureFingerprint() {
        var semantic = new FieldsAnalysisRequest.SemanticContext(List.of(new FieldsAnalysisRequest.SemanticLabel(FieldsAnalysisRequest.SemanticSource.LABEL, "이메일")),
         FieldsAnalysisRequest.InputType.TEXT, null, FieldsAnalysisRequest.Autocomplete.EMAIL, true, null, 120,
         new FieldsAnalysisRequest.RepeatContext("repeat", 0, 2));
        var field = new FieldsAnalysisRequest.FieldCandidate("c1", FieldsAnalysisRequest.FormElement.INPUT, FieldsAnalysisRequest.FormControl.TEXT,
         FieldsAnalysisRequest.Visibility.VISIBLE, null, null, null, null, null, null, null, null, semantic);
        var request = new FieldsAnalysisRequest(2, "snapshot", new FieldsAnalysisRequest.Site("synthetic.test", "/"), List.of(
         new FieldsAnalysisRequest.Section("section", null, null, List.of(field), List.of(new FieldsAnalysisRequest.Item("item", List.of(
          new FieldsAnalysisRequest.FieldCandidate("c2", FieldsAnalysisRequest.FormElement.SELECT, FieldsAnalysisRequest.FormControl.SELECT,
          FieldsAnalysisRequest.Visibility.HIDDEN, null, null, null, null, true, null, null, List.of(new FieldsAnalysisRequest.Option("option", "합성")))))))));
        assertThat(QualityCapturedSnapshot.from(request, FieldsAnalysisResponse.llmUnavailable("snapshot"), new QualityCaptureBudget(131072))
            .project().structureKey()).isEqualTo("3f54d2706574948b1b64c62d8addf3dffc83882bbb5c60bee25c4963332f0edf");
    }

    @Test
    void capturedStructureIsImmutablePrivateAndEquivalentToOriginalProjection() throws Exception {
        var original = request("synthetic-private", "email");
        var mutable = new java.util.ArrayList<>(original.sections().getFirst().fields());
        var source = new FieldsAnalysisRequest(2, original.snapshotId(), original.site(), List.of(
            new FieldsAnalysisRequest.Section("section", null, "private-section", mutable, null)));
        var response = matched(source.snapshotId(), "synthetic-private-field");
        var expected = QualityProjection.fields(source, response);
        var budget = new QualityCaptureBudget(131072);
        var captured = QualityCapturedSnapshot.from(source, response, budget);
        mutable.clear();
        assertThat(captured.project()).isEqualTo(expected);
        assertThat(captured.toString()).doesNotContain("private");
        assertThat(mapper.writeValueAsString(captured)).doesNotContain("private-section", "domId", "domName", "pathPattern");
        assertThat(budget.bytes()).isBetween(1L, 131072L);
    }

    @Test
    void rejectsCaptureBeforeRetainingOversizedIdentifiers() {
        assertThatThrownBy(() -> QualityCapturedSnapshot.from(
            new FieldsAnalysisRequest(2, "x".repeat(20000), new FieldsAnalysisRequest.Site("example.test", "/"), List.of()),
            FieldsAnalysisResponse.complete("x".repeat(20000), List.of()), new QualityCaptureBudget(131072)))
            .isInstanceOf(QualityAdmissionException.class);
    }

    @Test
    @DisplayName("원문 라벨과 DOM 식별자 및 경로를 저장하지 않는다")
    void excludesRawPageTextAndIdentifiers() throws Exception {
        var request = request("synthetic-private", "email");
        var projected = QualityProjection.fields(request,
            FieldsAnalysisResponse.llmUnavailable(request.snapshotId()));

        var stored = mapper.writeValueAsString(projected);

        assertThat(stored).doesNotContain("synthetic-private", "domId", "domName", "displayName", "pathPattern");
        assertThat(projected.host()).isEqualTo("careers.example.test");
        assertThat(projected.fields()).hasSize(1);
        assertThat(projected.fields().getFirst().mapped()).isFalse();
        assertThat(projected.fields().getFirst().control()).isEqualTo("TEXT");
        assertThat(projected.snapshotKey()).matches("[0-9a-f]{64}");
    }

    @Test
    @DisplayName("구조가 같으면 원문과 snapshot 식별자가 달라도 같은 구조로 분류한다")
    void usesOnlyBoundedStructureForFingerprint() throws Exception {
        var first = request("synthetic-first", "email");
        var second = request("synthetic-second", "email");
        var a = QualityProjection.fields(first, FieldsAnalysisResponse.llmUnavailable(first.snapshotId()));
        var b = QualityProjection.fields(second, FieldsAnalysisResponse.llmUnavailable(second.snapshotId()));

        assertThat(a.structureKey()).isEqualTo(b.structureKey());
        assertThat(a.snapshotKey()).isNotEqualTo(b.snapshotKey());
        var different = request("synthetic-first", "bday");
        assertThat(QualityProjection.fields(different,
            FieldsAnalysisResponse.llmUnavailable(different.snapshotId())).structureKey())
            .isNotEqualTo(a.structureKey());
    }

    @Test
    @DisplayName("서버가 제안한 매핑만 매핑 건수에 포함한다")
    void countsOnlyServerMatchedCandidates() throws Exception {
        var request = request("synthetic-private", "email");
        var response = matched(request.snapshotId(), "synthetic-private-field");

        var projected = QualityProjection.fields(request, response);

        assertThat(projected.fields().getFirst().mapped()).isTrue();
        assertThat(projected.fields().getFirst().eligible()).isTrue();
        assertThat(projected.counts()).isEqualTo(new QualityMetrics.Counts(1, 1, 0, 0, 0, 0));
    }

    @Test
    @DisplayName("잠긴 칸은 수집과 매핑 상태를 유지하되 쓰기 대상에서 제외한다")
    void keepsLockedCandidatesOutOfEligibleScope() throws Exception {
        var request = mapper.readValue(json("synthetic-private", "email")
            .replace("\"visibility\":\"visible\"", "\"visibility\":\"visible\",\"disabled\":true"),
            FieldsAnalysisRequest.class);

        assertThat(QualityProjection.fields(request,
            FieldsAnalysisResponse.llmUnavailable(request.snapshotId())).fields().getFirst().eligible()).isFalse();
    }

    @Test
    void rejectsWriteReportingForServerBlockedMapping() throws Exception {
        var request = request("synthetic-private", "email");
        var blocked = FieldsAnalysisResponse.complete(request.snapshotId(), List.of(
            new FieldsAnalysisResponse.MatchedFieldAnalysis("synthetic-private-field", FieldsAnalysisResponse.MatchType.MATCH,
                "contact.contact.email", FieldsAnalysisResponse.AutofillPolicy.ALLOWED, FieldsAnalysisResponse.MappingStatus.LLM_SUGGESTED,
                FieldsAnalysisResponse.InteractionStatus.UNVERIFIED, null)));
        var field = QualityProjection.fields(request, blocked).fields().getFirst();
        assertThat(field.mapped()).isTrue();
        assertThat(field.eligible()).isFalse();
    }

    @Test
    @DisplayName("관측되지 않은 필드 매핑과 snapshot 불일치를 거부한다")
    void rejectsUnrelatedResponseMetadata() throws Exception {
        var request = request("synthetic-private", "email");

        assertThatThrownBy(() -> QualityProjection.fields(request,
            FieldsAnalysisResponse.complete("other", List.of())))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> QualityProjection.fields(request,
            matched(request.snapshotId(), "unknown-field")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void distinguishesRepeatMembershipWithoutSavingRawGroupNames() throws Exception {
        var one = mapper.readValue("""
            {"schemaVersion":2,"snapshotId":"s","site":{"host":"example.test","pathPattern":"/"},"sections":[{"sectionId":"s1","fields":[
            {"candidateId":"c1","element":"input","control":"text","visibility":"visible","semanticContext":{"repeat":{"groupId":"synthetic-private-group","rowIndex":0,"rowCount":2}}},
            {"candidateId":"c2","element":"input","control":"text","visibility":"visible","semanticContext":{"repeat":{"groupId":"synthetic-private-group","rowIndex":1,"rowCount":2}}}]}]}
            """, FieldsAnalysisRequest.class);
        var json = mapper.writeValueAsString(one);
        var split = mapper.readValue(json.replaceFirst("synthetic-private-group", "other-private-group"), FieldsAnalysisRequest.class);
        var renamed = mapper.readValue(json.replace("synthetic-private-group", "renamed-private-group"), FieldsAnalysisRequest.class);
        var original = QualityProjection.fields(one, FieldsAnalysisResponse.llmUnavailable("s"));
        assertThat(QualityProjection.fields(split, FieldsAnalysisResponse.llmUnavailable("s")).structureKey()).isNotEqualTo(original.structureKey());
        assertThat(QualityProjection.fields(renamed, FieldsAnalysisResponse.llmUnavailable("s")).structureKey()).isEqualTo(original.structureKey());
        assertThat(mapper.writeValueAsString(original)).doesNotContain("private-group");
        assertThat(original.baseline()).isEqualTo(new QualityProjection.Baseline(2, false));
    }

    @Test
    void recordsOnlyScopeEvidenceAndRejectsHiddenDisabledAndRepeatedBaseline() throws Exception {
        var json = """
            {"schemaVersion":2,"snapshotId":"s","site":{"host":"example.test","pathPattern":"/"},"sections":[{"sectionId":"s1","fields":[
            {"candidateId":"c1","element":"input","control":"text","visibility":"visible","semanticContext":{"repeat":{"groupId":"synthetic","rowIndex":0,"rowCount":1}}}]}]}
            """;
        var request = mapper.readValue(json, FieldsAnalysisRequest.class);
        assertThat(QualityProjection.fields(request, FieldsAnalysisResponse.llmUnavailable("s")).baseline())
            .isEqualTo(new QualityProjection.Baseline(1, true));
        for (var changed : List.of(json.replace("visible", "hidden"), json.replace("\"rowCount\":1", "\"rowCount\":2"),
            json.replace("\"control\":\"text\"", "\"control\":\"text\",\"disabled\":true"))) {
            var other = mapper.readValue(changed, FieldsAnalysisRequest.class);
            assertThat(QualityProjection.fields(other, FieldsAnalysisResponse.llmUnavailable("s")).baseline().compatible()).isFalse();
        }
    }

    private FieldsAnalysisResponse matched(String snapshot, String candidate) {
        return FieldsAnalysisResponse.complete(snapshot, List.of(
            new FieldsAnalysisResponse.MatchedFieldAnalysis(candidate,
                FieldsAnalysisResponse.MatchType.MATCH, "contact.contact.email",
                FieldsAnalysisResponse.AutofillPolicy.ALLOWED,
                FieldsAnalysisResponse.MappingStatus.LLM_SUGGESTED,
                FieldsAnalysisResponse.InteractionStatus.READY,
                new FieldsAnalysisResponse.WritePlan(FieldsAnalysisResponse.WriteCommand.SET_TEXT))));
    }

    private FieldsAnalysisRequest request(String privateText, String autocomplete) throws Exception {
        return mapper.readValue(json(privateText, autocomplete), FieldsAnalysisRequest.class);
    }

    private String json(String privateText, String autocomplete) {
        return """
            {"schemaVersion":2,"snapshotId":"%s",
             "site":{"host":"Careers.Example.Test","pathPattern":"/%s"},
             "sections":[{"sectionId":"%s-section","displayName":"%s",
             "fields":[{"candidateId":"%s-field","element":"input","control":"text",
             "visibility":"visible","displayName":"%s","domId":"%s","domName":"%s",
             "semanticContext":{"autocomplete":"%s"}}]}]}
            """.formatted(privateText, privateText, privateText, privateText,
                privateText, privateText, privateText, privateText, autocomplete);
    }
}

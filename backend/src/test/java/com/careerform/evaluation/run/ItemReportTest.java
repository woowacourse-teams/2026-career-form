package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("항목별 답 모음")
class ItemReportTest {

    private static final Instant AT = Instant.parse("2026-11-02T03:00:00Z");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    @DisplayName("칸 매핑은 칸마다 이름·섹션·정답과 반복별 답·확신도·자동기입 판정을 모으고, 실패한 반복은 빠진다")
    void collectsFieldAnswers() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("field-1", "k1");
        expected.put("field-2", null);
        CaseCall fields = new CaseCall(3, CallKind.Stage.MAPPING, CallKind.GENERIC_FIELDS, "/f", "d",
            JSON.readTree("""
                {"sections": [{"displayName": "학력", "fields": [
                  {"candidateId": "field-1", "displayName": "학교명", "control": "text"},
                  {"candidateId": "field-2", "displayName": "자기소개", "control": "textarea"}]}]}"""),
            expected, 1);
        List<CallResultRecord> records = List.of(
            record(1, 3, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING,
                Map.of("field-1", ObservedItem.answered("k1", 0.9), "field-2", ObservedItem.answered("k9", 0.95))),
            record(2, 3, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING,
                Map.of("field-1", ObservedItem.answered("k1", 0.6))),
            new CallResultRecord("run", 3, "case-a", 3, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING,
                FailureKind.API_ERROR, null, Map.of(), 0, List.of(), AT));

        List<ItemReport.Item> report = ItemReport.of(dataset(fields), records);

        assertThat(report).containsExactly(
            new ItemReport.Item("case-a", "university", CallKind.Stage.MAPPING, CallKind.GENERIC_FIELDS, "학력",
                "field-1", "학교명", "text", "k1", List.of(
                    new ItemReport.Answer(1, "k1", 0.9, "FILLED_CORRECT"),
                    new ItemReport.Answer(2, "k1", 0.6, "MISSED"))),
            new ItemReport.Item("case-a", "university", CallKind.Stage.MAPPING, CallKind.GENERIC_FIELDS, "학력",
                "field-2", "자기소개", "textarea", null, List.of(
                    new ItemReport.Answer(1, "k9", 0.95, "FILLED_UNNEEDED"),
                    new ItemReport.Answer(2, null, null, "BLANK_CORRECT"))));
    }

    @Test
    @DisplayName("섹션 분류는 섹션 제목으로, 선택 결정은 고른 선택지 글자로 보이고 판정은 모델 답 그대로 채점한다")
    void collectsSectionAndDecisionAnswers() {
        CaseCall sections = new CaseCall(1, CallKind.Stage.PREPARATION, CallKind.SECTION_CLASSIFY, "/c", "d",
            JSON.readTree("""
                {"sections": [{"sectionId": "ls1", "title": "자기소개서", "labels": ["지원동기"]}]}"""),
            Map.of("ls1", "NONE"), 1);
        CaseCall decisions = new CaseCall(2, CallKind.Stage.PREPARATION, CallKind.INTERACTION_DECISION, "/d", "d",
            JSON.readTree("""
                {"decisions": [{"decisionId": "rowKind0", "role": "ROW_KIND_OPTION", "targetKind": "HIGH_SCHOOL",
                  "candidates": [
                    {"candidateId": "o0", "semanticContext": {"labels": [{"source": "label", "text": "검정고시"}]}},
                    {"candidateId": "o1", "semanticContext": {"labels": [{"source": "label", "text": "고등학교"}]}}]}]}"""),
            Map.of("rowKind0", "o1"), 1);
        List<CallResultRecord> records = List.of(
            record(1, 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION,
                Map.of("ls1", ObservedItem.answered("PERSONAL", 0.9))),
            record(1, 2, CallKind.INTERACTION_DECISION, CallKind.Stage.PREPARATION,
                Map.of("rowKind0", ObservedItem.answered("o0", 0.3))));

        List<ItemReport.Item> report = ItemReport.of(dataset(sections, decisions), records);

        assertThat(report).containsExactly(
            new ItemReport.Item("case-a", "university", CallKind.Stage.PREPARATION, CallKind.SECTION_CLASSIFY, null,
                "ls1", "자기소개서", null, "NONE", List.of(new ItemReport.Answer(1, "PERSONAL", 0.9, "WRONG_KEY"))),
            new ItemReport.Item("case-a", "university", CallKind.Stage.PREPARATION, CallKind.INTERACTION_DECISION,
                "ROW_KIND_OPTION", "rowKind0", "HIGH_SCHOOL", null, "고등학교",
                List.of(new ItemReport.Answer(1, "검정고시", 0.3, "WRONG_KEY"))));
    }

    private static LoadedDataset dataset(CaseCall... calls) {
        return new LoadedDataset("d", 1, "digest",
            List.of(new EvaluationCase("case-a", "final", "s", "university", "p", List.of(calls))));
    }

    private static CallResultRecord record(int repetition, int order, CallKind kind, CallKind.Stage stage,
        Map<String, ObservedItem> observed) {
        return new CallResultRecord("run", repetition, "case-a", order, kind, stage, null,
            new CallScore(1, 0, 0, 0, 0), observed, 0, List.of(), AT);
    }
}

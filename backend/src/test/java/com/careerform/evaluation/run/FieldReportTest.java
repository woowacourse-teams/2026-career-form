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
import com.careerform.evaluation.scoring.AutofillOutcome;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("칸별 답 모음")
class FieldReportTest {

    private static final Instant AT = Instant.parse("2026-11-02T03:00:00Z");

    @Test
    @DisplayName("칸마다 화면·섹션·이름·정답과 반복별 답·확신도·판정을 모으고, 실패한 반복은 빠진다")
    void collectsAnswersPerField() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("field-1", "k1");
        expected.put("field-2", null);
        CaseCall fields = new CaseCall(2, CallKind.Stage.MAPPING, CallKind.GENERIC_FIELDS, "/f", "d",
            JsonMapper.builder().build().readTree("""
                {"sections": [{"displayName": "학력", "fields": [
                  {"candidateId": "field-1", "displayName": "학교명", "control": "text"},
                  {"candidateId": "field-2", "displayName": "자기소개", "control": "textarea"}]}]}"""),
            expected, 1);
        LoadedDataset dataset = new LoadedDataset("d", 1, "digest",
            List.of(new EvaluationCase("case-a", "final", "s", "university", "p", List.of(fields))));
        List<CallResultRecord> records = List.of(
            record(1, Map.of("field-1", ObservedItem.answered("k1", 0.9), "field-2", ObservedItem.answered("k9", 0.95))),
            record(2, Map.of("field-1", ObservedItem.answered("k1", 0.6))),
            new CallResultRecord("run", 3, "case-a", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING,
                FailureKind.API_ERROR, null, Map.of(), 0, List.of(), AT));

        List<FieldReport.FieldAnswers> report = FieldReport.of(dataset, records);

        assertThat(report).containsExactly(
            new FieldReport.FieldAnswers("case-a", "university", "학력", "field-1", "학교명", "text", "k1", List.of(
                new FieldReport.Answer(1, "k1", 0.9, AutofillOutcome.Kind.FILLED_CORRECT),
                new FieldReport.Answer(2, "k1", 0.6, AutofillOutcome.Kind.MISSED))),
            new FieldReport.FieldAnswers("case-a", "university", "학력", "field-2", "자기소개", "textarea", null, List.of(
                new FieldReport.Answer(1, "k9", 0.95, AutofillOutcome.Kind.FILLED_UNNEEDED),
                new FieldReport.Answer(2, null, null, AutofillOutcome.Kind.BLANK_CORRECT))));
    }

    private static CallResultRecord record(int repetition, Map<String, ObservedItem> observed) {
        return new CallResultRecord("run", repetition, "case-a", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING,
            null, new CallScore(1, 0, 0, 0, 0), observed, 0, List.of(), AT);
    }
}

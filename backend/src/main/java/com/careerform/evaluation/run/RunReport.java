package com.careerform.evaluation.run;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.scoring.AutofillOutcome;
import com.careerform.evaluation.scoring.ItemCounts;
import com.careerform.evaluation.scoring.RunAggregate;

/**
 * 저장한 호출 결과에서 다시 계산한 실행 보고. 측정 범위:
 * productCall은 작업자가 제품 서비스를 부르고 반환받을 때까지(서버 내부 배치·대기 포함, HTTP 전송 제외),
 * modelAttempt는 모델 HTTP 전송 직전부터 전체 응답 수신까지, flow는 자동기입 1번(처음 화면 준비 + 펼쳐진 화면 하나, 이전 데이터셋은 사례 하나)의 호출 시간 합이다.
 * 처리량은 완료 호출 수 ÷ 실행 경과 초다. 관측하지 못한 값은 null이며 0으로 채우지 않는다.
 * 키 TOTAL, PREPARATION, MAPPING. {@code scoringVersion}은 이 보고를 계산한 현재 채점식이며, 실행 등록 때 기록한
 * 채점식과 다를 수 있다. {@code repetitions}는 반복마다 따로 계산한 항목 단위 정확도로, 같은 입력에서 점수가 얼마나
 * 흔들리는지 보이고, 자동기입 점수도 반복마다 따로 낸다. {@code autofill}은 저장한 칸 매핑 답을 실행 때의 정답과
 * 다시 비교해 사용자 화면 기준으로 나눈 합계와 점수이며, 정답을 찾을 수 없거나 칸 매핑 결과가 없으면 null이다.
 * {@code scores}는 단계별(TOTAL·PREPARATION·MAPPING) 점수다. 같은 식(정밀도를 중시한 F0.5)으로 내며 칸 매핑은 확신도 0.8
 * 기준, 나머지 질문은 답 그대로 나눈다. TOTAL은 두 단계 항목을 합친다. {@code autofill}은 칸 매핑만의 결과다.
 * {@code itemsByCall}은 항목 판정 합계를 "단계/호출 종류"(예: PREPARATION/SECTION_CLASSIFY)별로 나눈 것으로, 화면의
 * 준비·매핑 탭이 쓴다. 평가는 다음 요청을 정답으로 만들므로 앞 단계 오답은 자동기입 점수에 반영되지 않는다.
 */
public record RunReport(
    RunAggregate quality,
    Map<String, StagePerformance> performance,
    Map<String, Tokens> tokens,
    Flows flows,
    Timing timing,
    String scoringVersion,
    List<RepetitionQuality> repetitions,
    Autofill autofill,
    Map<String, Autofill> scores,
    Map<String, ItemCounts> itemsByCall
) {

    public RunReport {
        repetitions = List.copyOf(repetitions);
        scores = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(scores));
        itemsByCall = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(itemsByCall));
    }

    /** 반복 하나의 항목 단위 정확도와 단계별(TOTAL·PREPARATION·MAPPING) 점수. 계산할 수 없는 값은 빠지거나 null이다. */
    public record RepetitionQuality(int repetition, Double accuracy, Map<String, Double> scores) {

        public RepetitionQuality {
            scores = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(scores));
        }
    }

    /** 자동기입 결과 합계와 정밀도·채움률·점수({@link AutofillOutcome}). */
    public record Autofill(AutofillOutcome counts, Double precision, Double fillRate, Double score) {

        public static Autofill of(AutofillOutcome counts) {
            return new Autofill(counts, counts.precision(), counts.fillRate(), counts.score());
        }
    }

    public record Distribution(int count, Double meanMs, Double p50Ms, Double p95Ms, Double totalMs) {
    }

    public record StagePerformance(
        int calls,
        Double failureRate,
        Double throughputPerSecond,
        Distribution productCall,
        Distribution modelAttempt,
        int failedAttempts,
        Double failedAttemptMs,
        int tokenLimitAttempts
    ) {
    }

    public record Tokens(
        int observedAttempts,
        int unobservedAttempts,
        Long inputTotal,
        Long outputTotal,
        Double inputMean,
        Double outputMean
    ) {
    }

    /** 자동기입 1번 단위 묶음({@link RunReporter} 참고). 토큰은 자동기입 1번에 쓴 관측 토큰의 평균이다. */
    public record Flows(int count, Double failureRate, Distribution time, Double inputTokensMean,
        Double outputTokensMean) {
    }

    public record Timing(
        Long queueWaitMs,
        Long elapsedMs,
        Double firstRepetitionMeanMs,
        Double laterRepetitionsMeanMs
    ) {
    }
}

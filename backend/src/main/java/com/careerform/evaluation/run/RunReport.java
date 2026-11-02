package com.careerform.evaluation.run;

import java.util.Map;
import com.careerform.evaluation.scoring.RunAggregate;

/**
 * 저장한 호출 결과에서 다시 계산한 실행 보고. 측정 범위:
 * productCall은 작업자가 제품 서비스를 부르고 반환받을 때까지(서버 내부 배치·대기 포함, HTTP 전송 제외),
 * modelAttempt는 모델 HTTP 전송 직전부터 전체 응답 수신까지, flow는 반복 하나에서 사례 하나의 호출 시간 합이다.
 * 처리량은 완료 호출 수 ÷ 실행 경과 초다. 관측하지 못한 값은 null이며 0으로 채우지 않는다.
 * 키 TOTAL, PREPARATION, MAPPING. {@code scoringVersion}은 이 보고를 계산한 현재 채점식이며, 실행 등록 때 기록한
 * 채점식과 다를 수 있다.
 */
public record RunReport(
    RunAggregate quality,
    Map<String, StagePerformance> performance,
    Map<String, Tokens> tokens,
    Flows flows,
    Timing timing,
    String scoringVersion
) {

    public record Distribution(int count, Double meanMs, Double p50Ms, Double p95Ms, Double totalMs) {
    }

    public record StagePerformance(
        int calls,
        Double failureRate,
        Double throughputPerSecond,
        Distribution productCall,
        Distribution modelAttempt,
        int retriedAttempts,
        Double retriedAttemptMs
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

    public record Flows(int count, Double failureRate, Distribution time) {
    }

    public record Timing(
        Long queueWaitMs,
        Long elapsedMs,
        Double firstRepetitionMeanMs,
        Double laterRepetitionsMeanMs
    ) {
    }
}

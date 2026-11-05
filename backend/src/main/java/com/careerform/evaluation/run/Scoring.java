package com.careerform.evaluation.run;

import java.time.Instant;
import com.careerform.evaluation.scoring.RunAggregate;

/** 재채점 기록 한 건. 저장한 답을 그 시점 채점 기준으로 다시 계산한 결과이며 추가만 한다. */
public record Scoring(
    String id,
    String runId,
    String scoringVersion,
    String datasetDigest,
    String createdBy,
    Instant createdAt,
    RunAggregate aggregate
) {
}

package com.careerform.evaluation.run;

import java.util.List;

/** 재채점 이력 저장소. 추가만 한다. */
public interface ScoringStore {

    void append(Scoring scoring);

    List<Scoring> list(String runId);
}

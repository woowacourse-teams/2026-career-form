package com.careerform.evaluation.run;

import java.util.List;

/** 재채점 이력 저장소. 추가하고, 기록 삭제 때만 실행 단위로 지운다. */
public interface ScoringStore {

    void append(Scoring scoring);

    List<Scoring> list(String runId);

    /** 고른 실행의 재채점 이력을 지운다. 지운 수. */
    long delete(java.util.Collection<String> runIds);
}

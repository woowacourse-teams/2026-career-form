package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.List;

/** 테스트와 로컬 확인용 재채점 이력 저장소. */
public final class InMemoryScoringStore implements ScoringStore {

    private final List<Scoring> scorings = new ArrayList<>();

    @Override
    public synchronized void append(Scoring scoring) {
        scorings.add(scoring);
    }

    @Override
    public synchronized List<Scoring> list(String runId) {
        return scorings.stream().filter(scoring -> scoring.runId().equals(runId)).toList();
    }
}

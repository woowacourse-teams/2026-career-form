package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.List;

/** 테스트와 로컬 확인용 결과 저장소. */
public final class InMemoryResultStore implements ResultStore {

    private final List<CallResultRecord> records = new ArrayList<>();

    @Override
    public synchronized boolean append(CallResultRecord record) {
        boolean exists = records.stream().anyMatch(existing -> existing.runId().equals(record.runId())
            && existing.key().equals(record.key()));
        if (!exists) {
            records.add(record);
        }
        return !exists;
    }

    @Override
    public synchronized List<CallResultRecord> list(String runId) {
        return records.stream().filter(record -> record.runId().equals(runId)).toList();
    }
}

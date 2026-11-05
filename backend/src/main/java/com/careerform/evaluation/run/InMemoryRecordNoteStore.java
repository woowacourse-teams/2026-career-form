package com.careerform.evaluation.run;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 메모리 기록 메모 저장소. 테스트와 로컬 확인용이다. */
public final class InMemoryRecordNoteStore implements RecordNoteStore {

    private final Map<String, String> notes = new ConcurrentHashMap<>();

    @Override
    public Map<String, String> all() {
        return Map.copyOf(notes);
    }

    @Override
    public void save(String recordKey, String note, String updatedBy) {
        notes.put(recordKey, note);
    }

    @Override
    public void delete(Collection<String> recordKeys) {
        recordKeys.forEach(notes::remove);
    }
}

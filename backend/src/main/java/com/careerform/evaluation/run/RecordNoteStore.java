package com.careerform.evaluation.run;

import java.util.Collection;
import java.util.Map;

/**
 * 평가 기록에 사람이 적는 메모(이전과 무엇이 달라졌는지). 키는 화면의 기록 단위인 비교 ID, 단독 실행이면 실행 ID다.
 * 측정 결과와 따로 두어, 메모를 고쳐도 실행 기록은 바뀌지 않는다.
 */
public interface RecordNoteStore {

    Map<String, String> all();

    void save(String recordKey, String note, String updatedBy);

    void delete(Collection<String> recordKeys);
}

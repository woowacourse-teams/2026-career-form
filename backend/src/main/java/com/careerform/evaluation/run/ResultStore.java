package com.careerform.evaluation.run;

import java.util.List;

/** 호출 결과 저장소. 이미 있는 키는 덮어쓰지 않으며, 기록 삭제 때만 실행 단위로 지운다. */
public interface ResultStore {

    /** 저장하면 true, 같은 키가 이미 있으면 false. */
    boolean append(CallResultRecord record);

    /** 저장 순서대로 돌려준다. */
    List<CallResultRecord> list(String runId);

    /** 고른 실행의 결과를 지운다. 지운 수. */
    long delete(java.util.Collection<String> runIds);
}

package com.careerform.evaluation.dataset;

import java.util.Map;

/**
 * 데이터셋 목록 파일(evaluation/datasets/&lt;id&gt;/catalog.json). 현재 버전과 공고·화면의 사람이 읽는 이름을 한곳에 둔다.
 * 평가 화면과 자동 평가가 이 파일을 읽으므로 공고나 화면을 더할 때 코드를 고치지 않는다. 지문이 걸린 버전 폴더 밖에 있어 이름을
 * 고쳐도 이전 실행의 데이터셋 지문은 그대로다.
 */
public record DatasetNames(int currentVersion, Map<String, SiteName> sites, Map<String, StateName> states) {

    public record SiteName(String name) {
    }

    public record StateName(String name, String note) {
    }
}

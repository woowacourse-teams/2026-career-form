package com.careerform.formanalysis.application;

import java.util.Map;

/**
 * 모델 요청에 들어가는 고정 문구(지시문, 선택지 설명, 혼동 기준)를 이름별로 내놓는다.
 * 요청마다 달라지는 질문 번호는 {@link #QUESTION_ID_PLACEHOLDER}로 둔다. 지원서 화면에서 온 값은 넣지 않는다.
 * 평가 실행은 이 조각들로 프롬프트 버전 해시를 만든다.
 */
public interface PromptSource {

    String QUESTION_ID_PLACEHOLDER = "{questionId}";

    String promptSourceId();

    Map<String, String> promptParts();
}

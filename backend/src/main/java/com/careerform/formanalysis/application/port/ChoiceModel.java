package com.careerform.formanalysis.application.port;

import java.util.Map;

/**
 * 범용 매칭이 모델에 묻는 유일한 공급자 포트. 질문마다 선택지(criteria, ABSTAIN 포함) 중 하나를 고르게 한다.
 * 질문과 선택지 구성은 공급자와 무관한 범용 로직이 만들고, 공급자는 전송과 응답 검증만 맡는다.
 * 실패는 {@link com.careerform.formanalysis.exception.ResolverException}, 입력 한도 초과는
 * {@link com.careerform.formanalysis.exception.TokenLimitExceeded}로 알린다.
 */
public interface ChoiceModel {

    String ABSTAIN = "ABSTAIN";

    /** 공급자 이름(예: jev, openai). 평가 결과와 측정 기록에 남는다. */
    String provider();

    /** 요청에 쓰는 모델 이름. */
    String model();

    /** 범용 분석용. 공급자가 고른 답과 확신도를 그대로 돌려준다(확신도 컷 없음). */
    Map<String, Judgement> answer(Object state, Map<String, Question> questions);

    /** 버튼·선택지 결정용. 공급자의 확신도 기준을 통과한 답만 돌려주고 나머지는 ABSTAIN이다. */
    Map<String, String> choose(Object state, Map<String, Question> questions);

    record Question(String instructions, Map<String, String> criteria) {
        public Question {
            criteria = Map.copyOf(criteria);
        }
    }

    /** {@code probabilities}는 공급자가 선택지별 확률을 주지 않으면 비어 있다. */
    record Judgement(String choice, double confidence, Map<String, Double> probabilities) {
        public Judgement {
            probabilities = probabilities == null ? Map.of() : Map.copyOf(probabilities);
        }
    }
}

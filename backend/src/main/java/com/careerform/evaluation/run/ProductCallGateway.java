package com.careerform.evaluation.run;

import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;

/**
 * 저장한 제품 요청을 실제 제품 서비스에 넣고 제품 응답을 돌려준다. HTTP 계층은 거치지 않지만
 * 서비스와 모델 호출 경로는 제품 요청과 같다. {@code target}은 실행에 고정한 공급자, 모델, 설정이다.
 */
@FunctionalInterface
public interface ProductCallGateway {

    JsonNode call(CallKind kind, JsonNode request, CallTarget target);
}

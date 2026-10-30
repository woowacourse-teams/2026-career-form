package com.careerform.evaluation.run;

import java.util.Map;
import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;

/**
 * 저장한 제품 요청을 실제 제품 서비스에 넣고 제품 응답을 돌려준다. HTTP 계층은 거치지 않지만
 * 서비스, 모델 호출, 서버 동시 호출 제한은 제품 요청과 같다. {@code settings}는 실행에 고정한 설정이다.
 */
@FunctionalInterface
public interface ProductCallGateway {

    JsonNode call(CallKind kind, JsonNode request, Map<String, String> settings);
}

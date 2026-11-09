package com.careerform.evaluation.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;

/**
 * 평가 기능과 품질 확인 비밀번호 보호(QualityApiFilter)가 함께 켜졌을 때만 평가 bean을 만든다.
 * 품질 기능이 꺼지면 비밀번호 필터가 없으므로, 평가만 켜도 모델 호출 비용을 쓰는 API가 열리지 않게 한다.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@ConditionalOnExpression("${career-form.evaluation.enabled:false} and ${career-form.quality.enabled:false}")
public @interface ConditionalOnProtectedEvaluation {
}

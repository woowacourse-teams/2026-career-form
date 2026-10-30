package com.careerform.evaluation.scoring;

import java.util.Objects;
import com.careerform.evaluation.scoring.CallKind.Stage;

/**
 * 채점 단위인 제품 API 호출 한 건의 결과. {@code stage}는 호출이 일어난 단계다. 준비 루프 안의 섹션 분류처럼
 * 같은 종류의 호출도 단계가 다를 수 있다. {@code modelCalls}는 그 안에서 서버가 보낸 모델 호출 수로,
 * 시간과 사용량 기록에만 쓰고 정확도의 비중에는 쓰지 않는다.
 */
public record CallResult(CallKind kind, Stage stage, CallScore score, FailureKind failure, int modelCalls) {

    public CallResult {
        Objects.requireNonNull(kind, "kind");
        Objects.requireNonNull(stage, "stage");
        if ((score == null) == (failure == null) || failure == FailureKind.NOT_SCORABLE) {
            throw new IllegalArgumentException("호출 결과는 점수와 실패 원인 중 하나만 가집니다");
        }
        if (modelCalls < 0) {
            throw new IllegalArgumentException("모델 호출 수는 음수일 수 없습니다");
        }
    }

    public static CallResult completed(CallKind kind, CallScore score, int modelCalls) {
        return completed(kind, kind.stage(), score, modelCalls);
    }

    public static CallResult completed(CallKind kind, Stage stage, CallScore score, int modelCalls) {
        return new CallResult(kind, stage, Objects.requireNonNull(score, "score"), null, modelCalls);
    }

    public static CallResult failed(CallKind kind, FailureKind failure, int modelCalls) {
        return failed(kind, kind.stage(), failure, modelCalls);
    }

    public static CallResult failed(CallKind kind, Stage stage, FailureKind failure, int modelCalls) {
        return new CallResult(kind, stage, null, Objects.requireNonNull(failure, "failure"), modelCalls);
    }

    /** 실패했거나 채점할 항목이 없으면 그 원인을 돌려준다. */
    public FailureKind effectiveFailure() {
        if (failure != null) {
            return failure;
        }
        return score.scorable() ? null : FailureKind.NOT_SCORABLE;
    }
}

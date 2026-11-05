package com.careerform.evaluation.scoring;

/** 채점 단위가 되는 제품 API 호출의 종류. 서버 안의 모델 호출 수와 무관하게 한 건으로 센다. */
public enum CallKind {
    INTERACTION_DECISION(Stage.PREPARATION),
    SECTION_CLASSIFY(Stage.MAPPING),
    GENERIC_FIELDS(Stage.MAPPING);

    private final Stage stage;

    CallKind(Stage stage) {
        this.stage = stage;
    }

    public Stage stage() {
        return stage;
    }

    public enum Stage {
        PREPARATION,
        MAPPING
    }
}

package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

@DisplayName("AI 평가 화면 정적 자원")
class EvaluationPageTest {

    @Test
    @DisplayName("평가 화면은 품질 로그인 틀을 쓰고 실행 API만 읽으며 외부 자원과 예시 데이터가 없다")
    void usesLoginShellAndApiOnly() throws Exception {
        String index = read("static/evaluations/index.html");
        assertThat(index).contains("/quality/quality.css", "/quality/login.js", "data-app=\"/evaluations/app.js\"",
            "id=\"login-form\"", "id=\"management-panel\"", "수집 지침 내려받기", "/evaluations/collection-skill.md",
            "id=\"cf-progress\"", "id=\"provider-open\"", "id=\"comparison-detail\"");
        String app = read("static/evaluations/app.js");
        assertThat(app).contains("/quality/access.js", "\"/api/v1/evaluations\"", "/runs?limit=50", "/datasets/",
            "/prompts/", "맞힌 항목 ÷ 채점 항목", "?.scoringVersion", "renderProgress", "progressbar",
            "aria-valuenow", "renderTokenBars", "입력 토큰", "출력 토큰", "renderItemBreakdown", "quality.items",
            "오답(다른 항목)", "누락(판단 보류)", "불필요 제안", "예상 비용 비교", "자동기입 1,000회당", "가장 저렴한 모델의",
            "openProviders", "/provider-registrations", "HOST_NOT_ALLOWED_FOR_KEY", "INTERNAL_ADDRESS",
            "키 원문은 이 화면에 입력하지 않습니다", "datasetVersion: DATASET.version", "split: \"all\"",
            "comparisonDetail", "accuracyCard", "?.repetitions", "차이 구분 불가", "반복 1회라 흔들림을 알 수 없음",
            "renderAutofill", "?.autofill", "실제 자동기입 결과", "자동기입 정확도", "확신도를 기록하기 전 실행",
            "STATE_NAMES", "dataset-tabs", "field-table", "profileTable", "PROMPT_APIS", "prompt-group", "criteria-table", "POST /api/v1/generic/sections/classify", "change-chips", "prompt-layout", "timeline-hint",
            "api(\"/prompts\")", "commit-list", "초기 버전", "lineDiff", "diff-table", "처음 기록한 프롬프트");
        assertThat(app).doesNotContain("이름만 바뀜", "prompt-model", "조각 ${", "변경 없는 조각");
        assertThat(app).doesNotContain("field(\"분할\"", "field(\"데이터셋 버전\"", "renderVariation");
        String all = index + app + read("static/evaluations/styles.css") + read("static/evaluations/pricing.js");
        assertThat(all).doesNotContain("cdn.", "https://", "http://", "window.openai", "Pretendard",
            "dataset-preview", "예시 결과", "sessionStorage");
        assertThat(new EvaluationPageController().index()).isEqualTo("forward:/evaluations/index.html");
    }

    @Test
    @DisplayName("수집 지침은 개인정보 경계와 검토 게이트를 담고 검증한 정제 스크립트를 그대로 싣는다")
    void collectionSkillCarriesGuardsAndScripts() throws Exception {
        String skill = read("static/evaluations/collection-skill.md");
        assertThat(skill).contains("실제 지원서 값, 계정, 세션", "요청 JSON을 손으로 쓰지 않는다", "HUMAN_REVIEWED",
            "SOURCE_PIPELINE_VERIFIED", "CF-356-collection-1-structure-stats", "CF-356-collection-2-sanitize",
            "[비식별]", "https://example.test");
    }

    private static String read(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }
}

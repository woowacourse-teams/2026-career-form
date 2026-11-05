package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

@DisplayName("AI 평가 화면 정적 자원")
class EvaluationPageTest {

    @Test
    @DisplayName("평가 화면 정적 자원은 품질 로그인 틀과 실행 API만 쓰고, 외부 자원·예시 데이터가 없으며 기능 표식이 남아 있다(동작은 프론트 evaluation-page.test.ts)")
    void usesLoginShellAndApiOnly() throws Exception {
        String index = read("static/evaluations/index.html");
        assertThat(index).contains("/quality/quality.css", "/quality/login.js", "data-app=\"/evaluations/app.js\"",
            "id=\"login-form\"", "id=\"management-panel\"", "수집 지침 내려받기", "/evaluations/collection-skill.md",
            "id=\"cf-progress\"", "id=\"record-delete\"", "id=\"cf-fields\"", "data-page=\"fields\"", "id=\"provider-open\"", "id=\"comparison-detail\"");
        String app = read("static/evaluations/app.js");
        assertThat(app).contains("/quality/access.js", "\"/api/v1/evaluations\"", "/runs?limit=50", "/datasets/",
            "/prompts/", "renderProgress", "progressbar", "입력 토큰 초과", "tokenLimitAttempts", "섹션 분류 점수", "칸 매핑 점수", "놓친 4개", "confidenceCard", "확신도 기준별 칸 매핑", "baseEntry",
            "aria-valuenow", "renderTokenBars", "입력 토큰", "출력 토큰", "stageAccuracyCard", "stageSummary", "itemsByCall", "단계별 점수", "준비 점수", "매핑 점수", "?.scores?.[stage]", "cf-overview-stage",
            "오답(다른 항목)", "누락(판단 보류)", "불필요 제안", "예상 비용 비교", "자동기입 1,000회당", "가장 저렴한 모델의",
            "openProviders", "/provider-registrations", "HOST_NOT_ALLOWED_FOR_KEY", "INTERNAL_ADDRESS",
            "키 원문은 이 화면에 입력하지 않습니다", "datasetVersion: state.catalog?.currentVersion", "split: \"all\"",
            "comparisonDetail", "scoreCard", "?.repetitions", "renderQuality()", "stage-model", "confirmDelete", "/records/", "되돌릴 수 없습니다", "modelTimeCard", "모델 응답 시간", "자동기입 시간", "AI 응답 시간", "요청 처리 시간", "자동기입 실패율", "요청 실패율", "comparisonDetail(state.group)", "condition-chip", "help-rows", "namingGuide", "이름 짓는 법", "changedConditions", "달라진 조건", "countLine", "richNote", "stat-line", "has-help", "help-tip", "[data-help]", "실행 이름", "요청 1개에 AI 질문", "modelAttempt", "renderFields", "/items`", "항목별 비교", "COMPARE_KINDS", "섹션 분류", "CATEGORY_NAMES", "fieldDetail", "renderCompare", "전후 비교", "guideView", "자동(배포)", "prompt-391fbd8", "사용 가이드", "flowView", "FLOW_ROWS", "flow-legend", "posting-tabs", "siteName", "auto-deploy", "scripts/evaluation_local.py", "compare-before", "compare-after", "구분 불가", "changedItems", "판정이 바뀐 항목",
            "renderAutofill", "?.autofill", "칸별 결과", "자동기입 점수", "맞게 비움", "놓침", "잘못 넣음", "확신도 기록 전 실행", "F0.5",
            "stateName", "stateNote", "dataset-about", "screen-list", "score-flow", "form-wire", "criteria-formula", "3. 준비 결과 · 섹션 분류 결과", "dataset-tabs", "field-table", "profileTable", "PROMPT_APIS", "prompt-group", "criteria-table", "POST /api/v1/generic/sections/classify", "change-chips", "prompt-layout",
            "api(\"/prompts\")", "commit-list", "초기 버전", "lineDiff", "diff-table", "처음 기록한 프롬프트");
        assertThat(app).doesNotContain("costCard", "자동기입 1,000번당 예상 비용", "accuracyCard", "autoCorrect", "자동기입 최종 정확도", "이름만 바뀜", "우세 · 반복별", "맞힌 항목 ÷ 채점 항목", "variation-verdict", "timeline-hint", "새 버전이 쌓이고", "prompt-model", "조각 ${", "변경 없는 조각", "state.baseline", "addDeltas", "기준 대비 바뀐");
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
            "[비식별]", "https://example.test", "catalog.json", "preparationOnly", "항상 전체(`all`)");
    }

    @Test
    @DisplayName("현재 데이터셋 버전과 공고·화면 이름을 코드에 적지 않고 목록 파일에서 읽는다")
    void datasetInfoComesFromCatalog() throws Exception {
        String app = read("static/evaluations/app.js");
        assertThat(app).contains("/catalog", "state.catalog?.currentVersion").doesNotContain("우아한", "NHN", "version: 4");
        assertThat(read("application.yml")).contains("CAREER_FORM_EVALUATION_AUTO_RUN_DATASET_VERSION:0}");
    }

    private static String read(String path) throws Exception {
        return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
    }
}

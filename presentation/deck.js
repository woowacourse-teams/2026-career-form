const report = typeof require !== "undefined"
  ? require("./experiment-report.js").experimentSummary
  : globalThis.experimentSummary;

const note = (speaker, seconds, text, sources) => Object.freeze({
  speaker, seconds, text, sources: Object.freeze([...sources]),
});
const renderNote = ({ speaker, seconds, text, sources }) =>
  `<strong>${speaker}, 약 ${seconds}초</strong><p>${text}</p><p>[Sources]<br>${sources.join("<br>")}</p>`;
const source = (path) => `<code>${path}</code>`;
const question = (title, detail) => `<div class="question-card"><span>FEEDBACK WANTED</span><h3>${title}</h3><p>${detail}</p></div>`;

const baseSlides = [
  {
    section: "product", kind: "cover", meta: "MINGLING DAY",
    evidenceType: "decision", implementationState: "오늘의 대화 지도",
    topics: ["product-problem"],
    productFlow: ["profile-register", "sidepanel-review", "approved-fill"],
    body: `<div class="cover-copy"><p class="kicker">완성품 발표 대신, 판단과 막힌 지점 공유</p><h1>지원서 입력을 줄이는<br><em>네 번의 판단</em></h1></div><div class="product-flow"><span>프로필 등록</span><i></i><span>지원서 옆에서 검토</span><i></i><span>선택한 항목 기입</span><b>제출은 사용자 수행</b></div><div class="agenda-strip"><span>01 제품 실험</span><span>02 LLM 경계</span><span>03 확장 프로그램</span><span>04 팀과 AX</span></div>`,
    notes: note("제품 발표자", 30, "Career Form은 사용자가 프로필을 한 번 등록하고 지원서 옆에서 예정 값을 검토한 뒤 선택한 항목만 기입하도록 돕는 Chrome 확장 프로그램입니다. 제출은 사용자가 수행합니다. 오늘은 완성품 발표보다 실제 문서, 실험 화면과 현재 구현을 놓고 네 번의 판단을 공유합니다.", ["GitHub Issue #64", "프로젝트 밍글링 데이 안내"]),
  },
  {
    section: "product", kind: "evidence", meta: "01 PRODUCT EXPERIMENT",
    title: "느낌이 아니라 같은 과업을 네 방식으로 비교했다",
    evidenceType: "artifact", implementationState: "실험 도구 구현과 10회 세션 완료",
    body: `<div class="evidence-layout wide"><figure class="evidence-frame"><img src="./assets/experiment-screen.png" alt="비식별 가설 검증 인터뷰 화면"></figure><div class="evidence-copy"><span class="eyebrow">ACTUAL ARTIFACT</span><h3>가설 검증용 HTML</h3><p>A 직접 입력, B 사이드 패널, C 별도 탭, D 자동 기입을 같은 필드로 측정</p><div class="file-ref">${source("frontend/src/research/hypothesis-validation-interview.html")}</div></div></div>`,
    notes: note("제품 발표자", 60, "이 화면은 발표용 목업이 아니라 실제 인터뷰에 사용한 HTML입니다. 같은 지원 정보 필드를 네 방식으로 수행하고 시간, 누락, 불일치를 기록했습니다. 원자료는 비식별 세션 코드로만 보존했습니다.", ["frontend/src/research/hypothesis-validation-interview.html", "presentation/experiment-report.js"]),
  },
  {
    section: "product", kind: "metrics", meta: "01 PRODUCT EXPERIMENT",
    title: `자동 기입은 평균 시간을 ${report.reductionFromA.D}% 줄였다`,
    evidenceType: "current-state", implementationState: `${report.sessionCount}회, ${report.fieldCount}개 필드 집계`,
    body: `<div class="metric-hero"><strong>${report.averageSeconds.D}<small>초</small></strong><span>자동 기입 평균</span></div><div class="metric-bars">${Object.entries(report.averageSeconds).map(([key, value]) => `<article><b>${key}</b><div><i style="width:${(value / report.averageSeconds.A) * 100}%"></i></div><strong>${value}초</strong></article>`).join("")}</div><div class="metric-foot"><span>직접 입력 평균 ${report.averageSeconds.A}초</span><span>자동 기입 정확 필드 ${report.accurateFields.D} / ${report.fieldCount}</span><span>별도 탭 열람 평균 ${report.averageProfileTabSeconds}초</span></div>`,
    notes: note("제품 발표자", 75, `직접 입력은 평균 ${report.averageSeconds.A}초, 사이드 패널 복사는 ${report.averageSeconds.B}초, 별도 탭 복사는 ${report.averageSeconds.C}초, 자동 기입은 ${report.averageSeconds.D}초였습니다. 자동 기입은 직접 입력보다 평균 ${report.reductionFromA.D}% 짧았습니다.`, ["presentation/experiment-report.js", "presentation/deck.test.mjs"]),
  },
  {
    section: "product", kind: "comparison", meta: "01 PRODUCT EXPERIMENT",
    title: "빠른 방식이 항상 정확한 방식은 아니었다",
    evidenceType: "current-state", implementationState: "세션 오류를 필드 단위로 재집계",
    body: `<div class="accuracy-table"><div class="table-head"><span>방식</span><span>정확 필드</span><span>정확률</span><span>해석</span></div><article><b>B 사이드 패널</b><strong>${report.accurateFields.B} / ${report.fieldCount}</strong><em>${report.accuracyPercent.B}%</em><p>한 세션의 전 필드 누락이 평균 시간을 낮춤</p></article><article><b>C 별도 탭</b><strong>${report.accurateFields.C} / ${report.fieldCount}</strong><em>${report.accuracyPercent.C}%</em><p>탭 열람 비용과 한 필드 불일치 포함</p></article><article class="accent"><b>D 자동 기입</b><strong>${report.accurateFields.D} / ${report.fieldCount}</strong><em>${report.accuracyPercent.D}%</em><p>한 세션에서 두 필드 누락</p></article></div>`,
    notes: note("제품 발표자", 65, "평균 시간만 보면 한 세션의 B와 C가 매우 빨라 보이지만 실제로는 일곱 필드가 모두 누락됐습니다. D도 한 세션에서 두 필드가 누락됐습니다. 시간과 정확도를 함께 봐야 하며 안전 검토를 없앨 근거는 아닙니다.", ["presentation/experiment-report.js"]),
  },
  {
    section: "product", kind: "open-question", meta: "01 PRODUCT EXPERIMENT",
    title: "이 수치로 제품 방향을 결정해도 될까?",
    evidenceType: "open-question", implementationState: "가설 지지, 일반화는 미완료",
    discussionPrompt: "다음 실험에서 학습 효과와 실패 비용을 어떻게 분리하면 좋을까요?",
    limitations: ["fixed-order", "small-sample", "field-count-variation", "controlled-screen"],
    body: `<div class="limits"><article><b>고정 순서</b><p>A에서 D 순서라 뒤 과업에 학습 효과가 포함될 수 있음</p></article><article><b>작은 표본과 필드 차이</b><p>10회 세션이며 세션별 비교 필드가 7개에서 16개로 다름</p></article><article><b>통제된 화면</b><p>실제 사이트의 동적 DOM과 예외 상황은 미포함</p></article></div>${question("다음 실험의 우선순위", "무작위 과업 순서, 실제 사이트 과업, 오류 복구 측정 중 무엇부터 검증할지 피드백이 필요합니다.")}`,
    notes: note("제품 발표자", 60, "모든 세션이 고정 순서라 학습 효과가 포함될 수 있습니다. 표본도 작고 통제된 연구 화면을 사용했습니다. 다음 실험에서 무엇을 먼저 검증해야 제품 판단에 도움이 될지 의견을 듣고 싶습니다.", ["presentation/experiment-report.js", "GitHub Issue #64"]),
  },
  {
    section: "backend", kind: "decision", meta: "02 BACKEND",
    title: "Spring AI를 선택한 이유는 성능 우위가 아니었다",
    evidenceType: "decision", implementationState: "ADR 채택과 Spring AI 2.0 적용 완료",
    topics: ["backend-validates", "llm-classifies"],
    body: `<div class="decision-grid"><article class="selected"><span>SELECTED</span><h3>Spring AI 2.0</h3><p>Spring Boot 4 통합<br>공급자 중립 ChatClient<br>BOM 기반 버전 관리</p></article><article><span>SPIKE</span><h3>LangChain4j</h3><p>공급자 교체 가능성 확인<br>비교 조건과 로그가 동일하지 않음<br>성공률 비교 근거로 사용하지 않음</p></article></div><div class="decision-line">선택 기준은 현재 스택과의 통합 경계, 판단 보류 항목은 모델 성능</div>`,
    notes: note("백엔드 발표자", 60, "두 라이브러리를 탐색했지만 실험 조건과 구조화 출력 보장이 같지 않았습니다. 성능 우위가 아니라 현재 스택과의 통합, 공급자 중립 경계와 버전 관리를 기준으로 Spring AI를 선택했습니다.", ["llm-wiki/raw/issues/CF-41/documents/docs/adr/30-spring-ai-library.md", "backend/README.md"]),
  },
  {
    section: "backend", kind: "artifact", meta: "02 BACKEND",
    title: "선택을 ADR로 남기고 코드 경계를 좁혔다",
    evidenceType: "artifact", implementationState: "ADR과 런타임 코드가 같은 선택을 반영",
    body: `<div class="document-stack"><article><span>ADR 30</span><h3>공급자 중립 LLM 연동</h3><p>선택지, spike 한계, 재검토 조건 기록</p></article><article><span>RUNTIME</span><h3>OpenAiClient</h3><p>Structured Output과 엄격한 역직렬화 적용</p></article><article><span>TEST</span><h3>Field Mapping</h3><p>입력과 결과 bucket의 정확한 1대1 검증</p></article></div><div class="file-list">${source("llm-wiki/.../30-spring-ai-library.md")} ${source("backend/.../OpenAiClient.java")}</div>`,
    notes: note("백엔드 발표자", 70, "선택 과정은 ADR에 남겼고 런타임은 OpenAiClient 경계로 좁혔습니다. 모델 결과에 중복, 누락, 알 수 없는 ID가 하나라도 있으면 전체 결과를 폐기합니다.", ["llm-wiki/raw/issues/CF-41/documents/docs/adr/30-spring-ai-library.md", "llm-wiki/raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md"]),
  },
  {
    section: "backend", kind: "current-state", meta: "02 BACKEND",
    title: "현재 동작은 추론보다 검증에 더 많은 책임을 둔다",
    evidenceType: "current-state", implementationState: "Structured Output 안전 계약 구현 완료",
    topics: ["client-executes", "backend-validates", "llm-classifies"],
    body: `<div class="pipeline"><article><b>1</b><h3>비식별 투영</h3><p>필드 설명과 candidate ID만 전달</p></article><i></i><article><b>2</b><h3>Structured Output</h3><p>MATCH 또는 NO_MATCH로 전부 분류</p></article><i></i><article><b>3</b><h3>Exact Set 검증</h3><p>중복, 누락, unknown이면 전체 폐기</p></article></div><div class="boundary-callout">프로필 값, 전체 HTML, 인증 문맥과 실행 코드는 모델에 전달하지 않음</div>`,
    notes: note("백엔드 발표자", 75, "모델은 실제 값을 채우지 않고 비식별 필드 의미만 분류합니다. 모든 candidate를 두 결과 중 하나에 넣어야 하고 백엔드는 입력 집합과 같은지 다시 검증합니다. 실행은 사용자 상태를 아는 브라우저에 남깁니다.", ["llm-wiki/raw/issues/CF-40/documents/api/application-form-analysis-api.md", "llm-wiki/raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md"]),
  },
  {
    section: "backend", kind: "open-question", meta: "02 BACKEND",
    title: "계약은 검증했지만 모델 성능은 아직 측정하지 못했다",
    evidenceType: "open-question", implementationState: "정확도 기준과 회귀 데이터셋 미정",
    discussionPrompt: "모델 회귀 평가에서 어떤 실패를 가장 비싸게 봐야 할까요?",
    body: `<div class="gap-board"><article class="done"><span>PROVED</span><h3>형식 안전성</h3><p>스키마와 exact set 위반 시 실패</p></article><article class="pending"><span>NOT MEASURED</span><h3>의미 정확도</h3><p>회사와 필드 유형별 정답 데이터셋 없음</p></article><article class="pending"><span>NOT DECIDED</span><h3>비용 기준</h3><p>오탐, 미탐, 응답 시간의 가중치 미정</p></article></div>${question("평가 설계", "안전한 중단과 위험한 오매핑을 분리한 지표가 필요한지 묻고 싶습니다.")}`,
    notes: note("백엔드 발표자", 75, "형식 정합성은 검증했지만 필드 의미 정확도 데이터셋은 없습니다. 오탐은 잘못된 값을 넣을 위험이고 미탐은 직접 입력 불편입니다. 이를 어떻게 나눠 측정할지 피드백을 받고 싶습니다.", ["llm-wiki/raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md", "GitHub Issue #64"]),
  },
  {
    section: "client", kind: "decision", meta: "03 CLIENT",
    title: "웹페이지가 아니라 확장 프로그램을 선택했다",
    evidenceType: "decision", implementationState: "Chrome 확장 프로그램 구조 채택",
    topics: ["client-executes"],
    body: `<div class="decision-grid"><article><span>WEB PAGE</span><h3>프로필을 열어 복사</h3><p>지원서와 별도 탭 왕복<br>현재 DOM을 알 수 없음<br>사용자 문맥이 끊김</p></article><article class="selected"><span>CHROME EXTENSION</span><h3>지원서 옆에서 검토</h3><p>사이드 패널로 문맥 유지<br>현재 DOM에서만 실행<br>제출과 이동은 사용자 소유</p></article></div><div class="decision-line">별도 탭은 평균 ${report.averageProfileTabSeconds}초의 프로필 열람 비용이 추가됨</div>`,
    notes: note("클라이언트 발표자", 60, `별도 웹페이지는 단순하지만 지원서와 프로필 탭을 오가야 하고 현재 DOM을 알 수 없습니다. 실험에서도 프로필 탭 열람에 평균 ${report.averageProfileTabSeconds}초가 들었습니다. 문맥과 실행 상태를 함께 보기 위해 확장 프로그램을 선택했습니다.`, ["llm-wiki/raw/issues/CF-41/documents/docs/adr/16-popup-side-panel-boundary.md", "presentation/experiment-report.js"]),
  },
  {
    section: "client", kind: "evidence", meta: "03 CLIENT",
    title: "지금 동작하는 사이드 패널은 복사의 거점이다",
    evidenceType: "artifact", implementationState: "빌드된 실제 UI, 비식별 샘플 데이터",
    body: `<div class="evidence-layout panel-shot"><figure class="phone-frame"><img src="./assets/extension-screen.png" alt="빌드된 확장 프로그램 사이드 패널"></figure><div class="evidence-copy"><span class="eyebrow">ACTUAL BUILD</span><h3>지원 정보 탐색과 수동 복사</h3><ul><li>등록 범주와 검색 상태 표시</li><li>필드별 명시적 복사</li><li>민감정보 기본 가림</li><li>제출과 이동 기능 없음</li></ul><div class="file-ref">${source("frontend/src/entrypoints/sidepanel/")}</div></div></div>`,
    notes: note("클라이언트 발표자", 75, "빌드된 사이드 패널을 비식별 샘플 데이터로 실행한 화면입니다. 사용자는 정보를 검색하고 필드별로 복사합니다. 민감정보는 기본으로 가리고 현재 구현은 제출이나 이동을 자동화하지 않습니다.", ["frontend/src/entrypoints/sidepanel/App.tsx", "frontend/src/storage/chrome-profile-storage.ts"]),
  },
  {
    section: "client", kind: "current-state", meta: "03 CLIENT",
    title: "브라우저만 아는 상태는 브라우저가 책임진다",
    evidenceType: "current-state", implementationState: "프로필과 사이드 패널 구현, 실제 기입 연결은 진행 중",
    topics: ["client-executes", "human-approval"],
    body: `<div class="ownership-grid"><article><span>LOCAL</span><h3>프로필 값</h3><p>Chrome storage에 저장하고 모델로 전송하지 않음</p></article><article><span>RUNTIME</span><h3>현재 DOM</h3><p>기존 값과 동적 행을 실행 직전에 확인</p></article><article><span>CONTROL</span><h3>사용자 승인</h3><p>검토 뒤 선택한 항목만 변경</p></article><article><span>BOUNDARY</span><h3>제출 금지</h3><p>저장, 이동, 미리보기와 제출은 사용자 수행</p></article></div>`,
    notes: note("클라이언트 발표자", 75, "프로필 값, DOM, 사용자 승인은 실행 시점의 브라우저만 압니다. 따라서 클라이언트가 계획을 다시 검증하고 선택한 항목만 변경합니다. 프로필과 사이드 패널은 구현됐지만 분석 결과 검토와 실제 기입 연결은 진행 중입니다.", ["llm-wiki/wiki/topics/application-form-analysis-data-boundary.md", "frontend/README.md"]),
  },
  {
    section: "client", kind: "open-question", meta: "03 CLIENT",
    title: "실제 사이트에서도 안전하게 멈춘다는 증거가 부족하다",
    evidenceType: "open-question", implementationState: "연구 화면 검증 완료, 실제 회사 E2E 미완료",
    discussionPrompt: "회사별 변화에 대응하면서 안전 중단을 어떻게 증명하면 좋을까요?",
    body: `<div class="risk-list"><article><b>동적 DOM</b><p>섹션 열기와 반복 행 추가 뒤 대상이 달라짐</p></article><article><b>회사별 구조</b><p>같은 의미도 label과 선택지 구조가 다름</p></article><article><b>실패 관측</b><p>일부 기입 후 멈춘 상태를 설명해야 함</p></article></div>${question("검증 범위", "대표 회사 E2E, DOM mutation 시뮬레이션, 수동 시나리오 중 무엇을 릴리스 기준으로 삼을까요?")}`,
    notes: note("클라이언트 발표자", 70, "연구 화면은 검증했지만 실제 사이트의 동적 DOM과 회사별 예외는 충분히 증명하지 못했습니다. 구조가 바뀌면 안전하게 멈추는 정책을 어떤 증거로 릴리스 기준화할지 묻고 싶습니다.", ["llm-wiki/wiki/topics/adapter-development.md", "GitHub Issue #64"]),
  },
  {
    section: "team", kind: "decision", meta: "04 TEAM AND AX",
    title: "자동화보다 먼저 사람의 결정 지점을 고정했다",
    evidenceType: "decision", implementationState: "Issue와 PR 승인 체크포인트 운영 중",
    topics: ["human-approval", "agent-experience"],
    body: `<div class="workflow-line"><article><b>1</b><h3>Issue 계약</h3><p>사람이 범위와 완료 기준 확정</p></article><i></i><article><b>2</b><h3>격리 구현</h3><p>TDD와 전체 검증</p></article><i></i><article><b>3</b><h3>Draft PR</h3><p>사람 편집 뒤 재검증</p></article><i></i><article><b>4</b><h3>머지</h3><p>최종 결정은 사람</p></article></div><div class="decision-line">에이전트가 빨라져도 범위, 지식 반영과 머지는 자동 승인하지 않음</div>`,
    notes: note("소프트스킬 발표자", 60, "에이전트가 구현하기 전에 사람의 결정 지점을 고정했습니다. Issue 계약과 Draft PR을 사람이 수정하고 확정하며 최종 머지도 사람이 결정합니다.", ["harness/policies/workflow.md", "harness/policies/approval-matrix.md"]),
  },
  {
    section: "team", kind: "evidence", meta: "04 TEAM AND AX",
    title: "실제 Project가 팀과 에이전트의 공용 상태판이다",
    evidenceType: "artifact", implementationState: "Project #149 운영 화면, 담당자 정보 비식별 처리",
    body: `<div class="board-layout"><figure class="board-frame"><img src="./assets/project-board.png" alt="비식별 처리한 GitHub Project 칸반"></figure><div class="board-caption"><b>Issue #64</b><span>Todo에서 In Progress로 이동</span><p>Draft, Issue, PR 상태를 실제 작업 흐름에서 공유</p></div></div>`,
    notes: note("소프트스킬 발표자", 65, "현재 사용 중인 Project 칸반이며 담당자 정보는 가렸습니다. 이번 발표 자료 작업도 In Progress에 있습니다. 별도 보고서 대신 실제 작업 흐름을 공유합니다.", ["GitHub Project #149", "GitHub Issue #64"]),
  },
  {
    section: "team", kind: "current-state", meta: "04 TEAM AND AX",
    title: "AX는 프롬프트가 아니라 재개 가능한 작업 상태다",
    evidenceType: "current-state", implementationState: "하네스와 worktree별 checkpoint 적용 중",
    topics: ["agent-experience"],
    body: `<div class="ax-grid"><article><span>ISSUE</span><h3>이번 작업</h3><p>범위와 완료 기준의 정본</p></article><article><span>WIKI</span><h3>다시 쓸 지식</h3><p>제품 원칙과 ADR 연결</p></article><article><span>CHECKPOINT</span><h3>현재 위치</h3><p>중단 뒤에도 Git 상태와 대조</p></article><article><span>HOOK</span><h3>행동 가드</h3><p>위험 작업과 승인 순서 제한</p></article></div><div class="file-list">${source("cf-workflow/checkpoint.json")} ${source("harness/policies/workflow.md")}</div>`,
    notes: note("소프트스킬 발표자", 75, "Issue는 이번 작업, Wiki는 재사용 지식, checkpoint는 현재 단계, hook은 행동 경계를 담당합니다. AX를 좋은 프롬프트보다 사람과 에이전트가 같은 상태를 읽는 시스템으로 정의했습니다.", ["harness/policies/workflow.md", "llm-wiki/wiki/topics/llm-wiki-knowledge-model.md"]),
  },
  {
    section: "team", kind: "open-question", meta: "04 TEAM AND AX",
    title: "가드는 늘었지만 팀의 인지 비용도 함께 늘었다",
    evidenceType: "open-question", implementationState: "작업 재개성 확보, 팀 체감 측정 미완료",
    discussionPrompt: "우리 팀의 가드 중 없애도 되는 것은 무엇일까요?",
    body: `<div class="tradeoff"><article><span>얻은 것</span><h3>재개성과 안전</h3><p>작업 범위, 승인 지점과 검증 증거를 잃지 않음</p></article><article><span>치르는 비용</span><h3>규칙과 체크포인트</h3><p>작은 작업도 상태 전환과 문서 확인이 필요함</p></article></div>${question("그라운드 룰 점검", "안전 경계는 유지하면서 팀원이 기억해야 할 절차를 줄이는 방법이 필요합니다.")}`,
    notes: note("소프트스킬 발표자", 65, "가드와 checkpoint 덕분에 안전하게 재개하지만 팀원이 알아야 할 규칙도 늘었습니다. 도움이 되지 않는 절차를 걷어내기 위해 어떤 가드를 줄이거나 자동화하면 좋을지 함께 보고 싶습니다.", ["harness/policies/workflow.md", "GitHub Issue #64"]),
  },
];

const [
  cover,
  experimentArtifact,
  experimentSpeed,
  experimentAccuracy,
  productQuestion,
  backendDecision,
  backendArtifact,
  backendCurrentState,
  backendQuestion,
  clientDecision,
  clientCurrentUi,
  responsibilityBoundary,
  clientQuestion,
  teamDecision,
  teamArtifact,
  teamCurrentState,
  teamQuestion,
] = baseSlides;

const comparisonMethods = Object.freeze([
  { id: "A", label: "사용자 직접 입력" },
  { id: "B", label: "복사 붙여넣기가 가능한 사이드 패널 제공" },
  { id: "C", label: "정보를 모아둔 별도 탭 제공" },
  { id: "D", label: "자동 기입 기능 제공" },
]);

const slides = [
  {
    ...cover,
    storyRole: "project-title",
    implementationState: undefined,
    productFlow: undefined,
    body: `<div class="cover-copy minimal"><h1>Career Form</h1><p>채용 지원서 입력을 안전하게 보조하는 Chrome 확장 프로그램</p></div>`,
    notes: note("제품 발표자", 25, "Career Form은 채용 지원서에 반복해서 입력하는 정보를 안전하게 줄이기 위한 Chrome 확장 프로그램입니다. 먼저 서비스가 해결하려는 문제와 실제 사용 흐름을 소개하겠습니다.", ["README.md", "llm-wiki/wiki/topics/product-concept.md"]),
  },
  {
    section: "product",
    kind: "service",
    meta: "01 PRODUCT",
    storyRole: "service-introduction",
    evidenceType: "current-state",
    implementationState: "프로필과 사이드 패널 구현, 자동 기입 연결 진행 중",
    topics: ["product-problem", "client-executes", "human-approval"],
    productFlow: ["profile-register", "sidepanel-review", "approved-fill"],
    body: `<div class="service-problem"><span>문제</span><h3>지원서마다 같은 정보를<br>다시 찾고 옮겨 적는다</h3><p>반복 입력은 시간을 쓰고, 탭 이동과 복사 과정에서 누락과 오타를 만든다.</p></div><div class="service-flow"><article><b>1</b><h3>프로필 등록</h3><p>반복할 지원 정보를 한 번 정리</p></article><i></i><article><b>2</b><h3>지원서 옆에서 검토</h3><p>사이드 패널과 예정 값을 함께 확인</p></article><i></i><article><b>3</b><h3>선택한 항목 기입</h3><p>승인한 값만 현재 지원서에 반영</p></article></div><div class="service-boundary">저장, 이동, 미리보기와 제출은 사용자가 수행</div>`,
    notes: note("제품 발표자", 45, "사용자는 프로필을 한 번 등록하고 지원서 옆에서 필요한 정보를 찾습니다. 자동 기입에서는 예정 값과 상태를 검토하고 선택한 항목만 승인합니다. Career Form은 지원서 저장, 페이지 이동, 미리보기와 제출을 대신하지 않습니다.", ["llm-wiki/wiki/topics/product-concept.md", "frontend/src/profile/field-definitions.ts", "frontend/src/autofill-demo/AutofillDemo.tsx"]),
  },
  {
    ...experimentArtifact,
    meta: "01 PRODUCT",
    storyRole: "experiment-artifact",
    statePlacement: "subtitle",
    body: `<div class="section-label">가설 검증 및 사용자 실험</div><div class="evidence-layout experiment"><figure class="evidence-frame"><img src="./assets/experiment-screen.png" alt="비식별 가설 검증 인터뷰 화면"></figure><div class="evidence-copy"><span class="eyebrow">실제 실험 화면</span><h3>같은 지원 정보로<br>입력 방식만 변경</h3><p>과업별 시간, 누락과 불일치를 기록하고 세션은 S01부터 S10까지 비식별 처리</p></div></div>`,
    notes: note("제품 발표자", 55, "실제 인터뷰에 사용한 HTML입니다. 같은 지원 정보 필드를 네 방식으로 수행하고 시간, 누락과 불일치를 기록했습니다. 원자료는 비식별 세션 코드로만 보존했습니다.", ["frontend/src/research/hypothesis-validation-interview.html", "presentation/experiment-report.js"]),
  },
  {
    ...experimentSpeed,
    meta: "01 PRODUCT",
    storyRole: "experiment-speed",
    comparisonMethods,
    body: `<div class="metric-hero"><strong>${report.averageSeconds.D}<small>초</small></strong><span>자동 기입 평균</span></div><div class="metric-bars verbose">${comparisonMethods.map(({ id, label }) => `<article><b><em>${id}</em>${label}</b><div><i style="width:${(report.averageSeconds[id] / report.averageSeconds.A) * 100}%"></i></div><strong>${report.averageSeconds[id]}초</strong></article>`).join("")}</div><div class="metric-foot"><span>직접 입력 평균 ${report.averageSeconds.A}초</span><span>자동 기입 정확 필드 ${report.accurateFields.D} / ${report.fieldCount}</span><span>별도 탭 열람 평균 ${report.averageProfileTabSeconds}초</span></div>`,
    notes: note("제품 발표자", 65, `사용자 직접 입력은 평균 ${report.averageSeconds.A}초, 복사 가능한 사이드 패널은 ${report.averageSeconds.B}초, 별도 탭은 ${report.averageSeconds.C}초, 자동 기입은 ${report.averageSeconds.D}초였습니다. 자동 기입은 직접 입력보다 평균 ${report.reductionFromA.D}% 짧았습니다.`, ["presentation/experiment-report.js", "presentation/deck.test.mjs"]),
  },
  {
    ...experimentAccuracy,
    meta: "01 PRODUCT",
    storyRole: "experiment-accuracy",
    notes: note("제품 발표자", 55, experimentAccuracy.notes.text, experimentAccuracy.notes.sources),
  },
  {
    ...productQuestion,
    kind: "roadmap",
    meta: "01 PRODUCT",
    storyRole: "product-roadmap",
    title: "효용을 확인했고, 이제 데모로 실제 니즈와 데이터를 모은다",
    evidenceType: "roadmap",
    implementationState: "통제 실험 완료, 실제 사용 검증 예정",
    discussionPrompt: undefined,
    roadmapSteps: ["demo-distribution", "need-and-usage-data", "product-iteration"],
    body: `<div class="limitation-line"><span>현재 근거의 한계</span><p>10회, A에서 D 고정 순서, 7개에서 16개 필드, 통제된 실험 화면</p></div><div class="roadmap-line"><article><b>1</b><span>배포</span><h3>데모 공개</h3><p>실제 구직자에게 핵심 흐름 제공</p></article><i></i><article><b>2</b><span>학습</span><h3>니즈와 실데이터 수집</h3><p>과업 완료, 오류와 이탈 원인 확인</p></article><i></i><article><b>3</b><span>개선</span><h3>제품 업데이트</h3><p>실패 유형과 사용 맥락을 기능에 반영</p></article></div>`,
    notes: note("제품 발표자", 55, "이번 수치는 자동 기입의 효용 가설을 지지하지만 일반화된 인과 효과는 아닙니다. 다음 단계에서는 데모를 실제 사용자에게 배포해 니즈, 과업 완료와 오류 데이터를 모으고 그 결과로 제품을 업데이트할 계획입니다.", ["presentation/experiment-report.js", "GitHub Issue #64"]),
  },
  {
    ...clientDecision,
    meta: "02 CLIENT",
    storyRole: "client-decision",
    implementationState: "기술 선정 이유, Chrome 확장 프로그램 구조 채택",
    body: `<div class="section-label">기술 선정 이유</div><div class="decision-grid measured"><article><span>별도 웹페이지</span><h3>${report.averageSeconds.C}초</h3><p>정리된 정보를 보기 위해 탭을 왕복하고, 지원서 문맥이 끊김</p><small>프로필 탭 열람만 평균 ${report.averageProfileTabSeconds}초</small></article><article class="selected"><span>Chrome 확장 프로그램</span><h3>${report.averageSeconds.B}초</h3><p>지원서 오른쪽에 정보를 두고, 현재 문맥에서 바로 검토</p><small>별도 탭보다 낮은 전환 비용</small></article></div><div class="decision-line">별도 웹은 기존 아카이빙 도구와 차이가 작고, 탭 전환 피로를 추가했다</div>`,
    notes: note("클라이언트 발표자", 65, `실험에서 사이드 패널 복사는 평균 ${report.averageSeconds.B}초, 별도 탭 복사는 ${report.averageSeconds.C}초였습니다. 별도 탭에서는 프로필 화면을 여는 데만 평균 ${report.averageProfileTabSeconds}초가 추가됐습니다. 웹페이지는 노션 같은 아카이빙 도구와 차별점이 작고 탭 전환 피로를 더했기 때문에 현재 지원서 옆에서 동작하는 확장 프로그램을 선택했습니다.`, ["llm-wiki/raw/issues/CF-41/documents/docs/adr/16-popup-side-panel-boundary.md", "presentation/experiment-report.js"]),
  },
  {
    ...clientCurrentUi,
    meta: "02 CLIENT, 현재 구현",
    storyRole: "client-current-ui",
    implementationState: "현재 구현, 빌드된 실제 UI와 비식별 샘플 데이터",
    notes: note("클라이언트 발표자", 55, "이 화면은 현재 빌드되는 사이드 패널을 비식별 샘플 데이터로 실행한 결과입니다. 사용자는 정보를 검색하고 필드별로 복사합니다. 민감정보는 기본으로 가리고 제출이나 이동 기능은 없습니다.", clientCurrentUi.notes.sources),
  },
  {
    ...responsibilityBoundary,
    kind: "boundary",
    meta: "02 CLIENT",
    storyRole: "responsibility-boundary",
    title: "브라우저의 실행 정보와 백엔드의 의미 분석을 분리했다",
    implementationState: "데이터 경계 계약 완료, 런타임 연결 진행 중",
    responsibilityBoundary: {
      browser: ["profile-values", "current-dom", "user-approval", "field-execution"],
      backend: ["candidate-validation", "semantic-mapping", "write-policy"],
    },
    body: `<div class="boundary-columns"><article class="browser-side"><span>FRONTEND, BROWSER</span><h3>실행 시점의 정보</h3><ul><li>로컬 프로필 값</li><li>현재 DOM과 기존 입력값</li><li>사용자 선택과 최종 승인</li><li>기입 실행과 결과 확인</li></ul></article><article class="backend-side"><span>BACKEND, LLM</span><h3>비식별 의미 분석</h3><ul><li>candidate 구조 검증</li><li>필드 의미와 프로필 키 매핑</li><li>입력 가능 정책 생성</li><li>중복과 unknown 결과 거부</li></ul></article></div><div class="boundary-callout">실제 값, 전체 HTML, 계정과 세션, selector와 실행 코드는 백엔드로 보내지 않음</div>`,
    notes: note("클라이언트 발표자", 65, "브라우저는 실제 프로필 값, 현재 DOM, 기존 값과 사용자 승인을 알고 실행합니다. 백엔드는 값이 없는 candidate 문맥을 검증하고 필드 의미와 입력 정책을 반환합니다. 이 데이터 경계 계약은 확정됐지만 전체 런타임 연결은 진행 중입니다.", ["llm-wiki/wiki/topics/application-form-analysis-data-boundary.md", "llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md"]),
  },
  {
    section: "client",
    kind: "autofill",
    meta: "02 CLIENT, 자동 기입",
    storyRole: "autofill-flow",
    title: "자동 기입은 분석, 검토, 승인, 실행을 한 흐름으로 잇는다",
    evidenceType: "current-state",
    implementationState: "백엔드 계약과 검토 UI 구현, DOM 수집과 실제 기입 연결 예정",
    topics: ["client-executes", "backend-validates", "llm-classifies", "human-approval"],
    autofillFlow: ["collect-minimum-context", "analyze-field-meaning", "connect-local-values", "review-and-approve", "fill-and-verify"],
    userActions: ["review", "select", "approve", "verify-result"],
    body: `<div class="autofill-flow"><article class="browser"><b>1</b><span>브라우저</span><h3>DOM 문맥 추출</h3><p>label, ARIA, control type, 선택지와 section 문맥만 수집</p><small>값, HTML, 세션, selector 제외</small></article><i></i><article class="server"><b>2</b><span>백엔드와 LLM</span><h3>필드 의미 분석</h3><p>candidate ID를 프로필 키와 입력 정책에 매핑</p><small>실제 값 없이 계획만 반환</small></article><i></i><article class="browser"><b>3</b><span>브라우저</span><h3>로컬 값 연결</h3><p>현재 DOM과 기존 값을 다시 확인해 예정 항목 구성</p><small>실행 직전 최신 상태 사용</small></article></div><div class="review-journey"><span>사용자 화면</span><article>입력 예정 항목 검토</article><i></i><article>변경 항목 선택</article><i></i><article>최종 승인</article><i></i><article>기입 결과 직접 확인</article></div><div class="autofill-boundary">승인한 항목만 기입, 저장과 이동 및 제출은 실행하지 않음</div>`,
    notes: note("클라이언트 발표자", 75, "브라우저는 label, ARIA, control type과 section 문맥만 추려 백엔드로 보냅니다. 백엔드와 LLM은 candidate 의미를 프로필 키와 입력 정책으로 바꾸고 실제 값은 다루지 않습니다. 브라우저가 로컬 값을 연결해 검토 화면을 보여주고, 사용자는 변경할 항목을 선택해 최종 승인합니다. 기입 뒤에는 결과를 직접 확인합니다. 현재 백엔드 계약과 이 화면 데모는 구현됐고 DOM 수집과 실제 기입 연결은 남아 있습니다.", ["llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md", "frontend/src/autofill-demo/AutofillDemo.tsx", "frontend/src/autofill-demo/AutofillDemo.test.tsx"]),
  },
  {
    ...clientQuestion,
    kind: "roadmap",
    meta: "02 CLIENT",
    storyRole: "client-roadmap",
    title: "안전 계약은 세웠지만, 실제 사이트에서 멈추는 증거가 부족하다",
    evidenceType: "roadmap",
    implementationState: "연구 화면 검증 완료, 실제 회사 E2E 미완료",
    discussionPrompt: undefined,
    roadmapSteps: ["connect-runtime", "representative-e2e", "observe-failures"],
    body: `<div class="status-ledger"><article class="done"><span>완료</span><h3>검토와 승인 UI</h3><p>기존 값 보호, 민감정보 확인과 제출 금지 상태 표현</p></article><article><span>부족</span><h3>실제 DOM 실행</h3><p>동적 행과 회사별 구조에서 안전 중단을 아직 증명하지 못함</p></article></div><div class="roadmap-compact"><article><b>1</b><p>DOM collector와 executor 연결</p></article><article><b>2</b><p>대표 회사 E2E와 구조 변경 시나리오 검증</p></article><article><b>3</b><p>부분 실패 관측과 수동 복사 전환 개선</p></article></div>`,
    notes: note("클라이언트 발표자", 50, "현재 검토와 승인 UI는 있지만 실제 회사 페이지에서 DOM을 수집하고 기입하는 연결은 완료되지 않았습니다. 다음에는 collector와 executor를 연결하고 대표 회사 E2E, 구조 변경과 부분 실패 시나리오를 릴리스 증거로 쌓을 계획입니다.", ["frontend/src/autofill-demo/AutofillDemo.tsx", "llm-wiki/wiki/topics/adapter-development.md", "GitHub Issue #64"]),
  },
  {
    ...backendDecision,
    meta: "03 BACKEND",
    storyRole: "backend-decision",
    notes: note("백엔드 발표자", 65, backendDecision.notes.text, backendDecision.notes.sources),
  },
  {
    ...backendArtifact,
    meta: "03 BACKEND",
    storyRole: "backend-artifact",
    body: `<div class="document-stack"><article><span>ADR 30</span><h3>공급자 중립 LLM 연동</h3><p>선택지, spike 한계와 재검토 조건 기록</p></article><article><span>RUNTIME</span><h3>OpenAiClient</h3><p>Structured Output과 엄격한 역직렬화 적용</p></article><article><span>TEST</span><h3>Provider Contract</h3><p>중복과 unknown은 거부하고 누락은 NO_MATCH로 보완</p></article></div><div class="file-list">${source("llm-wiki/.../30-spring-ai-library.md")} ${source("backend/.../OpenAiClient.java")}</div>`,
    notes: note("백엔드 발표자", 70, "선택 과정은 ADR에 남겼고 런타임은 OpenAiClient 경계로 좁혔습니다. 모델 결과에 중복이나 입력에 없는 candidate ID가 있으면 전체 결과를 폐기하고, 생략된 field candidate는 안전한 NO_MATCH로 보완합니다.", ["llm-wiki/raw/issues/CF-41/documents/docs/adr/30-spring-ai-library.md", "llm-wiki/raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md"]),
  },
  {
    ...backendCurrentState,
    meta: "03 BACKEND",
    storyRole: "backend-current-state",
    providerContract: "omission-to-no-match",
    body: `<div class="pipeline"><article><b>1</b><h3>비식별 투영</h3><p>필드 설명과 candidate ID만 전달</p></article><i></i><article><b>2</b><h3>Structured Output</h3><p>확실한 MATCH만 반환</p></article><i></i><article><b>3</b><h3>계약 검증</h3><p>중복과 unknown은 거부, 누락은 NO_MATCH</p></article></div><div class="boundary-callout">프로필 값, 전체 HTML, 인증 문맥과 실행 코드는 모델에 전달하지 않음</div>`,
    notes: note("백엔드 발표자", 75, "모델은 실제 값을 채우지 않고 확실한 필드 의미만 MATCH로 반환합니다. 백엔드는 중복과 입력에 없는 candidate ID를 거부하고, 생략된 candidate는 안전한 NO_MATCH로 보완합니다. 실제 실행은 사용자 상태를 아는 브라우저에 남깁니다.", ["llm-wiki/raw/issues/CF-40/documents/api/application-form-analysis-api.md", "llm-wiki/raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md"]),
  },
  {
    ...backendQuestion,
    kind: "roadmap",
    meta: "03 BACKEND",
    storyRole: "backend-roadmap",
    title: "형식 안전성 다음에는 의미 정확도를 측정해야 한다",
    evidenceType: "roadmap",
    implementationState: "정확도 기준과 회귀 데이터셋 미정",
    discussionPrompt: undefined,
    roadmapSteps: ["build-dataset", "define-cost", "regression-gate"],
    body: `<div class="status-ledger backend-ledger"><article class="done"><span>확인한 것</span><h3>형식 안전성</h3><p>스키마, candidate ID와 canonical key 위반을 차단</p></article><article><span>부족한 것</span><h3>의미 정확도</h3><p>회사와 필드 유형별 정답 데이터셋, 오탐과 미탐 비용 기준 부재</p></article></div><div class="roadmap-compact"><article><b>1</b><p>회사와 필드 유형별 정답 데이터셋 구축</p></article><article><b>2</b><p>오탐, 미탐과 응답 시간 지표 분리</p></article><article><b>3</b><p>모델과 프롬프트 변경 시 회귀 평가 자동화</p></article></div>`,
    notes: note("백엔드 발표자", 70, "형식 계약은 검증했지만 모델의 의미 정확도는 아직 측정하지 못했습니다. 회사와 필드 유형별 정답 데이터셋을 만들고, 위험한 오매핑과 불편을 만드는 미탐, 응답 시간을 분리한 뒤 변경 전후 회귀 평가로 연결할 계획입니다.", ["llm-wiki/raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md", "GitHub Issue #64"]),
  },
  {
    ...teamDecision,
    storyRole: "team-decision",
    notes: note("소프트스킬 발표자", 55, teamDecision.notes.text, teamDecision.notes.sources),
  },
  {
    ...teamArtifact,
    storyRole: "team-artifact",
    notes: note("소프트스킬 발표자", 55, teamArtifact.notes.text, teamArtifact.notes.sources),
  },
  {
    ...teamCurrentState,
    storyRole: "team-current-state",
    notes: note("소프트스킬 발표자", 60, teamCurrentState.notes.text, teamCurrentState.notes.sources),
  },
  {
    ...teamQuestion,
    kind: "alignment",
    storyRole: "knowledge-alignment",
    title: "한 사람이 AI와 내린 결론이 다음 팀원의 출발점이 된다",
    evidenceType: "alignment",
    implementationState: "LLM Wiki, 승인 digest와 근거 링크 운영 중",
    discussionPrompt: undefined,
    topics: ["agent-experience", "human-approval"],
    knowledgeFlow: ["human-decision", "approved-knowledge", "agent-context", "team-alignment"],
    body: `<div class="knowledge-flow"><article><b>1</b><span>사람과 AI</span><h3>결정</h3><p>Issue와 ADR에서 이유까지 확정</p></article><i></i><article><b>2</b><span>LLM Wiki</span><h3>승인된 지식</h3><p>불변 raw와 최신 topic을 연결</p></article><i></i><article><b>3</b><span>다음 대화</span><h3>맥락 재사용</h3><p>AI가 이전 결정과 근거를 먼저 읽음</p></article><i></i><article><b>4</b><span>팀</span><h3>이해 정렬</h3><p>다른 팀원의 결론을 자연스럽게 접함</p></article></div><div class="knowledge-principle">대화 전문은 모으지 않고, 사람이 승인한 재사용 지식만 팀의 다음 맥락으로 전달</div>`,
    notes: note("소프트스킬 발표자", 65, "팀원이 AI와 함께 내린 결론은 승인된 근거로 LLM Wiki에 연결됩니다. 다음 팀원이 AI와 대화할 때 이 맥락을 먼저 읽기 때문에 다른 팀원이 내린 결론과 이유를 자연스럽게 접하고 팀의 이해 수준을 맞출 수 있습니다. 대화 전문을 수집하지 않고 사람이 승인한 지식만 남깁니다.", ["llm-wiki/wiki/topics/llm-wiki-knowledge-model.md", "llm-wiki/raw/issues/CF-41/documents/docs/adr/25-llm-wiki.md"]),
  },
  {
    section: "team",
    kind: "closing",
    meta: "CAREER FORM",
    storyRole: "closing",
    evidenceType: "synthesis",
    implementationState: "다음 단계, 데모 배포와 실제 사용 데이터 학습",
    closingMessage: "사용자를 모으는 제품을 넘어, 사용자의 시간을 돌려주는 생산성 도구로",
    body: `<div class="closing-copy"><span>Career Form</span><h2>사용자를 모으는 제품을 넘어,<br><em>사용자의 시간을 돌려주는 생산성 도구로</em></h2><p>반복 입력은 줄이고, 중요한 판단에 쓰는 시간은 늘립니다.</p></div>`,
    notes: note("소프트스킬 발표자", 40, "Career Form은 사용자를 모으는 데서 멈추지 않고 반복 입력에 쓰이는 시간을 돌려주는 생산성 도구로 나아가려 합니다. 실험으로 효용을 확인한 지금, 데모와 실제 사용 데이터를 통해 이 방향을 계속 검증하겠습니다.", ["GitHub Issue #64", "presentation/experiment-report.js"]),
  },
];

function clampSlideIndex(index, slideCount) {
  return Math.max(0, Math.min(slideCount - 1, index));
}

function setupDeck() {
  const stage = document.querySelector(".stage");
  stage.innerHTML = slides.map((slide, index) => {
    const state = !slide.implementationState
      ? ""
      : slide.statePlacement === "subtitle"
        ? `<p class="state-subtitle">${slide.implementationState}</p>`
        : `<div class="state-chip">${slide.implementationState}</div>`;
    return `<section class="slide ${slide.section} ${slide.kind} ${index === 0 ? "active" : ""}" data-slide="${index + 1}"><div class="meta">${slide.meta}</div>${state}${slide.title ? `<h2 class="title">${slide.title}</h2>` : ""}${slide.body}${slide.discussionPrompt ? `<p class="discussion-prompt">${slide.discussionPrompt}</p>` : ""}<aside class="notes">${renderNote(slide.notes)}</aside></section>`;
  }).join("");
  const nodes = [...document.querySelectorAll(".slide")];
  const notesPanel = document.querySelector(".speaker-notes");
  const currentLabel = document.querySelector("[data-current]");
  document.querySelector("[data-total]").textContent = String(nodes.length);
  let current = 0;
  function scaleDeck() {
    const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    document.documentElement.style.setProperty("--scale", String(scale));
  }
  function show(index) {
    current = clampSlideIndex(index, nodes.length);
    nodes.forEach((node, i) => node.classList.toggle("active", i === current));
    currentLabel.textContent = String(current + 1);
    notesPanel.innerHTML = nodes[current].querySelector(".notes").innerHTML;
    history.replaceState(null, "", `#${current + 1}`);
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      document.body.classList.remove("presentation-mode");
      return;
    }
    await document.documentElement.requestFullscreen();
    document.body.classList.add("presentation-mode");
  }
  document.querySelector("[data-action='prev']").addEventListener("click", () => show(current - 1));
  document.querySelector("[data-action='next']").addEventListener("click", () => show(current + 1));
  document.querySelector("[data-action='notes']").addEventListener("click", () => { notesPanel.hidden = !notesPanel.hidden; });
  document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);
  window.addEventListener("resize", scaleDeck);
  document.addEventListener("fullscreenchange", scaleDeck);
  const initial = Number.parseInt(location.hash.slice(1), 10);
  scaleDeck();
  show(Number.isFinite(initial) ? initial - 1 : 0);
}

if (typeof module !== "undefined") module.exports = { clampSlideIndex, slides };
if (typeof document !== "undefined") setupDeck();

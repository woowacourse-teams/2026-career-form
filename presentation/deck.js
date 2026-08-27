const note = (speaker, seconds, text, sources) => Object.freeze({
  speaker,
  seconds,
  text,
  sources: Object.freeze([...sources]),
});

const renderNote = ({ speaker, seconds, text, sources }) =>
  `<strong>${speaker}, 약 ${seconds}초</strong><p>${text}</p>` +
  `<p>[Sources]<br>${sources.join("<br>")}</p>`;

const numberedFlow = (items, className = "flow") => `
  <div class="${className}">
    ${items.map((item, index) => `
      <article><b class="number">${index + 1}</b><h3>${item[0]}</h3><p>${item[1]}</p></article>
      ${index < items.length - 1 ? '<i class="connector"></i>' : ""}
    `).join("")}
  </div>`;

const slides = [
  {
    section: "product", kind: "cover", meta: "2026 CAREER FORM",
    topics: ["product-problem"],
    body: `<div class="cover-copy"><h1>지원서 입력을<br><em>다시 설계하다</em></h1><p class="lead">반복 입력은 줄이고, 결정권은 사용자에게</p></div><div class="footer">우아한테크코스 팀 프로젝트</div>`,
    notes: note("제품 발표자", 30,
      "안녕하세요. 저희는 채용 지원서를 쓸 때마다 같은 정보를 다시 찾고 입력하는 문제를 해결하고 있습니다. Career Form은 정보를 대신 수집하거나 지원서를 대신 제출하는 서비스가 아닙니다. 사용자가 직접 정리한 정보를 필요한 지원서에 안전하게 다시 쓰도록 돕는 Chrome 확장 프로그램입니다. 오늘은 제품, 백엔드, 클라이언트, 협업과 AX 순서로 소개하겠습니다.",
      ["README.md", "llm-wiki/raw/issues/CF-41/documents/docs/PRODUCT_CONCEPT.md"]),
  },
  {
    section: "product", kind: "statement", meta: "01 PRODUCT",
    body: `<div class="mark">REPEAT</div><h2 class="title">지원할 때마다 같은 정보를<br><em>다시 찾고, 다시 입력한다</em></h2><div class="word-row"><span>학력</span><span>어학</span><span>자격증</span><span>프로젝트</span><span>병역과 보훈</span></div>`,
    notes: note("제품 발표자", 65,
      "채용 사이트마다 항목 이름과 입력 형식은 다르지만, 사용자가 적는 정보는 대부분 반복됩니다. 이름이나 연락처뿐 아니라 자격증 번호, 취득일, 어학 성적, 학력 기간처럼 기억하기 어려운 정보도 다시 찾아야 합니다. 이 정보는 이력서, 메모, 발급 기관 사이트에 흩어져 있습니다. 문제는 정보를 저장하지 않았다는 것이 아니라, 지원 시점에 바로 꺼내 쓰기 어렵다는 데 있습니다.",
      ["llm-wiki/raw/issues/CF-41/documents/docs/PRODUCT_CONCEPT.md"]),
  },
  {
    section: "product", kind: "", meta: "01 PRODUCT", title: "한 번 정리하고, 지원할 때 꺼내 쓴다",
    body: numberedFlow([
      ["등록", "지원 정보를<br>브라우저에 정리"],
      ["분석", "지원서 항목과<br>저장 위치 연결"],
      ["검토", "예정 값과<br>입력 가능 상태 확인"],
      ["기입", "사용자가 선택한<br>항목만 변경"],
    ]),
    notes: note("제품 발표자", 75,
      "사용자는 먼저 확장 프로그램의 프로필 화면에 지원 정보를 등록합니다. 지원서 페이지에서 자동 기입을 시작하면, Career Form이 현재 페이지의 입력 항목을 분석하고 저장된 정보의 위치와 연결합니다. 바로 입력하지 않고 입력 예정 값과 상태를 먼저 보여줍니다. 사용자가 항목을 고르고 최종 확인한 뒤에만 선택한 값을 기입합니다. 제품의 핵심 경험은 자동 입력 버튼 한 번이 아니라 등록, 분석, 검토, 승인, 기입으로 이어지는 확인 가능한 흐름입니다.",
      ["llm-wiki/raw/issues/CF-41/documents/docs/PRODUCT_CONCEPT.md", "llm-wiki/raw/issues/CF-41/documents/docs/design/35-extension-ui-design.md"]),
  },
  {
    section: "product", kind: "principles", meta: "01 PRODUCT", title: "자동화의 범위를 먼저 제한했다",
    body: `<div class="grid two principles">
      <article class="card"><span class="eyebrow">LOCAL</span><h3>프로필은 브라우저에</h3><p>공통 정보와 민감한 값은 로컬 우선</p></article>
      <article class="card"><span class="eyebrow">REVIEW</span><h3>입력 전 확인</h3><p>예정 값, 충돌과 입력 불가 상태를 표시</p></article>
      <article class="card"><span class="eyebrow">CONTROL</span><h3>선택한 항목만</h3><p>기존 값을 보호하고 명시적 승인 뒤 실행</p></article>
      <article class="card"><span class="eyebrow">NO SUBMIT</span><h3>제출은 사용자에게</h3><p>저장, 이동, 미리보기와 제출은 자동화하지 않음</p></article>
    </div>`,
    notes: note("제품 발표자", 70,
      "자동 입력은 편하지만 어떤 값이 바뀌는지 알 수 없으면 신뢰하기 어렵습니다. 그래서 저희는 기능보다 안전 경계를 먼저 정했습니다. 프로필 값은 브라우저 로컬에 두고, 입력 전에는 예정 값과 충돌 상태를 보여줍니다. 입력 가능 항목만 기본 선택하고 민감정보와 기존 값 충돌은 사용자가 다시 확인합니다. 저장 버튼, 다음 단계, 미리보기와 최종 제출은 제품이 조작하지 않습니다.",
      ["llm-wiki/raw/business/product-principles.md", "llm-wiki/raw/issues/CF-41/documents/docs/PRODUCT_CONCEPT.md"]),
  },
  {
    section: "product", kind: "status", meta: "01 PRODUCT", title: "지금은 화면과 안전 계약을 먼저 검증 중이다",
    body: `<div class="grid three">
      <article class="card"><span class="eyebrow">구현</span><h3>프로필과 검토 UI</h3><p>로컬 저장, 검색, 복사, 비식별 자동 기입 목업</p></article>
      <article class="card"><span class="eyebrow">설계 완료</span><h3>분석 API 경계</h3><p>브라우저, 백엔드, LLM 책임과 데이터 계약</p></article>
      <article class="card accent"><span class="eyebrow">진행 중</span><h3>실제 분석과 기입</h3><p>LLM 매핑, 회사 어댑터, 브라우저 실행기</p></article>
    </div><p class="status-note">설계된 동작과 현재 구현된 동작을 구분해 검증하고 있다</p>`,
    notes: note("제품 발표자", 55,
      "현재 화면과 로컬 프로필 관리, 자동 기입 검토 목업은 구현돼 있습니다. 브라우저, 백엔드, LLM 사이의 데이터와 책임 경계는 API와 ADR로 설계하고 검증했습니다. 실제 LLM 필드 매핑과 회사별 어댑터, 브라우저 실행기는 진행 중입니다. 오늘 발표에서도 설계한 목표를 이미 완성한 기능처럼 말하지 않고, 구현과 계약을 구분해서 설명하겠습니다.",
      ["frontend/src/autofill-demo/model.ts", "llm-wiki/wiki/topics/application-form-analysis-data-boundary.md", "GitHub PR #42, #52"]),
  },
  {
    section: "backend", kind: "section", meta: "02 BACKEND",
    body: `<div class="section-number">02</div><h2 class="title">해석과 실행 사이에<br><em>경계를 둔다</em></h2><p class="subtitle">백엔드는 값을 입력하지 않고, 검증된 계획을 만든다</p>`,
    notes: note("백엔드 발표자", 35,
      "제품의 안전 원칙을 기술 구조로 옮기면서 가장 먼저 정한 것은 해석과 실행의 분리였습니다. 백엔드는 실제 지원서 값을 갖거나 브라우저를 직접 조작하지 않습니다. 비식별 구조를 검증하고 어떤 의미의 행동이 가능한지 제한된 계획으로 반환합니다.",
      ["llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md"]),
  },
  {
    section: "backend", kind: "", meta: "02 BACKEND", title: "세 주체는 서로 다른 정보를 알고 있다",
    topics: ["client-executes", "backend-validates", "llm-classifies"],
    body: `<div class="responsibility">
      <article class="card"><span class="eyebrow">CLIENT</span><h3>실행 상태</h3><p>프로필 값<br>현재 DOM<br>사용자 승인<br>실제 기입</p></article><i class="connector"></i>
      <article class="card accent"><span class="eyebrow">BACKEND</span><h3>검증과 조율</h3><p>요청 스키마<br>어댑터 선택<br>LLM 입력 최소화<br>계획 검증</p></article><i class="connector"></i>
      <article class="card"><span class="eyebrow">LLM</span><h3>의미 분류</h3><p>비어댑터 필드<br>MATCH<br>NO_MATCH<br>canonical key</p></article>
    </div><div class="boundary">프로필 값, 전체 HTML과 인증 문맥은 LLM으로 보내지 않는다</div>`,
    notes: note("백엔드 발표자", 90,
      "클라이언트는 실제 프로필 값과 현재 DOM, 사용자의 승인을 알고 있으므로 실행을 책임집니다. 백엔드는 들어온 구조를 검증하고 회사 어댑터 또는 LLM 경로를 선택하며, LLM에 필요한 정보만 다시 구성합니다. LLM은 회사 어댑터가 없는 사이트의 입력 필드 의미만 MATCH 또는 NO MATCH로 분류합니다. 프로필 값, 전체 HTML, URL의 상세 정보, 인증 문맥과 실행 코드는 LLM에 전달하지 않습니다. LLM 결과도 실행의 단독 근거로 쓰지 않습니다.",
      ["llm-wiki/wiki/topics/application-form-analysis-data-boundary.md", "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis-api.md"]),
  },
  {
    section: "backend", kind: "", meta: "02 BACKEND", title: "수명주기가 다른 분석을 두 번에 나눴다",
    body: `<div class="split">
      <article><span class="eyebrow">SNAPSHOT A</span><h3>페이지 준비</h3><p>숨은 섹션 열기<br>반복 입력 행 추가<br>실행 후 효과 확인</p><code>/preparation/analyze</code></article>
      <div class="divider"></div>
      <article><span class="eyebrow">SNAPSHOT B</span><h3>필드 매핑</h3><p>입력 필드 의미 분석<br>프로필 저장 위치 연결<br>제한된 write plan</p><code>/fields/analyze</code></article>
    </div>`,
    notes: note("백엔드 발표자", 80,
      "동적인 지원서는 버튼을 눌러 섹션을 열거나 자격증 입력 행을 추가해야 필드가 나타납니다. 준비 동작과 필드 매핑을 한 요청에 섞으면 현재 상태와 다음 행동이 모호해집니다. 그래서 Snapshot A는 아직 실행하지 않은 action candidate만 보내고 준비 계획만 받습니다. 브라우저가 실행 효과를 확인하고 DOM을 다시 수집한 뒤 Snapshot B에서 입력 필드만 보냅니다. 서로 다른 수명주기와 재시도 정책을 API 구조로 분리했습니다.",
      ["llm-wiki/wiki/topics/application-form-analysis-api.md", "llm-wiki/raw/issues/CF-44/documents/api/application-form-analysis-api.md"]),
  },
  {
    section: "backend", kind: "status", meta: "02 BACKEND", title: "정확히 아는 경로와 추론 경로를 섞지 않는다",
    body: `<div class="grid three">
      <article class="card"><span class="eyebrow">회사 어댑터 일치</span><h3>ADAPTER_VERIFIED</h3><p>검증된 매핑만 사용<br>LLM 호출 없음</p></article>
      <article class="card"><span class="eyebrow">구조 불일치</span><h3>BLOCKED</h3><p>범용 경로로 우회하지 않음<br>사용자에게 입력 불가 표시</p></article>
      <article class="card accent"><span class="eyebrow">어댑터 없음</span><h3>LLM_SUGGESTED</h3><p>모든 필드를 비식별 추론<br>사용자 확인 전 실행 금지</p></article>
    </div>`,
    notes: note("백엔드 발표자", 70,
      "회사 전용 어댑터가 있고 페이지 fingerprint가 일치하면 그 어댑터가 매핑을 독점하고 LLM에 필드를 보내지 않습니다. 어댑터 대상 페이지의 구조가 바뀌었다면 범용 추론으로 조용히 우회하지 않고 차단합니다. 어댑터가 없는 사이트에서만 모든 입력 필드를 비식별 LLM 입력으로 만들어 추론합니다. 정확히 아는 경로, 모르는 경로, 위험해서 멈춰야 하는 경로를 결과 상태로 분리했습니다.",
      ["llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md", "llm-wiki/wiki/topics/application-form-analysis-api.md"]),
  },
  {
    section: "client", kind: "section", meta: "03 CLIENT",
    body: `<div class="section-number">03</div><h2 class="title">실행은 브라우저가<br><em>소유한다</em></h2><p class="subtitle">실행 시점의 상태를 아는 주체가 결정하고 검증한다</p>`,
    notes: note("클라이언트 발표자", 35,
      "백엔드가 계획을 반환해도 실제로 값을 바꾸는 시점의 상태는 브라우저만 압니다. 현재 입력값이 있는지, 반복 행이 몇 개인지, 사용자가 무엇을 승인했는지 모두 클라이언트에 있습니다. 그래서 실행 횟수와 안전 정책, 결과 확인까지 클라이언트가 소유합니다.",
      ["llm-wiki/wiki/topics/application-form-analysis-data-boundary.md"]),
  },
  {
    section: "client", kind: "", meta: "03 CLIENT", title: "화면마다 책임을 하나씩 나눴다",
    body: `<div class="surface">
      <div class="surface-list">
        <article><b>POPUP</b><p>준비 상태와 진입</p></article>
        <article><b>OPTIONS</b><p>프로필 등록과 관리</p></article>
        <article><b>SIDE PANEL</b><p>검색, 수동 복사와 자동 기입 시작</p></article>
        <article><b>OVERLAY</b><p>지원서 위에서 검토, 승인과 결과 확인</p></article>
      </div>
      <div class="image-pair"><img src="./assets/popup-readiness.svg" alt="팝업 준비 상태"><img src="./assets/profile-layout-a.svg" alt="프로필 관리 화면"></div>
    </div>`,
    notes: note("클라이언트 발표자", 75,
      "확장 프로그램 팝업은 좁고 포커스를 잃으면 닫히기 때문에 상세 작업을 담지 않습니다. 준비 상태와 사이드 패널, 프로필 관리로 가는 진입만 제공합니다. Options 화면은 프로필을 등록하고 관리하는 넓은 작업 공간입니다. 사이드 패널은 지원서 문맥을 유지하면서 검색과 수동 복사를 제공합니다. 자동 기입 검토는 실제 지원서 화면 위의 overlay에서 진행해 사용자가 바뀔 위치를 함께 볼 수 있게 했습니다.",
      ["llm-wiki/raw/issues/CF-41/documents/docs/adr/16-popup-side-panel-boundary.md", "llm-wiki/raw/issues/CF-41/documents/docs/design/35-extension-ui-design.md"]),
  },
  {
    section: "client", kind: "", meta: "03 CLIENT", title: "입력 결과가 아니라 입력 전 판단을 보여준다",
    body: `<div class="screenshot">
      <div class="image-frame"><img src="./assets/side-panel-review.svg" alt="입력 예정 항목 검토 화면"></div>
      <div class="legend">
        <article><b>입력 가능</b><p>명확한 연결, 기본 선택</p></article>
        <article><b>사람 확인 필요</b><p>선택지, 기존 값, 민감정보</p></article>
        <article><b>입력 불가</b><p>안전한 매핑이 없어 비활성</p></article>
      </div>
    </div>`,
    notes: note("클라이언트 발표자", 90,
      "검토 화면은 결과 목록이 아니라 사용자의 판단을 돕는 화면입니다. 입력 가능은 연결이 명확해 기본 선택됩니다. 선택지를 다시 봐야 하거나 기존 값과 충돌하거나 민감정보인 경우는 사람 확인 필요로 묶고 기본 선택하지 않습니다. 안전하게 입력할 수 없는 항목은 이유와 함께 비활성화합니다. 사용자는 예정 값과 상태를 보고 바꿀 항목만 선택한 뒤 최종 승인합니다. 상태는 색뿐 아니라 이름과 이유로도 전달합니다.",
      ["frontend/src/autofill-demo/model.ts", "llm-wiki/raw/issues/CF-41/documents/docs/design/35-extension-ui-design.md"]),
  },
  {
    section: "client", kind: "", meta: "03 CLIENT", title: "한 번 실행할 때마다 결과를 다시 확인한다",
    body: `${numberedFlow([
      ["", "로컬 목표와<br>현재 DOM 비교"],
      ["", "실행 횟수와<br>변경 항목 승인"],
      ["", "한 번 실행하고<br>효과 관측"],
      ["", "재탐색 실패 시<br>즉시 중단"],
    ])}<div class="boundary">효과가 확인되지 않으면 다음 행동으로 넘어가지 않는다</div>`,
    notes: note("클라이언트 발표자", 80,
      "자격증처럼 반복되는 항목은 필요한 행 수를 백엔드가 정하지 않습니다. 클라이언트가 로컬 프로필 항목 수와 현재 화면의 행 수를 비교해 필요한 추가 횟수를 계산하고 사용자에게 보여줍니다. 승인 뒤에도 여러 번을 한꺼번에 실행하지 않습니다. 한 번 추가하고 실제로 행이 늘었는지 확인한 뒤 같은 대상을 안전하게 다시 찾았을 때만 다음 실행을 합니다. 효과가 없거나 재탐색에 실패하면 즉시 멈추고 DOM을 다시 수집합니다.",
      ["llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md"]),
  },
  {
    section: "team", kind: "section", meta: "04 TEAM & AX",
    body: `<div class="section-number">04</div><h2 class="title">사람과 에이전트가<br><em>같은 상태를 읽게 한다</em></h2><p class="subtitle">좋은 프롬프트보다 좋은 작업 환경을 만든다</p>`,
    notes: note("소프트스킬 발표자", 35,
      "마지막은 네 명의 협업 방식과 AX입니다. 저희가 말하는 AX는 Agent Experience, 즉 에이전트가 팀의 맥락과 규칙, 현재 작업 상태를 잃지 않고 일할 수 있는 환경입니다. 한 번의 좋은 프롬프트에 기대기보다 사람과 에이전트가 같은 정본과 체크포인트를 읽도록 만들었습니다.",
      ["README.md", "harness/policies/workflow.md"]),
  },
  {
    section: "team", kind: "", meta: "04 TEAM & AX", title: "작업은 Issue 계약에서 시작해 사람의 머지로 끝난다",
    topics: ["human-approval"],
    body: `${numberedFlow([
      ["", "Project<br>Draft"], ["", "Issue<br>계약"], ["", "격리된<br>Worktree"],
      ["", "TDD와<br>검증"], ["", "Draft PR<br>사람 편집"], ["", "사람 리뷰<br>머지"],
    ], "workflow")}<div class="gates"><span>사람 승인</span><span>사람 승인</span><span>사람 승인</span></div>`,
    notes: note("소프트스킬 발표자", 85,
      "모든 작업은 사람이 만든 Project Draft에서 시작합니다. 에이전트가 Issue 계약 초안을 만들면 사람이 목표와 완료 기준을 GitHub에서 수정하고 승인합니다. 확정된 Issue 하나는 브랜치 하나와 PR 하나로 진행합니다. 격리된 worktree에서 실패 테스트부터 작성하고 전체 검증과 코드 리뷰를 통과한 뒤 Draft PR을 게시합니다. PR 본문도 사람이 수정하고, 최종 승인과 머지는 사람이 수행합니다. 자동화 속에서도 팀의 결정권이 사라지지 않도록 사람 체크포인트를 명시했습니다.",
      ["README.md", "harness/policies/workflow.md", "harness/policies/approval-matrix.md"]),
  },
  {
    section: "team", kind: "principles", meta: "04 TEAM & AX", title: "AX는 컨텍스트를 시스템으로 만드는 일이다",
    topics: ["agent-experience"],
    body: `<div class="grid two principles">
      <article class="card"><span class="eyebrow">ISSUE</span><h3>지금 할 일</h3><p>범위와 완료 기준의 정본</p></article>
      <article class="card"><span class="eyebrow">WIKI</span><h3>계속 쓸 지식</h3><p>제품 원칙, ADR과 기술 결정</p></article>
      <article class="card"><span class="eyebrow">CHECKPOINT</span><h3>현재 진행 상태</h3><p>중단과 재개에도 같은 단계 유지</p></article>
      <article class="card"><span class="eyebrow">HOOK & SKILL</span><h3>행동 가드</h3><p>위험 작업, 검증과 승인 순서 가드</p></article>
    </div>`,
    notes: note("소프트스킬 발표자", 90,
      "Issue는 이번 작업의 범위와 완료 기준을 보존합니다. Wiki는 제품 원칙, API 경계와 ADR처럼 다음 작업에서도 다시 써야 할 지식을 연결합니다. Worktree별 checkpoint는 계획, 구현, 지식 판정, 검증과 Draft PR 중 어디까지 왔는지 기록해 세션이 끊겨도 실제 상태와 대조해 재개합니다. Hook과 Skill은 위험 명령, 원격 쓰기, 승인 순서와 검증을 행동 단계에서 가드합니다. 이 구조 덕분에 프롬프트가 길어지는 대신 필요한 정본을 필요한 시점에 읽을 수 있습니다.",
      ["harness/policies/workflow.md", "llm-wiki/wiki/topics/llm-wiki-knowledge-model.md", "llm-wiki/wiki/topics/issue-development-workflow.md"]),
  },
  {
    section: "team", kind: "closing", meta: "2026 CAREER FORM",
    body: `<div class="mark">CONTROL</div><h2 class="title">자동 기입을 통제하는 제품,<br><em>자동화를 통제하는 팀</em></h2><p class="subtitle">반복 작업은 줄이고, 중요한 결정은 사람에게 남긴다</p>`,
    notes: note("소프트스킬 발표자", 65,
      "Career Form은 지원서 입력을 자동화하지만 제출까지 가져가지 않습니다. 브라우저, 백엔드와 LLM의 책임도 각자가 실제로 아는 정보에 맞춰 제한했습니다. 팀의 개발 자동화도 같은 원칙을 적용했습니다. 에이전트가 계획과 구현을 돕지만 Issue 계약, 지식 반영, PR 편집과 머지는 사람이 확인합니다. 저희가 만든 것은 자동 기입 기능과 함께 자동화를 어디까지 맡길지 통제하는 제품과 팀의 방식입니다.",
      ["llm-wiki/raw/issues/CF-41/documents/docs/PRODUCT_CONCEPT.md", "llm-wiki/raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md", "harness/policies/workflow.md"]),
  },
];

function clampSlideIndex(index, slideCount) {
  return Math.max(0, Math.min(slideCount - 1, index));
}

function setupDeck() {
const stage = document.querySelector(".stage");
stage.innerHTML = slides.map((slide, index) => `
  <section class="slide ${slide.section} ${slide.kind} ${index === 0 ? "active" : ""}" data-slide="${index + 1}">
    <div class="meta">${slide.meta}</div>
    ${slide.title ? `<h2 class="title">${slide.title}</h2>` : ""}
    ${slide.body}
    <aside class="notes">${renderNote(slide.notes)}</aside>
  </section>
`).join("");

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

function toggleNotes() {
  notesPanel.hidden = !notesPanel.hidden;
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
document.querySelector("[data-action='notes']").addEventListener("click", toggleNotes);
document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);

window.addEventListener("resize", scaleDeck);
document.addEventListener("fullscreenchange", scaleDeck);

const initial = Number.parseInt(location.hash.slice(1), 10);
scaleDeck();
show(Number.isFinite(initial) ? initial - 1 : 0);
}

if (typeof module !== "undefined") {
  module.exports = { clampSlideIndex, slides };
}

if (typeof document !== "undefined") {
  setupDeck();
}

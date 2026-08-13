# Page Analysis Technology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome 확장 프로그램에서 현재 지원서 페이지의 입력 구조를 읽기 전용으로 분석하고, 삼성·SK·CJ 실제 페이지 검증에 사용할 비식별 probe와 기술 결정 근거를 만든다.

**Architecture:** `analyzePage(document)`가 네이티브 DOM API로 현재 문서, 접근 가능한 iframe, 열린 Shadow DOM을 순회하고 모든 입력 후보를 `supported`, `review-required`, `unsupported`로 분류한다. Playwright는 비식별 fixture 회귀 검증에만 사용하고, Manifest V3 probe는 같은 분석기를 번들해 현재 탭에서 사용자가 직접 실행하며 비식별 집계만 화면에 표시한다.

**Tech Stack:** TypeScript, native DOM API, Playwright Test, esbuild, Chrome Extensions Manifest V3

## Global Constraints

- 작업 Issue는 #8 하나이며 브랜치는 `CF-8`, PR도 하나만 만든다.
- 실제 지원서 값 입력, 로그인 자동화, 페이지 순회, 임시저장, 다음 단계 이동, 미리보기와 제출을 구현하지 않는다.
- 실제 DOM 원문, 입력값, 레이블 원문, selector, 세션 정보, URL 경로와 쿼리를 코드·fixture·로그·보고서에 기록하지 않는다.
- probe는 `activeTab`과 `scripting` 권한만 사용하고 host permission과 외부 전송을 추가하지 않는다.
- 삼성·SK·CJ fixture는 구조적 회귀 자료이며 실제 사이트 검증을 대체하지 않는다.
- 실제 사이트에 접근하지 못한 기업은 `미검증`으로 기록하고 인수 조건을 완료 처리하지 않는다.
- 모든 동작은 실패 테스트를 먼저 실행하고 최소 구현으로 통과시킨다.
- 완료 전 `npm --prefix spikes/page-analysis ci`, typecheck, test, build와 `harness/scripts/verify`를 실행한다.

---

### Task 1: 네이티브 DOM 페이지 분석기

**Commit:** `feat: 지원서 페이지 구조 분석 PoC 추가`

**Files:**
- Create: `spikes/page-analysis/package.json`
- Create: `spikes/page-analysis/package-lock.json`
- Create: `spikes/page-analysis/tsconfig.json`
- Create: `spikes/page-analysis/playwright.config.ts`
- Create: `spikes/page-analysis/src/types.ts`
- Create: `spikes/page-analysis/src/analyze-page.ts`
- Create: `spikes/page-analysis/tests/fixtures/generic-controls.html`
- Create: `spikes/page-analysis/tests/analyze-page.spec.ts`

**Interfaces:**
- Produces: `analyzePage(root: Document): PageAnalysis`
- Produces: `ControlAnalysis` with only `element`, `control`, `status`, `reasons`, `required`, `frameDepth`, `shadowDepth`
- Produces: `PageAnalysis` with `controls` and structural `boundaries`; no page text, value, selector, name, id, URL fields

- [ ] **Step 1: Create the TypeScript test harness and generic fixture**

  Configure Playwright Test to serve fixture files through `page.setContent` and import source TypeScript directly. The generic fixture contains text, textarea, select, radio, checkbox, contenteditable, hidden, disabled, password, dynamically inserted control, same-origin iframe, cross-origin iframe marker, open Shadow DOM and inaccessible custom element without real personal data.

- [ ] **Step 2: Write failing behavior tests**

  Assert that supported controls are returned with structural types, hidden/disabled/password controls are `unsupported`, ambiguous custom controls are `review-required`, accessible iframe and open Shadow DOM controls carry positive depth, and no result object contains `value`, `text`, `label`, `selector`, `name`, `id`, `url`, `html` or `outerHTML` keys.

- [ ] **Step 3: Run the test and verify RED**

  Run: `npm --prefix spikes/page-analysis test -- analyze-page.spec.ts`

  Expected: FAIL because `src/analyze-page.ts` and its exported API do not exist.

- [ ] **Step 4: Implement the minimal analyzer**

  Traverse `input`, `textarea`, `select`, `[contenteditable]` and custom-element hosts. Classify known controls, detect hidden/disabled/sensitive states, recursively inspect accessible iframe documents and open shadow roots, and record inaccessible boundaries without reading or returning text or values.

- [ ] **Step 5: Verify GREEN and read-only behavior**

  Run: `npm --prefix spikes/page-analysis run typecheck`

  Run: `npm --prefix spikes/page-analysis test -- analyze-page.spec.ts`

  Expected: all analyzer tests PASS and serialized DOM before/after analysis is identical.

- [ ] **Step 6: Commit Task 1**

  ```bash
  git add docs/plans/8-page-analysis-technology.md spikes/page-analysis
  git commit -m "feat: 지원서 페이지 구조 분석 PoC 추가"
  ```

### Task 2: 기업 구조 fixture 회귀 검증

**Commit:** `feat: 기업별 지원서 구조 분석 보강`

**Files:**
- Create: `spikes/page-analysis/tests/fixtures/samsung-application.html`
- Create: `spikes/page-analysis/tests/fixtures/sk-application.html`
- Create: `spikes/page-analysis/tests/fixtures/cj-application.html`
- Create: `spikes/page-analysis/tests/company-fixtures.spec.ts`
- Modify: `spikes/page-analysis/src/analyze-page.ts`

**Interfaces:**
- Consumes: `analyzePage(root: Document): PageAnalysis`
- Produces: company-agnostic classification rules; no company-specific selectors or adapter branches

- [ ] **Step 1: Add anonymized structural fixtures and failing expectations**

  Reproduce only generic structural patterns: nested labels and repeated groups, dynamically revealed sections, custom combobox/listbox widgets, iframe boundaries and open Shadow DOM. Use neutral labels such as `Field A`; do not copy actual corporate DOM, label text or selectors.

- [ ] **Step 2: Run company fixture tests and verify RED**

  Run: `npm --prefix spikes/page-analysis test -- company-fixtures.spec.ts`

  Expected: FAIL for at least one nested, ARIA-backed or custom control classification missing from Task 1.

- [ ] **Step 3: Add minimal company-agnostic rules**

  Recognize native controls wrapped in nested structures and ARIA `combobox`, `listbox`, `textbox`, `checkbox` and `radio` roles as `review-required` when their write semantics are not safely known. Keep inaccessible and ambiguous widgets explicit instead of guessing a mapping.

- [ ] **Step 4: Verify all fixture tests**

  Run: `npm --prefix spikes/page-analysis test -- company-fixtures.spec.ts`

  Run: `npm --prefix spikes/page-analysis test`

  Expected: all generic and company structure tests PASS without company selector branches.

- [ ] **Step 5: Commit Task 2**

  ```bash
  git add spikes/page-analysis/src spikes/page-analysis/tests
  git commit -m "feat: 기업별 지원서 구조 분석 보강"
  ```

### Task 3: 현재 탭 읽기 전용 probe

**Commit:** `feat: 실제 지원서 읽기 전용 검증 도구 추가`

**Files:**
- Create: `spikes/page-analysis/src/create-redacted-report.ts`
- Create: `spikes/page-analysis/extension/manifest.json`
- Create: `spikes/page-analysis/extension/popup.html`
- Create: `spikes/page-analysis/extension/popup.ts`
- Create: `spikes/page-analysis/extension/probe.ts`
- Create: `spikes/page-analysis/scripts/build.mjs`
- Create: `spikes/page-analysis/tests/redacted-report.spec.ts`
- Create: `spikes/page-analysis/tests/probe-safety.spec.ts`
- Modify: `spikes/page-analysis/package.json`

**Interfaces:**
- Consumes: `analyzePage(document): PageAnalysis`
- Produces: `createRedactedReport(analysis, checkedAt): RedactedReport`
- Produces: a Chrome `activeTab` action that injects bundled `probe.js` into the user-selected current tab and renders only aggregate counts and structural reasons

- [ ] **Step 1: Write failing privacy and permission tests**

  Assert that the report recursively excludes forbidden keys, contains only timestamp, aggregate status/control/reason counts and boundary counts, and that the manifest has exactly `activeTab` and `scripting` permissions with no host permissions. Assert source and bundle contain no fetch, XHR, storage, form submission, click or navigation calls.

- [ ] **Step 2: Run probe tests and verify RED**

  Run: `npm --prefix spikes/page-analysis test -- redacted-report.spec.ts probe-safety.spec.ts`

  Expected: FAIL because the report and extension files do not exist.

- [ ] **Step 3: Implement report and extension probe**

  Aggregate analyzer output without copying control records. Bundle `probe.ts` and `popup.ts` with esbuild, copy static manifest and popup HTML to `dist/extension`, inject only `probe.js` into the active tab, and show JSON locally in the popup without storage or network APIs.

- [ ] **Step 4: Verify GREEN and build output**

  Run: `npm --prefix spikes/page-analysis run typecheck`

  Run: `npm --prefix spikes/page-analysis test -- redacted-report.spec.ts probe-safety.spec.ts`

  Run: `npm --prefix spikes/page-analysis run build`

  Expected: tests PASS and `dist/extension` is a loadable unpacked extension containing manifest, popup HTML/JS and probe JS.

- [ ] **Step 5: Commit Task 3**

  ```bash
  git add spikes/page-analysis
  git commit -m "feat: 실제 지원서 읽기 전용 검증 도구 추가"
  ```

### Task 4: 실제 기업 검증 기록과 기술 결정

**Commit:** `docs: 지원서 페이지 분석 기술 결정 기록`

**Files:**
- Create: `docs/research/8-company-page-validation.md`
- Create: `docs/research/8-page-analysis-technology-decision.md`

**Interfaces:**
- Consumes: probe aggregate report plus the user's manual comparison for Samsung, SK and CJ
- Produces: per-company verification state (`검증 완료`, `부분 검증`, `미검증`) and an ADR-style decision separating runtime and test technology

- [ ] **Step 1: Create the validation record with explicit unverified states**

  Record date, company, domain-level source, visible candidate count, classified count, supported/review-required/unsupported totals, boundaries, user-observed omissions and status. Do not record label text, values, DOM, selector, page path, query or session details.

- [ ] **Step 2: Build and hand off the unpacked probe for manual checks**

  Run: `npm --prefix spikes/page-analysis run build`

  The user loads `spikes/page-analysis/dist/extension`, logs in and navigates to one Samsung, SK and CJ application page, runs the probe, manually compares visible fields, and returns only redacted aggregate results. AI does not operate login, page navigation, save, preview or submit controls.

- [ ] **Step 3: Record actual results without substituting fixtures**

  Mark each company complete only when the user confirms every visible candidate is classified or supplies an omission count and reason. Keep inaccessible companies `미검증`; do not claim all acceptance criteria complete while any company remains unverified.

- [ ] **Step 4: Write the technology decision**

  Select native DOM API for runtime analysis, Playwright for deterministic regression, and reject Cheerio as the runtime choice because it cannot observe the live post-script DOM. Record inaccessible cross-origin iframe and closed Shadow DOM limitations and propose production integration and company adapters as separate future drafts.

- [ ] **Step 5: Run complete verification**

  Run: `npm --prefix spikes/page-analysis ci`

  Run: `npm --prefix spikes/page-analysis run typecheck`

  Run: `npm --prefix spikes/page-analysis test`

  Run: `npm --prefix spikes/page-analysis run build`

  Run: `python harness/scripts/verify` through the verified repository environment.

  Run: `git diff --check`

- [ ] **Step 6: Commit Task 4**

  ```bash
  git add docs/research
  git commit -m "docs: 지원서 페이지 분석 기술 결정 기록"
  ```

### Task 5: Review and Draft PR

**Files:**
- Review: all files in `origin/develop...HEAD`
- Create remotely: one Draft PR titled `[FE] 지원서 페이지 분석 기술 검증 및 결정`

- [ ] **Step 1: Run verification-before-completion against every acceptance criterion**

  Map each completed criterion to a test, build artifact or redacted manual record. List actual-site checks as incomplete if the user has not completed them.

- [ ] **Step 2: Run code-review for Standards and Issue spec**

  Review `origin/develop...HEAD`, fix critical and high-risk findings with failing regression tests first, and rerun the complete verification suite.

- [ ] **Step 3: Push and create one Draft PR**

  Push only `CF-8`, create a Draft PR to `develop` with the Issue title, fill all eight PR template sections, include exactly `Closes #8`, and clearly list outstanding real-company manual verification.

- [ ] **Step 4: Move workflow state to review**

  Replace `status:in-progress` with `status:review` and change Project Status from `In Progress` to `On Review`. Do not mark the PR ready, approve it or merge it.

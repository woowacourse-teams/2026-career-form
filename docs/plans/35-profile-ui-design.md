# 프로필 UI와 컬러 디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 핵심 10개 범주의 프로필을 로컬에서 자동 저장하고, options·popup·side panel에서 같은 데이터를 안전하게 관리·탐색하며 자동 기입 검토 흐름과 컬러 시안을 확인할 수 있게 한다.

**Architecture:** `PROFILE_FIELDS.md`를 옮긴 단일 필드 정의를 화면 렌더링과 검색의 정본으로 사용한다. 프로필 데이터는 `schemaVersion: 1` envelope와 저장 adapter 뒤에 두고, options의 A/B 레이아웃과 side panel은 같은 모델을 소비한다. 실제 DOM 분석과 기입 대신 독립된 비식별 상태 머신으로 검토 흐름을 표현한다. 색은 의미 기반 CSS custom property로 정의해 팔레트 교체가 컴포넌트 수정으로 번지지 않게 한다.

**Tech Stack:** WXT 0.21, Chrome Manifest V3, React 19, TypeScript 7, CSS Modules, Vitest 4, React Testing Library, SVG 1.1

## Global Constraints

- 실제 지원서 값, 계정 정보와 브라우저 세션 상태를 fixture·로그·문서에 남기지 않는다.
- 프로필 입력은 필수값과 엄격한 형식 검증을 두지 않고 원문 의미를 보존한다.
- 저장 경계에서 문자열 앞뒤 공백과 빈 값만 정리하고, 값이 모두 빈 반복 항목은 저장하지 않는다.
- 병역·보훈·장애·건강은 저장 여부를 별도로 묻지 않되 side panel에서 기본 가림하고 자동 기입 검토에서 기본 선택하지 않는다.
- 지원서 DOM 분석, 실제 값 기입, 저장·이동·미리보기·제출은 구현하지 않는다.
- 삭제는 사용자 확인 뒤 수행하고 저장 실패 시 현재 화면 값을 유지한다.
- 팔레트 값은 `global.css`의 의미 기반 토큰에만 선언한다.

---

### Task 1: 저장 결정과 프로필 도메인 계약

**Files:**
- Create: `docs/adr/35-local-profile-storage.md`
- Create: `frontend/src/profile/model.ts`
- Create: `frontend/src/profile/field-definitions.ts`
- Create: `frontend/src/profile/profile-repository.ts`
- Create: `frontend/src/profile/profile-repository.test.ts`
- Create: `frontend/src/storage/chrome-profile-storage.ts`
- Create: `frontend/src/storage/chrome-profile-storage.test.ts`

**Interfaces:**
- `ProfileEnvelope { schemaVersion: 1; profile: Profile }`
- `ProfileRepository.load(): Promise<Profile>`
- `ProfileRepository.save(profile: Profile): Promise<void>`
- 반복 항목은 안정적인 `id`, 학력·어학은 `sectionId`, 나머지 값은 필드 ID별 문자열을 가진다.

- [x] **Step 1: RED — 정리 및 저장 왕복 계약 작성**

  빈 값 제거, 앞뒤 공백 제거, 빈 반복 항목 제외, 안정적인 반복 ID 보존, 지원하지 않는 버전 거부와 저장 실패 전파 테스트를 먼저 작성한다.

- [x] **Step 2: RED 실행**

  ```bash
  npm --prefix frontend test -- src/profile/profile-repository.test.ts src/storage/chrome-profile-storage.test.ts
  ```

  Expected: 아직 도메인과 adapter가 없어 실패한다.

- [x] **Step 3: GREEN — 모델과 adapter 최소 구현**

  10개 범주를 단일/반복 구조로 정의하고 `chrome.storage.local` 호출을 adapter에 격리한다. 레이아웃 선호는 별도 key로 저장한다.

- [x] **Step 4: GREEN 실행 및 타입 확인**

  ```bash
  npm --prefix frontend test -- src/profile/profile-repository.test.ts src/storage/chrome-profile-storage.test.ts
  npm --prefix frontend run typecheck
  ```

- [x] **Step 5: ADR 작성**

  Issue에서 승인된 버전 envelope, 화면 독립 adapter, UI 선호 분리와 미지원 버전 처리 결정을 `docs/adr/35-local-profile-storage.md`에 기록한다.

---

### Task 2: options 프로필 관리와 자동 저장

**Files:**
- Create: `frontend/entrypoints/options/index.html`
- Create: `frontend/entrypoints/options/main.tsx`
- Create: `frontend/entrypoints/options/App.tsx`
- Create: `frontend/entrypoints/options/App.module.css`
- Create: `frontend/entrypoints/options/App.test.tsx`
- Create: `frontend/src/profile/components/ProfileForm.tsx`
- Create: `frontend/src/profile/components/ProfileForm.module.css`
- Create: `frontend/src/profile/hooks/use-profile-editor.ts`
- Create: `frontend/src/profile/hooks/use-profile-editor.test.tsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- `useProfileEditor(repository)`는 `profile`, `saveStatus`, 변경 함수, 반복 카드 추가·삭제와 `retrySave`를 제공한다.
- A형은 좌측 범주 탐색, B형은 범주별 accordion이며 같은 `ProfileForm`과 profile 상태를 사용한다.

- [x] **Step 1: RED — 자동 저장 상태 테스트**

  변경 뒤 `저장 중 → 저장됨`, 실패 시 `저장 실패`와 재시도, 입력값 유지 동작을 fake timer로 작성한다.

- [x] **Step 2: RED — 두 레이아웃과 반복 카드 테스트**

  10개 범주와 모든 필드, A/B 데이터 공유, 기본 A형, 선택 유지, 반복 항목 추가와 확인 뒤 삭제를 테스트한다.

- [x] **Step 3: RED 실행**

  ```bash
  npm --prefix frontend test -- src/profile/hooks/use-profile-editor.test.tsx entrypoints/options/App.test.tsx
  ```

- [x] **Step 4: GREEN — hook과 공통 폼 구현**

  자동 저장 debounce와 명시적 재시도를 구현한다. 테스트와 브라우저 양쪽에서 저장소를 주입할 수 있게 한다.

- [x] **Step 5: GREEN — options A/B 구현**

  접근 가능한 탭/버튼, label 연결, 삭제 확인 dialog, 로컬 저장 한계 안내와 상태 표시를 구현한다.

- [x] **Step 6: GREEN 실행**

  ```bash
  npm --prefix frontend test -- src/profile/hooks/use-profile-editor.test.tsx entrypoints/options/App.test.tsx
  npm --prefix frontend run typecheck
  ```

---

### Task 3: popup과 side panel 프로필 탐색

**Files:**
- Modify: `frontend/entrypoints/popup/App.tsx`
- Modify: `frontend/entrypoints/popup/App.module.css`
- Modify: `frontend/entrypoints/popup/App.test.tsx`
- Create: `frontend/entrypoints/sidepanel/index.html`
- Create: `frontend/entrypoints/sidepanel/main.tsx`
- Create: `frontend/entrypoints/sidepanel/App.tsx`
- Create: `frontend/entrypoints/sidepanel/App.module.css`
- Create: `frontend/entrypoints/sidepanel/App.test.tsx`
- Create: `frontend/src/profile/profile-search.ts`
- Create: `frontend/src/profile/profile-search.test.ts`
- Create: `frontend/src/extension/navigation.ts`
- Create: `frontend/src/extension/navigation.test.ts`
- Modify: `frontend/wxt.config.ts`

**Interfaces:**
- popup은 profile의 값이 있는 범주 수만 표시하고 실제 값은 렌더링하지 않는다.
- `openOptionsPage()`와 `openSidePanel()`은 Chrome API 경계를 감싼다.
- 검색 결과는 범주명·필드 표시명으로 좁히며 민감 범주는 펼친 필드만 복사할 수 있다.

- [x] **Step 1: RED — Chrome API와 준비 상태 테스트**

  options 탭 및 현재 창 side panel 호출, 값 미노출과 준비 범주 수를 테스트한다.

- [x] **Step 2: RED — 검색·가림·복사 테스트**

  범주명/필드명 검색, 결과 없음, 일반 값 복사, 민감 값 기본 가림과 개별 펼침 뒤 복사를 테스트한다.

- [x] **Step 3: RED 실행 후 GREEN 구현**

  ```bash
  npm --prefix frontend test -- src/profile/profile-search.test.ts src/extension/navigation.test.ts entrypoints/popup/App.test.tsx entrypoints/sidepanel/App.test.tsx
  ```

  공유 검색 변환과 API wrapper를 먼저 구현하고 popup·side panel을 연결한다.

- [x] **Step 4: Manifest 계약 반영**

  `storage`, `sidePanel` 권한과 `side_panel.default_path`, options 새 탭 설정을 WXT 구성에 반영한다.

---

### Task 4: 자동 기입 검토 목업 상태 머신

**Files:**
- Create: `frontend/src/autofill-demo/model.ts`
- Create: `frontend/src/autofill-demo/model.test.ts`
- Create: `frontend/src/autofill-demo/AutofillDemo.tsx`
- Create: `frontend/src/autofill-demo/AutofillDemo.module.css`
- Create: `frontend/src/autofill-demo/AutofillDemo.test.tsx`
- Modify: `frontend/entrypoints/sidepanel/App.tsx`

**Interfaces:**
- 상태: `analysis`, `review`, `confirmation`, `progress`, `result`, `exception`.
- 검토 항목: `available`, `needs-review`, `conflict`, `sensitive`, `unavailable`; available만 초기 선택한다.

- [x] **Step 1: RED — 기본 선택 정책 테스트**

  입력 가능만 선택되고 입력 불가는 토글할 수 없으며 나머지는 사용자 선택 전 해제됨을 테스트한다.

- [x] **Step 2: RED — 전체 상태 전이 테스트**

  분석→검토→승인→진행→결과와 네 예외 상태의 복귀 동작을 테스트한다.

- [x] **Step 3: GREEN — 비식별 목업 구현**

  실제 DOM이나 content script 없이 명시적인 버튼으로만 상태가 이동하는 컴포넌트를 구현한다.

- [x] **Step 4: 관련 테스트 실행**

  ```bash
  npm --prefix frontend test -- src/autofill-demo/model.test.ts src/autofill-demo/AutofillDemo.test.tsx entrypoints/sidepanel/App.test.tsx
  ```

---

### Task 5: 컬러 디자인 정본과 SVG 10개

**Files:**
- Create: `docs/design/35-extension-ui-design.md`
- Create: `docs/design/assets/35/popup-readiness.svg`
- Create: `docs/design/assets/35/side-panel-manual-copy.svg`
- Create: `docs/design/assets/35/side-panel-analysis.svg`
- Create: `docs/design/assets/35/side-panel-review.svg`
- Create: `docs/design/assets/35/side-panel-confirmation.svg`
- Create: `docs/design/assets/35/side-panel-progress.svg`
- Create: `docs/design/assets/35/side-panel-result.svg`
- Create: `docs/design/assets/35/side-panel-exceptions.svg`
- Create: `docs/design/assets/35/profile-layout-a.svg`
- Create: `docs/design/assets/35/profile-layout-b.svg`

**Interfaces:**
- 팔레트 원색 `#E3F2FD`, `#90CAF9`, `#2196F3`, `#0D47A1`은 surface·accent·action·action-strong 의미 토큰으로 사용한다.
- 중립색과 상태색은 대비와 상태 식별을 보완하며 색만으로 상태를 전달하지 않는다.

- [x] **Step 1: RED — SVG 개수와 XML 검사**

  ```bash
  .venv/bin/python -c 'from pathlib import Path; import xml.etree.ElementTree as ET; paths=list(Path("docs/design/assets/35").glob("*.svg")); assert len(paths) == 10, paths; [ET.parse(path) for path in paths]'
  ```

  Expected: 디렉터리가 없어 실패한다.

- [x] **Step 2: 디자인 문서와 SVG 작성**

  8개 기존 흐름 화면과 profile A/B를 동일 토큰, 비식별 문구와 실제 UI 구조로 작성하고 문서에 모두 연결한다.

- [x] **Step 3: GREEN — XML과 링크 검사**

  SVG 10개를 파싱하고 문서 상대 링크가 모두 존재하는지 확인한다.

---

### Task 6: 빌드·ZIP 계약과 최종 검증

**Files:**
- Modify: `frontend/scripts/assert-build.mjs`
- Modify: `frontend/scripts/assert-zip.mjs`
- Modify: `frontend/vitest.config.ts`
- Modify: `frontend/README.md`
- Modify: `docs/plans/35-profile-ui-design.md`

**Interfaces:**
- 빌드 manifest와 ZIP에 popup, options, side panel 및 필요한 권한이 존재해야 한다.
- 프런트 전체 커버리지는 statements·branches·functions·lines 모두 80% 이상이어야 한다.

- [x] **Step 1: 산출물 assertion 강화**

  options와 side panel 파일, Manifest V3 권한 및 기본 경로를 검사하도록 build/zip scripts를 확장한다.

- [x] **Step 2: 전체 프런트 검증**

  ```bash
  npm --prefix frontend run typecheck
  npm --prefix frontend run lint
  npm --prefix frontend run format:check
  npm --prefix frontend test
  npm --prefix frontend run coverage
  npm --prefix frontend run build
  npm --prefix frontend run zip
  ```

- [x] **Step 3: 저장소 검증**

  ```bash
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

- [x] **Step 4: 두 축 순차 리뷰**

  `develop...HEAD`와 작업 트리를 저장소 Standards, Issue #35 Spec 순서로 검토하고 Critical/Important 항목을 수정한 뒤 전체 검증을 다시 실행한다.

- [x] **Step 5: 계획 완료 반영과 논리적 커밋**

## 검증 결과

- 2026-08-20: 사용자 와이어프레임 피드백에 따라 사이드 패널을 범주별 아코디언 구조로 보정
- 프런트 테스트 39개 통과
- 커버리지: statements 91.35%, branches 83.16%, functions 87.41%, lines 92.54%
- typecheck, lint, format check, build, ZIP 산출물 검증 통과
- 저장소 하네스 검증 250개 통과, 하네스 커버리지 89%
- SVG 10개 XML·문서 링크 검사 및 대표 시안 렌더링 확인
- 저장소 Standards와 Issue #35 Spec 순차 리뷰 후 Critical/Important 미해결 항목 없음

  완료한 체크박스를 갱신하고 변경을 기능 단위 커밋으로 나눈다. Draft PR 본문에는 최신 자동 검증과 사람이 수행할 Chrome·GitHub 렌더링 검증만 기록한다.

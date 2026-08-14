# 확장 프로그램 와이어프레임 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome 확장 프로그램 팝업에서 브라우저 사이드 패널의 수동 복사와 자동 기입 결과 요약까지 이어지는 정적 와이어프레임을 만든다.

**Architecture:** `docs/design/16-extension-wireframes.md`를 화면과 상태 계약의 정본으로 사용한다. Mermaid는 흐름과 분기를 표현하고, `docs/design/assets/16/`의 회색조 SVG는 팝업과 사이드 패널 화면 배치를 표현한다. 팝업과 사이드 패널의 장기 책임 분리는 별도 ADR에 기록한다.

**Tech Stack:** Markdown, Mermaid, SVG 1.1, Python 3.13 `xml.etree.ElementTree`, 프로젝트 하네스

## Global Constraints

- 프로필 등록 및 관리 화면 자체는 그리지 않는다.
- 팝업은 페이지 분석이나 자동 기입을 수행하지 않는다.
- 사이드 패널은 수동 복사와 `자동 기입`에서 시작하는 분석, 검토, 승인, 기입과 결과 요약을 담당한다.
- 일반 `입력 가능` 항목만 기본 선택하고, 확인 필요, 충돌과 민감정보는 기본 선택하지 않으며 입력 불가는 선택할 수 없다.
- 실제 지원서 값, 계정 정보와 브라우저 세션 상태를 사용하지 않는다.
- 최종 UI 색상, 타이포그래피, 아이콘 스타일, 모션과 프론트엔드 구현을 만들지 않는다.
- 지원서 저장, 다음 단계 이동, 미리보기와 최종 제출을 자동화하지 않는다.
- 순수 산문 문구를 고정하는 테스트를 만들지 않는다. SVG의 기계 소비 경계만 XML 파싱으로 검사한다.

---

### Task 1: 흐름과 책임 정본

**Files:**
- Create: `docs/adr/16-popup-side-panel-boundary.md`
- Create: `docs/design/16-extension-wireframes.md`
- Modify: `docs/plans/16-extension-wireframes.md`

**Interfaces:**
- Consumes: Issue #16의 승인된 계약, `docs/PRODUCT_CONCEPT.md`, `docs/PROFILE_FIELDS.md`
- Produces: 화면 ID `P-01`, `S-01`부터 `S-06`, `E-01`부터 `E-04`와 Mermaid 흐름 계약

- [x] **Step 1: 승인된 ADR 전문 작성**

  `docs/adr/16-popup-side-panel-boundary.md`에 상태 `승인됨`, 날짜 `2026-08-14`, 관련 Issue `#16`, 세 대안과 팝업 및 사이드 패널 책임 경계를 기록한다.

- [x] **Step 2: Markdown 정본의 구조 작성**

  `docs/design/16-extension-wireframes.md`에 목적, 비범위, 원칙, 화면 목록, 상태별 선택 정책, 비식별 예시 규칙과 화면별 주석 구조를 작성한다.

- [x] **Step 3: Mermaid 흐름 작성**

  확장 프로그램 버튼 클릭부터 `P-01`을 거쳐 수동 복사 또는 자동 기입으로 분기하고, 분석, 검토, 승인, 기입과 결과 요약까지 이어지는 흐름을 작성한다. 지원하지 않는 페이지, 분석 실패, 검색 결과 없음과 일부 기입 실패 분기를 포함한다.

- [x] **Step 4: 산문 변경 검증**

  Run:

  ```bash
  git diff --check
  .venv/bin/python harness/scripts/verify.py
  ```

  Expected: 공백 오류가 없고 하네스 전체 검증이 통과한다. 승인된 산문을 특정 문구로 고정하는 테스트는 추가하지 않는다.

- [ ] **Step 5: 첫 번째 논리적 변경 커밋**

  ```bash
  git add docs/adr/16-popup-side-panel-boundary.md docs/design/16-extension-wireframes.md docs/plans/16-extension-wireframes.md
  git commit -m "docs: 확장 프로그램 와이어프레임 흐름 정의"
  ```

---

### Task 2: 팝업과 사이드 패널 정적 화면

**Files:**
- Create: `docs/design/assets/16/popup-readiness.svg`
- Create: `docs/design/assets/16/side-panel-manual-copy.svg`
- Create: `docs/design/assets/16/side-panel-analysis.svg`
- Create: `docs/design/assets/16/side-panel-review.svg`
- Create: `docs/design/assets/16/side-panel-confirmation.svg`
- Create: `docs/design/assets/16/side-panel-progress.svg`
- Create: `docs/design/assets/16/side-panel-result.svg`
- Create: `docs/design/assets/16/side-panel-exceptions.svg`
- Modify: `docs/design/16-extension-wireframes.md`
- Modify: `docs/plans/16-extension-wireframes.md`

**Interfaces:**
- Consumes: Task 1의 화면 ID, 상태 전이와 선택 정책
- Produces: 각 화면 ID와 일대일로 연결되는 회색조 SVG와 Markdown 삽입 링크

- [ ] **Step 1: SVG 경계 검사의 RED 확인**

  Run:

  ```bash
  .venv/bin/python -c 'from pathlib import Path; paths=list(Path("docs/design/assets/16").glob("*.svg")); assert paths, "Issue #16 SVG가 아직 없음"'
  ```

  Expected: `AssertionError: Issue #16 SVG가 아직 없음`으로 실패한다.

- [ ] **Step 2: 팝업과 수동 복사 화면 작성**

  `popup-readiness.svg`에는 서비스 설명, 실제 값을 노출하지 않는 프로필 준비 상태, `사이드 패널 열기`, `프로필 관리`와 자동 제출 금지 안내를 배치한다. `side-panel-manual-copy.svg`에는 검색, 범주 목록, 항목별 복사, 민감정보 가림과 `자동 기입`을 배치한다.

- [ ] **Step 3: 자동 기입 상태 화면 작성**

  분석 중, 검토, 최종 승인, 기입 중과 결과 요약을 각각 독립 SVG로 작성한다. 검토 화면은 일반 입력 가능만 선택하고 확인 필요, 충돌과 민감정보는 선택 해제하며 입력 불가는 비활성화한다. 결과 화면은 성공, 실패와 직접 입력 필요를 구분한다.

- [ ] **Step 4: 예외 상태 화면 작성**

  `side-panel-exceptions.svg`에 지원하지 않는 페이지, 분석 실패, 검색 결과 없음과 일부 기입 실패 상태를 한 보드에 구분해 작성한다. 수동 복사 경로는 지원하지 않는 페이지에서도 유지한다.

- [ ] **Step 5: SVG를 정본 문서에 연결**

  각 SVG를 해당 화면 설명 아래 상대 경로로 삽입하고 목적, 표시 정보, 주요 행동, 다음 상태와 예외 상태를 적는다.

- [ ] **Step 6: SVG 경계 검사의 GREEN 확인**

  Run:

  ```bash
  .venv/bin/python -c 'from pathlib import Path; import xml.etree.ElementTree as ET; paths=list(Path("docs/design/assets/16").glob("*.svg")); assert len(paths) == 8, paths; [ET.parse(path) for path in paths]'
  ```

  Expected: 출력 없이 exit 0.

- [ ] **Step 7: 두 번째 논리적 변경 커밋**

  ```bash
  git add docs/design/16-extension-wireframes.md docs/design/assets/16 docs/plans/16-extension-wireframes.md
  git commit -m "docs: 팝업과 사이드 패널 정적 와이어프레임 추가"
  ```

---

### Task 3: 렌더링과 계약 검증

**Files:**
- Verify: `docs/design/16-extension-wireframes.md`
- Verify: `docs/design/assets/16/*.svg`
- Modify: `docs/plans/16-extension-wireframes.md`

**Interfaces:**
- Consumes: Task 1과 Task 2의 Markdown, Mermaid와 SVG
- Produces: 인수 조건별 검증 근거와 Draft PR에 기록할 자동 및 수동 검증 결과

- [ ] **Step 1: 모든 SVG를 PNG로 렌더링**

  macOS Quick Look 또는 설치된 SVG 렌더러를 사용해 각 SVG의 PNG 미리보기를 OS 임시 디렉토리에 만든다. 저장소에는 렌더링 결과를 추가하지 않는다.

- [ ] **Step 2: 화면별 시각 검토**

  각 PNG를 열어 잘림, 겹침, 읽을 수 없는 텍스트, 잘못된 기본 선택, 실제 개인정보와 최종 UI 디자인 표현이 없는지 확인한다. 발견한 문제는 SVG와 Markdown을 함께 수정한다.

- [ ] **Step 3: 인수 조건 추적 검토**

  팝업에서 사이드 패널로 이동하고, 수동 복사와 자동 기입 두 경로가 결과 요약까지 이어지는지 Mermaid와 화면 ID를 대조한다. 지원하지 않는 페이지, 분석 실패, 검색 결과 없음과 일부 기입 실패를 각각 확인한다.

- [ ] **Step 4: 최종 자동 검증**

  Run:

  ```bash
  .venv/bin/python -c 'from pathlib import Path; import xml.etree.ElementTree as ET; paths=list(Path("docs/design/assets/16").glob("*.svg")); assert len(paths) == 8, paths; [ET.parse(path) for path in paths]'
  git diff --check
  .venv/bin/python harness/scripts/verify.py
  ```

  Expected: SVG 8개가 유효한 XML이고 공백 오류가 없으며 하네스 전체 검증이 통과한다.

- [ ] **Step 5: 계획 완료 상태 반영**

  이 계획의 완료한 체크박스를 `[x]`로 바꾸고 자동 검증 결과와 남은 GitHub Mermaid 수동 확인을 Draft PR 본문에 기록한다.

- [ ] **Step 6: 계획 완료 기록 커밋**

  ```bash
  git add docs/plans/16-extension-wireframes.md docs/design/16-extension-wireframes.md docs/design/assets/16
  git commit -m "docs: 와이어프레임 검증 결과 반영"
  ```

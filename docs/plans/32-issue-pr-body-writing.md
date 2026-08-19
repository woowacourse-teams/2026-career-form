# Issue와 PR 본문 작성 기준 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue 계약 정보는 보존하고, PR은 여섯 리뷰 섹션과 접힌 검증 기록으로 간결하게 작성한다.

**Architecture:** PR 템플릿의 HTML 주석형 답변 위치를 렌더러가 실제 응답으로 치환하면서 안내 주석과 `<details>` 구조를 보존한다. PR 계약 검증기는 여섯 개의 공개 섹션과 접힌 자동 및 수동 검증 기록을 각각 검사한다. Issue와 PR의 의미 기반 작성 원칙은 템플릿 안내, 정책과 워크플로우 스킬에 한 번씩만 기록한다.

**Tech Stack:** Python 3.13, `unittest`, GitHub Issue Form YAML, Markdown과 HTML `<details>`

## Global Constraints

- Issue #32의 필수 계약 섹션과 인수 조건을 바꾸지 않는다.
- 글자 수, 문장 수, 줄 수와 bullet 수를 제한하거나 산문 문구를 검사하지 않는다.
- 실제 변경 대상, 범위 경계, 인수 조건, 자동 및 수동 검증, 위험 작업과 사람 담당 경계를 Issue에서 보존한다.
- PR의 최신 자동 및 수동 검증 상태는 댓글이 아니라 본문 하단의 기본으로 접힌 `검증 기록`에 남긴다.
- 순수 산문 변경에는 문구 검사를 추가하지 않고 리뷰와 수동 비교를 사용한다.

---

### Task 1: PR 템플릿의 구조 보존 렌더링

**Files:**
- Modify: `harness/lib/template_body.py`
- Test: `harness/tests/test_template_body.py`

**Interfaces:**
- Consumes: PR 템플릿의 `<!-- cf-answer: 필드명 -->` 표식과 `Mapping[str, str]` 응답
- Produces: 안내 HTML 주석과 `<details>` 구조를 유지하고 답변 표식만 응답으로 바꾼 Markdown 본문

- [x] **Step 1: 구조와 안내를 보존하는 실패 테스트 작성**

```python
def test_pr_body_replaces_answer_markers_and_preserves_template_structure(self) -> None:
    template = """## 무엇이 바뀌었나요?
<!-- 결과를 작성합니다. -->
<!-- cf-answer: 무엇이 바뀌었나요? -->

<details>
<summary>검증 기록</summary>

### 자동 검증
<!-- cf-answer: 자동 검증 -->
</details>

Closes #
"""

    body = render_pr_template(
        template,
        {
            "무엇이 바뀌었나요?": "- 새 동작",
            "자동 검증": "- 전체 검증 통과",
        },
        issue_number=32,
    )

    self.assertIn("<!-- 결과를 작성합니다. -->", body)
    self.assertIn("<details>", body)
    self.assertIn("- 전체 검증 통과", body)
    self.assertNotIn("cf-answer:", body)
    self.assertIn("Closes #32", body)
```

- [x] **Step 2: 렌더러 테스트가 현재 구현에서 실패하는지 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_template_body.TemplateBodyTest.test_pr_body_replaces_answer_markers_and_preserves_template_structure -v`

Expected: 답변 표식을 입력 필드로 읽지 못하거나 템플릿의 HTML 구조를 보존하지 못해 FAIL

- [x] **Step 3: 답변 표식 기반 치환 구현**

```python
ANSWER_PATTERN = re.compile(
    r"<!--\s*cf-answer:\s*(?P<name>[^\n]+?)\s*-->",
)


def render_pr_template(
    template: str,
    answers: Mapping[str, str],
    *,
    issue_number: int,
) -> str:
    names = tuple(match.group("name").strip() for match in ANSWER_PATTERN.finditer(template))
    missing = tuple(name for name in names if not answers.get(name, "").strip())
    unknown = tuple(sorted(set(answers) - set(names)))
    if missing or unknown:
        raise ValueError(_answer_error(missing, unknown))
    rendered = ANSWER_PATTERN.sub(
        lambda match: answers[match.group("name").strip()].strip(),
        template,
    )
    return CLOSE_PATTERN.sub(f"Closes #{issue_number}", rendered, count=1)
```

중복 표식은 같은 필드를 두 번 출력할 수 있으므로 거부한다. `Closes #` 검증과 양의 Issue 번호 검증은 유지한다.

- [x] **Step 4: 렌더러 정상, 누락, 미등록 응답 테스트 통과 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_template_body -v`

Expected: PASS

- [x] **Step 5: 렌더러 변경 커밋**

```bash
git add harness/lib/template_body.py harness/tests/test_template_body.py docs/plans/32-issue-pr-body-writing.md
git commit -m "feat: PR 템플릿 구조 보존 렌더링"
```

---

### Task 2: 여섯 리뷰 섹션과 접힌 검증 기록 계약

**Files:**
- Modify: `.github/pull_request_template.md`
- Modify: `harness/lib/markdown_sections.py`
- Modify: `harness/lib/pr_contract.py`
- Modify: `harness/tests/pr_fixtures.py`
- Test: `harness/tests/test_pr_contract.py`
- Test: `harness/tests/test_template_body.py`
- Test: `harness/tests/test_repository_contract.py`

**Interfaces:**
- Consumes: 여섯 `##` 리뷰 섹션과 `<details><summary>검증 기록</summary>` 안의 `### 자동 검증`, `### 수동 검증`
- Produces: 공개 리뷰 정보와 운영 검증 기록을 분리해 검증하는 `ValidationResult`

- [x] **Step 1: 새 PR 본문 fixture와 실패 계약 테스트 작성**

```python
VALID_PR_BODY = """## 무엇이 바뀌었나요?
- 자동 입력 흐름이 추가됐다

## 왜 바꿨나요?
- 반복 입력을 줄인다

## 어떻게 바꿨나요?
- 회사별 Adapter를 사용한다

## 기존 기능에 미치는 영향
- 기존 Adapter 동작을 유지한다

## 검토한 대안과 선택 이유
- 범용 매처보다 전용 Adapter가 안전하다

## 리뷰 포인트
- 필드 매핑을 확인한다

<details>
<summary>검증 기록</summary>

### 자동 검증
- 전체 검증 통과

### 수동 검증
- 실제 제출은 사람이 확인한다

</details>

Closes #123
"""
```

다음 동작을 각각 검증한다.

- 새 본문은 유효하다.
- 여섯 리뷰 섹션 중 하나가 없거나 비어 있으면 거부한다.
- `검증 기록`, `자동 검증`, `수동 검증` 중 하나가 없거나 비어 있으면 거부한다.
- HTML 주석과 fenced code 안의 가짜 검증 기록은 실제 내용으로 인정하지 않는다.

- [x] **Step 2: 새 계약 테스트가 기존 여덟 섹션 검증에서 실패하는지 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_pr_contract -v`

Expected: 기존 섹션 누락 오류와 새 검증 기록 미검사로 FAIL

- [x] **Step 3: Markdown 3단계 소제목 추출과 PR 계약 구현**

```python
def extract_subsections(body: str) -> dict[str, str]:
    return _extract_headings(body, level=3)


REQUIRED_SECTIONS = (
    "무엇이 바뀌었나요?",
    "왜 바꿨나요?",
    "어떻게 바꿨나요?",
    "기존 기능에 미치는 영향",
    "검토한 대안과 선택 이유",
    "리뷰 포인트",
)
REQUIRED_VERIFICATION_SECTIONS = ("자동 검증", "수동 검증")
```

`_markdown_prose()`로 주석과 코드 블록을 제거한 뒤 `검증 기록` details 하나를 찾고, 그 내부의 3단계 소제목을 검증한다. 같은 이름의 details가 중복되면 거부한다.

- [x] **Step 4: 실제 PR 템플릿을 새 구조로 변경**

```markdown
## 무엇이 바뀌었나요?
<!-- 리뷰어가 알아야 할 동작과 결과의 변화를 작성합니다. -->
<!-- cf-answer: 무엇이 바뀌었나요? -->

## 왜 바꿨나요?
<!-- 이 변경이 필요했던 문제와 이유를 작성합니다. -->
<!-- cf-answer: 왜 바꿨나요? -->

## 어떻게 바꿨나요?
<!-- 구현 방식과 중요한 선택을 작성하고 변경 결과를 반복하지 않습니다. -->
<!-- cf-answer: 어떻게 바꿨나요? -->
```

나머지 세 리뷰 섹션도 같은 표식 구조를 사용한다. 본문 하단에는 `검증 기록` details와 `자동 검증`, `수동 검증` 답변 표식을 둔다.

- [x] **Step 5: 통합 렌더링과 독립 계약 테스트 갱신**

`harness/tests/test_template_body.py`는 여섯 리뷰 응답과 두 검증 응답으로 실제 템플릿을 렌더링하고 `validate_pr()`가 통과하는지 확인한다. `harness/tests/test_repository_contract.py`는 템플릿이 검증기에 필요한 구조를 제공하는지 소비 결과로 확인한다.

- [x] **Step 6: PR 계약 관련 테스트 통과 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_pr_contract harness.tests.test_template_body harness.tests.test_repository_contract -v`

Expected: PASS

- [x] **Step 7: PR 계약 변경 커밋**

```bash
git add .github/pull_request_template.md harness/lib/markdown_sections.py harness/lib/pr_contract.py harness/tests/pr_fixtures.py harness/tests/test_pr_contract.py harness/tests/test_template_body.py harness/tests/test_repository_contract.py
git commit -m "feat: PR 본문 리뷰와 검증 구조 분리"
```

---

### Task 3: Issue와 PR 의미 기반 작성 원칙

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/feature.yml`
- Modify: `.github/ISSUE_TEMPLATE/bug.yml`
- Modify: `.github/ISSUE_TEMPLATE/technical-task.yml`
- Modify: `harness/policies/issue-contract.md`
- Modify: `.agents/skills/cf-project-issue-planning/SKILL.md`
- Modify: `.agents/skills/cf-issue-workflow/SKILL.md`
- Modify: `docs/conventions/common.md`
- Modify: `harness/README.md`
- Modify: `docs/design/issue-based-ai-development-harness.md`

**Interfaces:**
- Consumes: `status:planning` Issue 초안과 구현 완료 diff
- Produces: 계약 정보는 보존하고 판단에 쓰이지 않는 반복은 제거한 Issue와 PR 초안

- [ ] **Step 1: Issue Form의 입력 안내를 섹션 역할에 맞게 수정**

세 Issue Form의 설명은 다음 의미를 각 작업 유형에 맞게 표현한다.

- 배경은 현재 문제와 작업이 필요한 맥락만 받는다.
- 목표는 완료 후 달라지는 상태만 받는다.
- 포함 범위는 실제 변경 대상을, 제외 범위는 포함으로 오해할 항목만 받는다.
- 인수 조건은 관찰 가능한 결과를, 자동 검증은 실행할 명령을 받는다.
- 수동 검증은 자동화할 수 없는 확인과 사람 담당 작업만 받는다.
- 위험 작업은 실제 위험과 금지 작업의 경계만 받는다.
- 참고 문서는 작업 판단에 사용한 정본만 받는다.

- [ ] **Step 2: Issue 계약 정책에 보호 정보와 편집 기준 반영**

```markdown
## 작성 원칙

실제 변경 대상, 범위 경계, 인수 조건, 자동 및 수동 검증, 위험 작업과 사람 담당 경계는 생략하지 않는다. 정보는 역할에 맞는 섹션 한 곳에만 작성한다. 문장을 제거해도 계약 판단이 달라지지 않으면 제거하며 글자 수나 항목 수로 분량을 제한하지 않는다.
```

- [ ] **Step 3: 기획 및 구현 스킬의 생성 규칙 갱신**

`cf-project-issue-planning`에는 Issue 보호 정보와 섹션별 역할을 반영한다. `cf-issue-workflow`에는 다음 PR 작성 순서를 반영한다.

1. 여섯 리뷰 섹션과 접힌 자동 및 수동 검증 응답을 준비한다.
2. 정보는 리뷰 판단이 달라지는 경우에만 한 섹션에 작성한다.
3. Issue와 ADR의 배경 및 결정 전문을 반복하지 않는다.
4. 사용자 수동 편집과 재개 검증 흐름은 유지한다.

- [ ] **Step 4: 공용 컨벤션과 하네스 안내 동기화**

`docs/conventions/common.md`, `harness/README.md`, `docs/design/issue-based-ai-development-harness.md`에서 PR 본문의 역할과 접힌 검증 기록을 설명한다. 순수 산문 문구 검사는 추가하지 않는다.

- [ ] **Step 5: YAML과 스킬 구조 검증**

Run: `.venv/bin/python -m unittest harness.tests.test_repository_contract -v`

Run: `.venv/bin/python harness/scripts/validate-skills.py`

Expected: PASS

- [ ] **Step 6: 문서 변경 커밋**

```bash
git add .github/ISSUE_TEMPLATE harness/policies/issue-contract.md .agents/skills/cf-project-issue-planning/SKILL.md .agents/skills/cf-issue-workflow/SKILL.md docs/conventions/common.md harness/README.md docs/design/issue-based-ai-development-harness.md
git commit -m "docs: Issue와 PR 본문 작성 원칙 정비"
```

---

### Task 4: 전체 검증과 Issue 계약 대조

**Files:**
- Modify: `docs/plans/32-issue-pr-body-writing.md`

**Interfaces:**
- Consumes: `origin/develop...HEAD` diff와 Issue #32 인수 조건
- Produces: 자동 검증 결과, 수동 검증 상태와 두 축 리뷰 결과

- [ ] **Step 1: 관련 테스트 실행**

Run: `.venv/bin/python -m unittest harness.tests.test_issue_contract harness.tests.test_pr_contract harness.tests.test_template_body harness.tests.test_repository_contract -v`

Expected: PASS

- [ ] **Step 2: 전체 검증 실행**

Run: `.venv/bin/python harness/scripts/verify.py`

Expected: 전체 테스트 PASS, 커버리지 80% 이상

- [ ] **Step 3: diff 형식 검증**

Run: `git diff --check`

Expected: 출력 없음

- [ ] **Step 4: Issue #29와 PR #31 수동 비교**

새 원칙으로 작성한 Issue와 PR 초안에서 보호 대상 계약 정보는 남고 같은 사실의 반복과 리뷰 판단에 쓰이지 않는 설명은 제거됐는지 확인한다. GitHub 렌더링에서는 여섯 리뷰 섹션이 보이고 안내 주석은 숨겨지며 `검증 기록`은 접힌 상태인지 확인한다.

- [ ] **Step 5: 두 축 코드 리뷰**

`origin/develop...HEAD`를 저장소 Standards와 Issue #32 Spec으로 나눠 검토한다. 치명적 문제와 높은 위험 문제를 수정한 뒤 전체 검증을 다시 실행한다.

- [ ] **Step 6: 검증 결과 반영 커밋**

```bash
git add docs/plans/32-issue-pr-body-writing.md
git commit -m "docs: Issue 32 검증 결과 반영"
```

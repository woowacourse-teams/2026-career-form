---
name: cf-code-understanding
description: >-
  검증이 끝난 Career Form 변경을 실제 최종 코드와 테스트로 설명하고, 참고 파일과 단계적 힌트를 포함한 가벼운 질문으로
  사람의 이해를 확인한다. 사용자가 "변경 사항을 설명해줘", "코드 이해 확인하자", "퀴즈로 점검해줘"처럼 최종 변경의 이해를
  확인하려 할 때, 또는 cf-issue-workflow의 verification 다음 단계에서 사용한다. 구현 전 설계 토론이나 점수형 시험에는 사용하지 않는다.
metadata:
  portable: true
  external_dependencies: []
---

# Code Understanding

검증된 현재 HEAD를 기준으로 사람이 무엇이 바뀌었고 어떤 경로로 동작하는지 확인할 수 있게 한다. 결과는 점수나 평가가 아니라 Draft PR 전의 짧은 확인 기록이다.

## 시작 조건

1. `harness/scripts/plan-issue-delivery.py`의 action이 `resume_understanding`인지 확인한다.
2. 현재 worktree가 깨끗하고 verification 완료 HEAD가 현재 HEAD와 같은지 확인한다. 다르면 `resume verification`부터 다시 진행한다.
3. `manage-workflow-checkpoint.py --cwd . resume understanding`으로 write-ahead 상태를 남긴다.

## 보고서

1. 최종 diff, 바뀐 코드의 호출 경로, 관련 테스트와 검증 결과를 읽는다. 계획이나 추측으로 대체하지 않는다.
2. `git rev-parse --git-path cf-workflow/understanding.md` 경로에 UTF-8 보고서를 기록한다. 보고서에는 아래 다섯 항목을 둔다.
   - 변경 전과 변경 후
   - 대표 실행 흐름
   - 핵심 파일과 클래스, 함수 또는 테스트 이름
   - 실행한 테스트와 전체 검증
   - 회귀가 나면 먼저 확인할 지점
3. 사람이 읽을 수 있는 용어로 짧게 작성하되, 기호와 파일 경로는 실제 최종 코드와 일치시킨다.

## 이해 확인

1. 한 컴포넌트의 국소 변경이면 질문 하나를 낸다. 여러 컴포넌트, 분기, 상태 전환을 건드린 변경이면 최대 세 질문을 한 번에 하나씩 낸다.
2. 각 질문에는 참고 파일을 한 개에서 세 개 제공하고, 파일마다 관련 클래스, 함수, 테스트 또는 줄 근처를 함께 적는다.
3. 답을 바로 요구하지 않는다. 요청하거나 막히면 파일, 위치, 흐름, 함께 읽을 부분 순서로 힌트를 하나씩 제공한다.
4. 정답률, 점수, 통과와 실패, 강제 재시도를 사용하지 않는다. 중요한 오해만 최종 코드로 설명한 뒤 한 번 더 확인할 수 있다.
5. 사람은 답하거나 `skip`을 말할 수 있다. 답변 전문은 checkpoint, 보고서, Issue, PR에 기록하지 않는다.

## 완료 기록

1. 사람의 답변 또는 skip 뒤 보고서 파일의 SHA-256 digest를 계산한다.
2. `complete understanding` evidence에는 `outcome=Answered` 또는 `outcome=Skipped`, `report_path=<보고서 경로>`, `report_digest=<64자 digest>`만 기록한다.
3. 코드 HEAD가 바뀌거나 worktree가 dirty해지거나 보고서 digest가 달라지면 understanding 완료 근거를 재사용하지 않는다. verification부터 다시 실행하고 새 보고서와 확인을 만든다.
4. `create_draft_pr` action이 나올 때까지 Draft PR을 만들지 않는다.

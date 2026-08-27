---
name: cf-karpathy-llm-wiki
description: 사용자가 LLM Wiki에 정본 문서를 수집, 갱신하거나 구조를 점검해 달라고 요청할 때 비식별 raw 스냅샷과 근거 링크를 관리한다. 저장된 Wiki를 근거로 질문에 답하는 요청에는 사용하지 않는다.
---

# LLM Wiki

이 스킬은 Issue별 불변 raw bundle과 여러 Issue의 같은 주제를 연결하는 topic Wiki를
수집, 갱신, 점검한다. 저장된 지식에 대한 읽기 전용 답변은
`cf-llm-wiki-query`가 담당한다.

## 우선순위와 수집

1. 현재 Issue 본문은 작업 범위와 완료 기준의 정본이고 위치 의존 하네스 정책은 해당 파일의 현재본이 우선한다.
2. topic Wiki는 현재 상태, 특정 시점 상태, 변경 이유와 충돌 여부를 찾는 진입점이며 답변에는 연결된 raw 근거를 사용한다.
3. 작업 중 발견한 자료는 worktree 체크포인트의 후보 전체 또는 `No reusable knowledge`로 모아 raw 작성 직전에 사람에게 한 번만 확인받는다.
4. 승인 digest가 현재 후보 digest와 다르면 raw를 쓰지 않고 다시 확인받는다.
5. 대화 전문, 실제 지원 정보, 계정, 세션, 시크릿은 raw와 wiki 어느 쪽에도 저장하지 않는다.

## 파일 규칙

- 신규 raw는 `llm-wiki/raw/issues/CF-<번호>/` 하나에 `manifest.md`, `documents/`, 필요한 `assets/`로 묶는다. manifest는 Issue, Collected, Approval-Digest와 topic별 Payload, Supersedes를 연결한다.
- 기준 브랜치에 존재하는 raw는 수정, 삭제, rename하지 않는다. 현재 브랜치에서 새로 추가한 raw 후보는 병합 전까지 승인된 내용에 맞게 갱신할 수 있다.
- topic 문서는 `llm-wiki/wiki/topics/<topic-id>.md`에 Topic, Status, Current, History, Updated를 기록한다. 대체 관계가 없는 최신 raw가 둘 이상이면 `Disputed`로 두고 임의 선택하지 않는다.
- 기존 세 raw와 기존 Wiki 문서는 legacy 형식과 경로를 유지한다.
- `wiki/index.md`는 모든 Wiki 문서를 링크하고 `wiki/log.md`는 수집, 점검 기록만 추가한다.

## 검증

`.venv/bin/python harness/scripts/validate-llm-wiki.py --base-ref origin/develop`로 manifest, payload, 내부 자산, topic 상태, 대체 순환, 양방향 색인과 raw 불변성을 검사한다. 전체 변경은 `.venv/bin/python harness/scripts/verify.py`로 확인한다.

## Upstream

이 스킬은 `Astro-Han/karpathy-llm-wiki`의 MIT 라이선스 워크플로를 저장소 규칙에 맞게 이름과 안전 경계를 조정한 스냅샷이다. 정확한 고정 원본은 `UPSTREAM.json`을 따른다.

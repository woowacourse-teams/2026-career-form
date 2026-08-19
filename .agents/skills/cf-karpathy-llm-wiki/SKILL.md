---
name: cf-karpathy-llm-wiki
description: 사용자가 LLM Wiki에 정본 문서를 수집·질의·점검해 달라고 요청할 때 비식별 raw 스냅샷과 근거 링크를 관리한다.
---

# LLM Wiki

이 스킬은 `llm-wiki/raw/`의 변경하지 않는 비식별 원본 스냅샷과
`llm-wiki/wiki/`의 읽기용 요약을 함께 관리한다.

## 우선순위와 수집

1. `docs/`의 제품 기준, ADR, Issue와 하네스 정책은 Wiki보다 우선한다.
2. 사용자가 명시적으로 요청한 자료만 즉시 raw에 수집한다.
3. 에이전트가 작업 중 발견한 자료는 후보와 이유를 먼저 제시하고 사람 승인 뒤 수집한다.
4. 대화 전문, 실제 지원 정보, 계정·세션·시크릿은 raw와 wiki 어느 쪽에도 저장하지 않는다.

## 파일 규칙

- raw 파일은 `# 제목`, `Source`, `Collected`, `Published` 메타데이터와 원문 또는 비식별 발췌를 가진다. 기존 raw 파일을 고치지 않고 새 스냅샷을 추가한다.
- wiki 문서는 `Sources`, `Raw`, `Updated` 메타데이터를 가지고 raw 파일을 상대 링크로 연결한다.
- `wiki/index.md`는 모든 wiki 문서를 링크하고, `wiki/log.md`는 수집·점검 기록만 추가한다.
- 정본과 상충하거나 오래된 Wiki 설명은 정본을 우선해 `Status: Disputed` 또는 `Status: Outdated`로 표시한다.

## 검증

`python3 harness/scripts/validate-llm-wiki.py`로 경로, 메타데이터, raw 근거 링크와 색인을 검사한다. 전체 변경은 `python3 harness/scripts/verify.py`로 확인한다.

## Upstream

이 스킬은 `Astro-Han/karpathy-llm-wiki`의 MIT 라이선스 워크플로를 저장소 규칙에 맞게 이름과 안전 경계를 조정한 스냅샷이다. 정확한 고정 원본은 `UPSTREAM.json`을 따른다.

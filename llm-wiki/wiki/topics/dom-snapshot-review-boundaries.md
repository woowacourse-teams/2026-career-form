# 지원서 DOM fixture의 표시 텍스트 검토와 재현 경계

> Topic: dom-snapshot-review-boundaries
> Status: Current
> Current: [CF-252 DOM fixture 검토와 재현 경계](../../raw/issues/CF-252/documents/dom-snapshot-review-boundaries.md)
> History: [CF-252 DOM fixture 검토와 재현 경계](../../raw/issues/CF-252/documents/dom-snapshot-review-boundaries.md)
> Updated: 2026-10-18

## 현재 상태

AhnLab 등록본은 2026-10-18 개인정보·구조 검토를 통과한 v4 원문을 무변경 보존한다.
폼 내부 header/session 영역 제외와 읽기 전용 표시 텍스트 검토는 별개의 확인이다.
개인정보 잔존으로 철회·삭제된 v2/v3와 실제 표시값은 보존하지 않는다.

추가질문은 고정 API 기권 응답의 NO_MATCH 소비 사례다. 이 검사는 실제 JEV 매칭,
설치 확장 실행 또는 실사이트 성공의 근거가 아니다. 추천인 연락처 오매칭은
CF-252 범위 밖의 후속 발견으로 남긴다.

## 변경 이유

입력값을 비우거나 특정 영역을 제외한 것만으로 읽기 전용 표시 텍스트까지 안전하다고
판단하지 않고, 정제 구조의 오프라인 처리와 실제 사이트 동작의 검증 범위를 분리한다.

## 관련 주제

- [범용 칸 문맥과 형식 검사](generic-field-context-safety.md)
- [실사이트 자동 입력 평가](live-autofill-evaluation.md)

# 자격증 등록번호 표시 라벨

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: 0ca1b67136be3ae037b664c3398b75b7d43ff56854e386b64df2836d2e9144a5
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

이 문서는 2026-10-29 CF-368에서 승인된 후보 9를 프로필 필드 관점에서 수집한 기록이다. Approval-Digest의 계산 방식과 원문은 [manifest](../manifest.md)와 [승인 후보 스냅샷](approved-candidates.md)을 따른다. 그 밖의 프로필 구조와 필드 계약은 Supersedes가 가리키는 CF-41 근거를 따른다.

## 결정

- 자격증 항목의 `registrationNo` 표시 라벨은 `등록번호 및 자격번호`다. 1.4.0 QA 의견을 반영했다. 필드 키 `registrationNo`와 저장 형식은 그대로이므로 저장 데이터와 JSON 전송에는 영향이 없다.
- 어학 항목의 `registrationNo` 라벨은 `등록번호`로 남는다. 그래서 FE 의미 어휘에서 `등록번호`가 빠지지 않는다(`semanticText("등록번호")`가 그대로 남음).

## 검증

`field-definitions.test.ts`, `semantic-context.vocabulary.test.ts`와 기존 자동 기입 테스트로 확인했다.

## 참고 코드

- `frontend/src/profile/field-definitions.ts`

# Wiki 검증 기준 브랜치

> Topic: wiki-validation-base
> Status: Current
> Current: [CF-185 Wiki 검증 기준 브랜치](../../raw/issues/CF-185/documents/wiki-validation-base.md)
> History: [CF-185 Wiki 검증 기준 브랜치](../../raw/issues/CF-185/documents/wiki-validation-base.md)
> Updated: 2026-10-12

## 현재 상태

Wiki raw 불변성은 작업의 실제 PR 기준 ref를 사용한다. CI PR은 GITHUB_BASE_REF, 로컬 작업은 branch.<작업 브랜치>.career-form-base Git 설정, 직접 검증은 --base-ref로 기준을 전달한다. CLI, 브랜치 설정과 PR base가 서로 다르거나 허용된 실제 ref를 확인할 수 없으면 실패한다. 일반 develop/main과 운영 hotfix의 기본 기준은 보존하고, 그 밖의 기준 미지정 작업은 추측하지 않는다. 전체 verify.py와 pre-push는 같은 선택 로직을 사용하며, 기존 raw 수정, 삭제, rename 차단을 유지한다. 근거는 임시 Git의 release/develop 분리 회귀, 로컬 bare remote의 실제 pre-push 허용·거부 테스트와 전체 검증 통과다.

## 변경 이유

릴리스 수정에 develop 기준을 적용하면 develop에만 추가된 raw를 삭제한 것으로 잘못 판정한다. 작업의 실제 기준을 확인해 이 오류를 해결하면서 기존 raw 불변성 검증을 유지한다.

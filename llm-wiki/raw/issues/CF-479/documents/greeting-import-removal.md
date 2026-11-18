# Greeting 지원서 화면 가져오기 제거

> Issue: [CF-479](https://github.com/woowacourse-teams/2026-career-form/issues/479)
> Collected: 2026-11-18
> Approval-Digest: 19cb50157f3f038d01ca9b60eda98210dd0cde6a6a45a6527355f5a539945986
> Source-Revision: fd15cf2

[승인 후보 스냅샷](approved-candidates.md)의 후보 1을 적는다. Supersedes가 가리키는 CF-192 근거는 제거 전 기능의 기록으로 남는다.

## 결정 (사람 결정 2026-11-18)

- 프로필 가져오기의 출처는 이력서 파일 하나다. Greeting 지원서 화면에서 프로필을 읽어 오는 기능은 제거했다.
- Greeting 지원서 자동 기입, 서버 Greeting 정책, 온보딩 자동 기입 장면의 예시 지원서(`GreetingPage`)는 바꾸지 않았다.

## 지운 것

- 지원서 화면 가져오기 화면(`PageImport`), Greeting 필드 경로표(`greeting-import-mappings`), 가져오기 정책 준비(`load-import-policy`), 출처 표시(`source-presentation`), Greeting 읽기 함수와 그 테스트
- 사이드 패널 `App`의 지원서 화면 분기, 페이지 안 패널의 가져오기 제안 노출과 정책 준비, 출처 선택 화면의 지원서 화면 줄
- 조사용 `frontend/src/research/greeting-import-probe` 파일 네 개
- 검토 사유 `unrecognized_document`(Greeting 읽기만 만들던 값)

## 남긴 것

- 이력서 가져오기가 함께 쓰는 검토·병합 모듈: `ImportCategoryList`, `ImportConfirmCards`, `ImportSummary`, `ImportTargetChoices`, `NameSplitEditor`, `merge`, `review-model`, `review-fields`, `review-selection`, 스타일 `PageImport.module.css`와 `ImportReview.module.css`. 폴더 이름 `page-import`는 그대로다.
- `ImportCandidate` 타입은 `reader.ts`에서 `import-candidate.ts`로 옮겼다.

## 검증

- 실패 우선 테스트(출처 화면에 지원서 화면 없음, Greeting 지원서 화면에서 제안과 이벤트 없음, 저장된 온보딩 위치 처리)가 제거 전 실패하고 제거 뒤 통과했다.
- 넓은 프런트 테스트는 뒤따르는 CF-480과 합친 브랜치에서 한 번 실행했다. 결과는 PR의 검증 기록을 따른다.

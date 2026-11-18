# 자격증 이름+등급 정확 일치와 카탈로그 경로

> Issue: [CF-490](https://github.com/woowacourse-teams/2026-career-form/issues/490)
> Collected: 2026-11-19
> Approval-Digest: 326376b36d8178b562880acfa5011aa78837eb71f828a9d7dcdc31efdad65b7e
> Source-Revision: 1686901

[승인 후보 스냅샷](approved-candidates.md)의 후보 1~5를 적는다. 0건 직접입력 신호와 행 저장 연쇄는 Supersedes가 가리키는 CF-488 근거를 그대로 따르고, 이 문서는 등급을 붙인 이름의 정확 일치만 다룬다.

## 문제와 결정 (후보 1)

- 프로필은 자격증 이름과 등급을 따로 저장한다. 범용 경로 지원서 1곳은 등급이 붙은 변형("이름 1급", "이름 2급")만 결과에 두고 등급 칸이 없어, 이름만 검색하면 정확 일치가 없어 `SEARCH_NO_EXACT_MATCH`로 끝났다.
- 사람 결정(2026-11-19): 등급을 붙인 이름도 정확 일치로 인정한다. 결과 0건이면 직접입력(#488), 결과가 있는데 일치가 없으면 수동 확인으로 남긴다.

## 비카탈로그 경로 (후보 2, commit e0cc98d)

- `search-value-plan.ts`는 등급이 비어 있지 않고 이름이 그 등급으로 끝나지 않으면 `<이름> <등급>` 형태 `name-with-grade`를 추가한다. 기존 `name-and-grade` 분리형은 유지한다.
- `search-executor.ts`는 이를 `gradeAppendedValue`로 넘기고, 각 시도는 이름만의 결과보다 등급을 붙인 정확 일치 결과를 우선한다.
- 검토 미리 선택은 `name-with-grade`(정확 일치만)를 허용하고 분리형은 허용하지 않는다.

## 카탈로그 경로 (후보 3, commit 20a743a)

- 카탈로그 승인 값은 `searchValues`를 무시하고 승인 라벨만 비교해 위 규칙이 적용되지 않았다.
- `catalog-match.ts`의 `gradeAppendedCatalogLabels`는 자격증 종류에 한해 질의와 일반 별칭에 등급을 붙인 라벨을 만들며 이미 등급으로 끝나는 라벨은 건너뛴다.
- 실행기는 등급을 붙인 승인을 먼저 시도하고 없으면 일반 라벨로 되돌아간다. 선택 뒤 재확인과 `rememberCatalogSelection`은 등급을 붙인 라벨을 받아들인다. 모호성(`multiple_matching_results`)은 그대로다.

## 실측 (후보 4)

- 진단 빌드, 합성 프로필, 단일 행 입력과 행 저장을 쓰는 범용 경로 지원서 1곳에서 자격증 1~5번 행이 하나씩 기입·저장됐다(`row-save saved 1`이 다섯 번).
- 여섯째 자격증은 정확히 같은 결과가 둘이라 `multiple_matching_results`로 수동 확인에 남았다. 이전 빌드는 1~2번 행에서 멈췄다.
- 제출·동의는 하지 않았고 실제 지원값은 기록하지 않았다.

## 교훈 (후보 5)

- 실사이트 로그의 `search-no-match` 필드 `catalog: true/false`가 카탈로그 경로인지 구분해 준다.
- 비카탈로그 경로에서만 검증한 수정은 카탈로그 경로를 놓쳐 e0cc98d의 첫 실측이 실패했다. 검색 계획 변경은 두 경로를 모두 실측으로 확인한다.

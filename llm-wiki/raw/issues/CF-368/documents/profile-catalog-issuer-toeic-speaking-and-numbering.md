# 카탈로그 자격증 발급기관 채움, TOEIC Speaking 추가, 한국폴리텍 대학 번호 표기 대조

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: 0ca1b67136be3ae037b664c3398b75b7d43ff56854e386b64df2836d2e9144a5
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

이 문서는 2026-10-29 CF-368에서 승인된 후보 3·8·10을 프로필 카탈로그 관점에서 수집한 기록이다. Approval-Digest의 계산 방식과 원문은 [manifest](../manifest.md)와 [승인 후보 스냅샷](approved-candidates.md)을 따른다. 바꾸지 않은 결정(`selected`·`manual` 신원 형식, 이름 수정 시 연결 해제, 카탈로그 출처와 목록 밖 항목의 직접 입력, 어학 시험 선택의 비추론)은 Supersedes가 가리키는 CF-162 근거를 따른다. 카탈로그 출처, 해시, 건수의 정본은 계속 `frontend/src/profile/catalog-data/README.md`다.

## CF-162 결정에서 바뀐 것

CF-162는 "카탈로그에서 골라도 등록번호, 발급기관, 취득일, 등급, 학위, 학과, 소재지 등 관련 필드는 자동으로 바꾸지 않는다"고 정했다. CF-368은 이 중 **자격증 발급기관 하나만** 예외로 둔다. 나머지 관련 필드의 비추론 계약은 그대로다.

## 결정

### 자격증 발급기관 자동 채움 (후보 8)

- 자격증명을 카탈로그에서 고르면, 발급기관이 비었거나 공백뿐일 때만 카탈로그 detail의 첫 ` · ` 조각으로 채운다. 카탈로그 자격증 620건 모두 첫 조각이 기관명이다(HRDK 613건은 한국산업인력공단, KDATA 7건은 한국데이터산업진흥원).
- 이미 입력된 발급기관은 바꾸지 않는다. 자동으로 채웠는지 여부는 저장하지 않으므로, 이름을 고쳐 카탈로그 연결이 풀려도 채운 발급기관은 남는다.
- 학교·어학 선택, 이름 직접 입력, 가져오기는 관련 필드를 추론하지 않는다.
- 국가전문자격 일부는 detail 첫 조각이 시행기관이라 실제 발급 주체와 다를 수 있다. 사용자가 고칠 수 있는 빈 칸 채움으로만 쓰는 이유다.

### 어학 시험 목록의 TOEIC Speaking (후보 10)

- 어학 시험 목록은 저장소 상수(`LANGUAGE_TEST_OPTIONS`) 8종이 됐다. TOEIC Speaking은 value `toeic-speaking`, 별칭 `토익스피킹`이다. 런타임 카탈로그는 5,156건이다.
- 항목 추가는 새 ID(`languageTest:toeic-speaking`)만 만들므로 `CATALOG_VERSION`을 올리지 않는다. 버전을 올리면 저장된 `selected` 신원이 모두 무효가 된다.
- 라벨 `TOEIC Speaking`은 현대자동차 정책 optionMap 키와 같아야 시험 코드 15로 연결된다.
- TOEIC 선택이 TOEIC Speaking 칸을 채우지 않는 기존 회귀는 유지한다. 두 항목은 서로를 함의하지 않는다. TOEIC Writing, TEPS Speaking 등 목록 밖 시험은 직접 입력이다.

### 한국폴리텍 대학 번호 표기 대조 (후보 3)

- 카탈로그 데이터와 `normalizedCatalogLabel`은 바꾸지 않았다. KESS 이름에는 캠퍼스군 번호가 없고 사이트 목록에는 있는 차이(`한국폴리텍대학 서울정수캠퍼스` ↔ `한국폴리텍 I 대학 서울정수캠퍼스`)는 자동 기입 대조 함수 `matchesCatalogNumberedCollege`가 처리한다.
- 대상은 `university`·`graduateSchool` 종류이고, 번호가 한쪽에만 있으며 번호를 뺀 키가 카탈로그 항목 하나만 가리킬 때만 같은 학교로 본다. 2026-10-07 카탈로그 기준 충돌은 0건이다. 카탈로그 README에 이 대조 범위를 기록했다.
- 이렇게 고른 사이트 라벨은 재실행 검토에서 프로필 값과 달라 기존 값 충돌로 표시되고 덮어쓰지 않는다. Greeting 쪽 상세는 같은 bundle의 [Greeting 근거](greeting-school-name-tie-break-and-numbered-college.md)를 따른다.

## 검증

`ProfileForm.certificate-issuer.test.tsx`, `use-profile-editor.test.tsx`(빈 발급기관만 채움, 입력값 보존, 공백만 있는 값은 빈 값, 직접 입력 미채움, 연결 해제 뒤 유지), `catalog.test.ts`, `catalog-identity.language-test.test.ts`, `catalog-language.integration.test.ts`, 현대 `workflow-language.integration.test.tsx`(코드 15 연결과 TOEIC 비함의), `catalog-numbered-college.integration.test.ts`로 고정했다. 실제 사용자 프로필은 쓰지 않았다.

## 참고 코드

- `frontend/src/profile/catalog.ts`, `frontend/src/profile/standard-values.ts`
- `frontend/src/profile/hooks/use-profile-editor.ts`
- `frontend/src/autofill/profile/catalog-identity.ts`
- `frontend/src/profile/catalog-data/README.md`

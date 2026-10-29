# Greeting 동명 고교 지역 동점 해소, 재실행 검증, 한국폴리텍 대학 번호 표기 대조와 카카오게임즈 실측

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: b248c7c1b42ba910bc8cbbe50815c2a1adef692dbf08c12363336f19941025e5
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

이 문서는 2026-10-29 CF-368([FE] 1.4.0 QA의 Greeting 학교명 미확정과 사이드 패널 표시 문제 수정 및 프로필 입력 보강)에서 승인된 후보 1·2·3·4를 Greeting 어댑터 관점에서 수집한 기록이다. Approval-Digest의 계산 방식과 원문은 [manifest](../manifest.md)와 [승인 후보 스냅샷](approved-candidates.md)을 따른다. 바꾸지 않은 내용(직접 입력 선택지 구조와 v19 허용 범위, 검색 실패 사유 코드, 그 앞의 팝오버·서버 액션·별칭 근거)은 Supersedes가 가리키는 CF-346 근거와 그 앞의 근거를 따른다. 실측은 테스트 계정과 합성 프로필로 했고 실제 지원값·계정·세션은 포함하지 않는다.

## 승인 후보

- (후보 1) 고교 학교명 동명 후보는 정책 버전을 올리지 않고 FE에서 지역으로 동점을 해소한다.
- (후보 2) 고교 재실행은 체크된 항목이 같은 동점 해소 결과와 같을 때만 성공이고, 근거가 없으면 기존 값을 덮어쓰지 않는다.
- (후보 3) 한국폴리텍 대학의 캠퍼스군 번호 표기 차이는 번호를 뺀 키가 카탈로그 항목 하나만 가리킬 때만 같은 학교로 본다.
- (후보 4) 카카오게임즈 실측에서 CF-368 빌드는 세 프로필 모두 고교를 확정했고, 카탈로그 선택 폴리텍 대학은 정식 항목으로 확정됐다.

원문은 [승인 후보 스냅샷](approved-candidates.md)의 1~4번이다.

## 결정

### 동명 고교의 지역 동점 해소 (후보 1)

- 운영 정책의 고교 검색은 `matchMode: NAME_ONLY`라 v19까지는 같은 이름 정식 후보가 둘 이상이면 아무것도 고르지 않고 `SEARCH_AMBIGUOUS`로 끝났다. Issue는 정책 v20(`highSchool` NAME_AND_DETAIL)과 FE 동점 해소 중 하나를 고르게 했고, CF-368은 정책 버전을 올리지 않는 FE 동점 해소를 택했다. 정책 v20은 만들지 않았으므로 Greeting 활성 정책은 계속 v19다.
- 동점 해소는 고교 검색 칸에서 같은 이름 정식 후보가 2개 이상일 때만 동작한다. 기준 지역은 프로필 신원이 카탈로그 `selected`면 카탈로그 detail 첫 조각의 시도(`catalogHighSchoolRegion`), 아니면 같은 고교 항목의 `schoolRegion` 표준 라벨(`highSchoolSearchRegion`, 예: `서울`)이다.
- 기준 지역과 선택지 `item-description`이 정규화 뒤 정확히 같은 후보가 하나이고, 모든 후보의 설명이 비어 있지 않게 보일 때만 그 후보를 고른다(`regionTieBreak`). 설명이 하나라도 숨었거나 비었거나, 맞는 후보가 둘 이상이면 고르지 않는다.
- `selected` 신원의 카탈로그 시도와 프로필 `schoolRegion`이 서로 다르면 좁히지 않는다(`expectedSearchRegion`이 기준 지역을 내지 않음). 그 밖의 모든 경우는 기존처럼 `SEARCH_AMBIGUOUS`로 남는다.
- 같은 이름 후보가 1개일 때의 동작은 바꾸지 않았다. 다른 시도의 단일 후보를 고를지(프로필 지역과 어긋나는 유일 후보)는 후속 후보로 남긴다.
- `catalog-school-region.integration.test.ts`의 기존 기대값 "NAME_ONLY에서는 지역이 하나만 맞아도 거부"는 위 조건(기준 지역 존재, 모든 설명 보임, 유일 일치)에서 선택으로 바뀌었고, 근거 없음·어긋남·중복 일치는 거부로 고정했다.

### 재실행 검증과 영수증 (후보 2)

- 다시 연 목록에 같은 이름 정식 항목이 여럿이면, 이미 체크된 항목이 같은 동점 해소로 고른 결과와 같을 때만 성공으로 본다.
- 지역 근거가 없거나 어긋나면 `SEARCH_AMBIGUOUS`를 보고하고 기존 값은 덮어쓰지 않는다.
- 동점 해소로 고른 선택의 영수증(`rememberComponentSelection`)은 `detail`에 카탈로그 detail, `description`에 지역을 남긴다. 다시 열 때는 이 설명을 보이는 선택지 설명과 다시 대조한다.
- 리뷰 계획의 `ReviewPlanItem.searchRegion`은 동점 해소용 로컬 전용 필드이며 분석 API로 보내지 않는다.

### 한국폴리텍 대학의 번호 표기 대조 (후보 3)

- KESS 카탈로그 이름에는 캠퍼스군 번호가 없고(`한국폴리텍대학 서울정수캠퍼스`), Greeting 사이트 목록에는 있다(`한국폴리텍 I 대학 서울정수캠퍼스`). 카탈로그 `selected` 대학은 `[[new]]` 직접 입력도 거부하므로 수정 전에는 `SEARCH_NO_EXACT_MATCH`로 끝났다.
- `matchesCatalogNumberedCollege`는 `university`·`graduateSchool` 종류에서 번호가 한쪽에만 있고, 번호를 뺀 키가 카탈로그 항목 하나만 가리키며 그 항목이 프로필의 카탈로그 신원과 같을 때만 같은 학교로 본다. 2026-10-07 카탈로그 기준으로 번호를 뺀 키끼리의 충돌은 0건이다.
- 표기 정규화 함수 `normalizedCatalogLabel`은 바꾸지 않았다. 다른 학교의 이름 비교에는 영향이 없다.
- 이렇게 고른 사이트 라벨은 프로필 값과 글자가 달라서, 재실행 검토에서는 기존 값 충돌로 표시되고 덮어쓰지 않는다.

## 실측 (후보 4)

2026-10-29 카카오게임즈 Greeting 지원서에서 실사이트 QA 하네스로 측정했다. 테스트 계정과 합성 프로필만 썼고 저장·제출·단계 이동은 하지 않았다.

| 빌드 | 프로필 | 고교 학교명(동명 대진고 3곳) | 두 번째 대학 학교명 |
| --- | --- | --- | --- |
| 운영 1.4.0 | 기본 합성 | 비어 있음 | 확정 |
| 운영 1.4.0 | 고교·대학 카탈로그 선택, 대학은 폴리텍 서울정수캠퍼스 | 비어 있음 | 비어 있음 |
| develop `dcee68dd` | 기본 합성 | 비어 있음, `SEARCH_AMBIGUOUS` | 확정 |
| develop `dcee68dd` | 카탈로그 선택 | 비어 있음, `SEARCH_AMBIGUOUS` | 비어 있음, `SEARCH_NO_EXACT_MATCH` |
| develop `dcee68dd` | 카탈로그 선택을 직접 입력으로 바꾼 프로필 | 비어 있음, `SEARCH_AMBIGUOUS` | 직접 입력 값(#347) |
| CF-368(develop 로컬 서버, Greeting 정책 v19) | 기본 합성 | 확정 | 기록 범위 밖 |
| CF-368 | 카탈로그 선택 | 확정 | 정식 항목 `한국폴리텍 I 대학 서울정수캠퍼스` |
| CF-368 | 직접 입력 | 확정 | #347 동작대로 직접 입력 값 |

운영 1.4.0과 develop 행은 Issue 본문의 재현 표를 따른다.

- 세 프로필 모두 고교가 확정된 것은 고교 선택지에 시도 설명이 있다는 간접 근거다.
- 카탈로그 선택 폴리텍 대학이 정식 항목으로 확정된 것은 프로필 이름으로 검색한 결과에 번호 있는 정식 항목이 나온다는 뜻이다.

## 한계

- 실측은 카카오게임즈 한 양식, 프로필 변형별 1회다. 다른 Greeting 양식에서 고교 선택지 설명이 시도 형식이라는 것은 입증하지 않았다.
- 번호 표기 대조는 한국폴리텍 계열만 다루며, 다른 학교의 사이트 표기 차이는 다루지 않는다.
- 같은 카카오게임즈 실행의 다른 실패(어학·자격 취득일 `VALUE_NOT_RETAINED`, 어학 등급·점수 `OPTION_UNMATCHED`, 회화수준 미입력)는 범위 밖이며 CF-346 근거의 기존 미해결 항목과 같다.

## 참고 코드

- `frontend/src/autofill/policy/components/workflow-search.ts`
- `frontend/src/autofill/policy/components/workflow-search-region.ts`
- `frontend/src/autofill/profile/search-region.ts`
- `frontend/src/autofill/profile/catalog-identity.ts`
- `frontend/src/autofill/review/review-plan.ts`
- `frontend/src/autofill/policy/components/catalog-school-region.integration.test.ts`, `catalog-numbered-college.integration.test.ts`

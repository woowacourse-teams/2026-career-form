# 프로필 카탈로그 선택과 식별 연결

> Topic: profile-catalog-identity
> Status: Current
> Current: [CF-368 자격증 발급기관 채움, TOEIC Speaking, 한국폴리텍 번호 표기 대조](../../raw/issues/CF-368/documents/profile-catalog-issuer-toeic-speaking-and-numbering.md)
> History: [CF-162 근거](../../raw/issues/CF-162/documents/profile-catalog-identity.md); [CF-368 자격증 발급기관 채움, TOEIC Speaking, 한국폴리텍 번호 표기 대조](../../raw/issues/CF-368/documents/profile-catalog-issuer-toeic-speaking-and-numbering.md)
> Updated: 2026-10-29

## 현재 상태

자격증명, 학교명, 어학 시험명은 오프라인 카탈로그에서 명시적으로 선택하면 `selected` 식별자를, 직접 입력하면 `manual` 원문을 반복 행에 저장한다. 프로필 스키마 1의 문자열은 그대로 유지하며 이름을 바꾸면 연결만 해제한다. 카탈로그 출처, 건수와 한계는 `frontend/src/profile/catalog-data/README.md`를 따른다.

관련 필드는 자격증 발급기관 하나만 예외로 채운다(CF-368, CF-162 결정 일부 변경). 자격증명을 카탈로그에서 고르면 발급기관이 비었거나 공백일 때만 카탈로그 detail의 첫 ` · ` 조각(HRDK 613건은 한국산업인력공단, KDATA 7건은 한국데이터산업진흥원)으로 채운다. 입력된 발급기관은 바꾸지 않고, 자동 채움 여부를 저장하지 않으므로 이름을 고쳐 연결이 풀려도 채운 값은 남는다. 학교·어학 선택, 직접 입력, 가져오기는 등록번호·취득일·등급·학위·학과·소재지 등 관련 필드를 추론하지 않는다. 국가전문자격 일부는 첫 조각이 시행기관이라 실제 발급 주체와 다를 수 있다.

어학 시험 목록은 저장소 상수 8종(TOEIC, TOEIC Speaking, TOEFL, TEPS, OPIc, IELTS, JLPT, HSK)이다. TOEIC Speaking은 value `toeic-speaking`, 별칭 `토익스피킹`이며, 라벨 `TOEIC Speaking`이 현대자동차 optionMap 키와 같아야 시험 코드 15로 연결된다. 항목 추가는 새 ID만 만들므로 `CATALOG_VERSION`을 올리지 않는다. 올리면 저장된 `selected` 신원이 모두 무효가 된다. TOEIC 선택이 TOEIC Speaking 칸을 채우지 않는 회귀는 유지한다.

카탈로그 데이터와 `normalizedCatalogLabel`은 사이트 표기 차이 때문에 바꾸지 않는다. KESS 이름에 없는 한국폴리텍 캠퍼스군 번호(`한국폴리텍 I 대학 …`)는 자동 기입의 `matchesCatalogNumberedCollege`가 `university`·`graduateSchool`에서 번호가 한쪽에만 있고 번호를 뺀 키가 카탈로그 항목 하나만 가리킬 때만 같은 학교로 본다(2026-10-07 카탈로그 기준 충돌 0). 이렇게 고른 사이트 라벨은 재실행 검토에서 기존 값 충돌로 표시되고 덮어쓰지 않는다. Greeting 쪽 동작은 [Greeting 공통 어댑터](adapter-greeting.md)를 따른다.

## 변경 이유

같은 이름의 학교·자격과 별칭을 회사 화면에서 안전하게 구분하려면 문자열이 아닌 검증된 식별자가 필요했다(CF-162).

1.4.0 QA에서 자격증 발급기관 자동 지정 개선 요청이 나왔고, 카탈로그 자격증 620건 모두 detail 첫 조각이 기관명이라 빈 칸에 한해 채우도록 CF-162의 "관련 필드 불변" 결정을 발급기관에 한정해 바꿨다. 사용자가 입력한 값은 보호한다. TOEIC Speaking은 같은 QA에서 목록에 없다는 의견이 나와, 저장된 신원을 무효로 만들지 않도록 새 ID로만 추가했다(CF-368).

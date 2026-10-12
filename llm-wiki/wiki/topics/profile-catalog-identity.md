# 프로필 카탈로그 선택과 식별 연결

> Topic: profile-catalog-identity
> Status: Current
> Current: [프로필 카탈로그 선택과 식별 연결](../../raw/issues/CF-162/documents/profile-catalog-identity.md)
> History: [CF-162 근거](../../raw/issues/CF-162/documents/profile-catalog-identity.md)
> Updated: 2026-10-07

## 현재 상태

자격증명, 학교명, 어학 시험명은 오프라인 카탈로그에서 명시적으로 선택하면 `selected` 식별자를, 직접 입력하면 `manual` 원문을 반복 행에 저장한다. 프로필 스키마 1의 문자열은 그대로 유지하며 이름 변경 시 연결만 해제하고 관련 필드는 바꾸지 않는다. 카탈로그 출처와 한계는 `frontend/src/profile/catalog-data/README.md`를 따른다.

## 변경 이유

같은 이름의 학교·자격과 별칭을 회사 화면에서 안전하게 구분하려면 문자열이 아닌 검증된 식별자가 필요했다.

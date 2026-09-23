# 범용 자동 기입 검색 표면

> Topic: generic-autofill-search
> Status: Current
> Current: [CF-98 범용 검색 실행과 실측 경계](../../raw/issues/CF-98/documents/generic-autofill-search.md)
> History: [근거 1](../../raw/issues/CF-98/documents/generic-autofill-search.md)
> Updated: 2026-09-23

## 현재 상태

승인된 nonempty readonly DIRECT 필드만 소유된 검색 표면의 대상이 된다. opener, query, submit, 결과 후보의 관계와 유일성, 현재 대상 및 검색 표면을 조작 직전 다시 확인한다. 완전한 동일 출처 국내 17개 학교 소재지 목록은 한국 국가 문맥과 명시적 지역 별칭이 있을 때만 고른다. 제한된 단일 함수·리터럴 JavaScript 결과 링크는 안전한 원본을 MAIN-world에서 한 번만 클릭한다. callback 직접 호출·주소 평가·재클릭·readonly/hidden 값 강제 입력은 금지한다. 값 반영과 표면 종료·유지가 불확실하면 후속 자동 기입을 중단한다.

합성 확장에서는 두 소재지 반영과 검색 화면 종료를 확인했다. 실제 CJ의 나중 화면에서는 두 소재지 표시값과 닫힌 검색 화면을 확인했지만 그 중간 실행의 확장 항목별 판정, 숨은 코드, 저장값은 미확인이다. Jev 실호출, Greeting 실제 양식 등은 아직 검증 범위 밖이다. [CF-98 raw](../../raw/issues/CF-98/documents/generic-autofill-search.md)의 이전 실패와 최신 상태를 시간순으로 구분한다.

## 변경 이유

회사별 callback 구현을 복제하거나 모델 출력으로 브라우저를 직접 실행하는 대신, 공통 검색 안전 계약과 로컬 exact 결과 선택으로 범용 기입을 확장했다. 같은 Issue의 ADR은 [제안됨](../../raw/issues/CF-98/documents/adr/98-generic-classification-and-execution-boundary.md) 상태로 보존한다.

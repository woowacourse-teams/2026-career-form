# 범용 자동 기입 검색 표면

> Topic: generic-autofill-search
> Status: Current
> Current: [CF-108 범용 검색 진단과 현행 실행 경계](../../raw/issues/CF-108/documents/generic-autofill-search.md)
> History: [CF-98 실행과 실측 경계](../../raw/issues/CF-98/documents/generic-autofill-search.md); [CF-108 진단 보완](../../raw/issues/CF-108/documents/generic-autofill-search.md)
> Updated: 2026-09-25

## 현재 상태

승인된 nonempty readonly DIRECT 필드, 소유된 검색 표면, 로컬 exact 선택, DOM/행/기존값 재검증과 원본 제어 1회 조작 경계를 유지한다. 완전한 동일 출처 국내 17개 학교 소재지 목록은 한국 국가 문맥과 명시적 별칭으로만 처리한다. callback 직접 호출, 주소 평가, readonly/hidden 강제 입력과 저장/제출은 금지한다.

CF-108은 폼, 화면 이동, 결과 완료와 활성화 실패를 공개 failureCode로 안내한다. 미확정 부수효과로 중단할 때 승인된 후속 항목의 보류를 원인 항목 실패와 구분하며 미승인 결과는 보존한다. POST/hidden/inline 학교 검색의 지원 허용 범위는 늘리지 않았다.

native GET navigation 완료 뒤에도 완료 표식, 결과 개수 또는 전체 위치 정보가 필요하다. 완료 근거 없는 목록이 자동 선택된다는 초기 의심은 정정했다. 설치 확장 합성 검증에서 두 진단, 후속 opener 0회와 기존값/코드 보존을 확인했지만 실제 CJ와 서버 저장은 미검증이다.

## 변경 이유

검색 실패 이유가 뭉뚱그려 표시되고 후속 미실행이 개별 실패로 오해될 수 있어 진단 전달을 보완했다. 범용 지원 확대와 실패 설명을 분리하고, 학교 원 구조와 진단용 변형 및 실제/합성 검증 경계를 [승인된 근거](../../raw/issues/CF-108/documents/generic-autofill-search.md)에 명시했다.

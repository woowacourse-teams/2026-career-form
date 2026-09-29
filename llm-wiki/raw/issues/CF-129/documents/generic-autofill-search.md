# 혼합 학력 행과 role 없는 레이어 검색 경계

근거: [Issue #129](https://github.com/woowacourse-teams/2026-career-form/issues/129), 기준 revision `5981e866b1527e3a09f0fc379b4d09718133794c`의 작업 브랜치 CF-129.
CF-114까지의 범용 검색 계약은 유지한다. 이 문서는 한 섹션 안에서 행마다 학력 구분을 고르는 혼합 행, role 없는 같은 문서 레이어 검색과 그 테스트 기법의 경계를 추가한다.

## 승인된 후보 전체

1. jsdom에서 inline 이벤트 핸들러는 테스트의 `window`와 다른 전역 스코프에서 실행된다. fixture가 핸들러에 노출할 합성 전역은 Document에 정의한다.
2. jsdom의 fragment 링크 이동은 click 처리 뒤 별도 task에서 hash를 바꾼다. 클릭한 링크 자신의 fragment로 바뀐 URL만 허용하는 hash 판정은 이 지연을 전제로 설계했다.
3. 범용 반복 행 탐지는 `*-item` 이름, repeat 표식, fieldset과 legend, 또는 "행 밖 추가 버튼 1개, 제목 있는 영역, 행 표식" 조합이 있어야 성립한다. 첫 행 안에 추가 버튼이 있고 식별자가 없는 행 구조는 탐지하지 못하며 후속 후보(#119 계열)로 남긴다.
4. 빈 목록에서 시작한 첫 검색은 결과 append와 교체가 MutationObserver 기록만으로 구분되지 않는다. 명시적 결과 루트나 완료 신호가 없는 로컬 레이어에서는 이 모호성을 완료 근거로 쓰지 않고 fail-closed로 판정한다.
5. 같은 문서 검색 레이어(same-document-layer/dialog)가 지원서 form 안에 있어도, 검색 입력과 type=button 실행 버튼이 모두 소유 레이어 안에 있고 form이 레이어 전체를 감싸며 버튼에 formaction/formmethod/formtarget/formenctype이 없으면 form 이동 없는 검색으로 허용한다. 버튼은 클릭만 하고 inline onclick은 평가하지 않으며 Enter/submit은 일으키지 않는다. 클릭 중 submit 이벤트가 발생하면 페이지 핸들러보다 먼저 취소하고 surface_navigation_unsafe로 실패한다. fragment 결과 링크(C10)도 form이 결과 루트 전체를 감싸는 경우에만 허용하고, 결과 루트 안쪽 form은 계속 차단한다. type=submit, 레이어 밖 버튼, readOnly query, query·버튼 form 불일치는 계속 unverified_search_form으로 차단한다.
6. 한 행 안에서 구분별 분기 블록이 각자 구분 select와 추가 버튼을 가지면, 보이는 분기 1개와 서명이 다른 숨은 분기만 있는 부모를 행으로 보고 숨은 분기의 추가 버튼은 개수에서 뺀다. 보이는 추가 버튼이 2개 이상이거나, 숨은 분기 서명이 같거나, 부모 행에 직속 control이 있으면 탐지하지 않는다. section·fieldset·role=group 요소가 없으면 증명된 암묵 반복 그룹 컨테이너를 섹션 루트로 쓴다. 혼합 행의 구분을 바꾼 뒤에는 원래 select가 숨을 수 있으므로 그 행에서 보이는 구분 select로 안정 여부를 확인한다. 후보 3의 "첫 행 안 추가 버튼" 미탐지 경계는 이 분기 구조에 한해 좁혀진다(승인 digest `4370b04c1b54c40ecb2453ee7d1eec1afdc9949ba9a7fdacfdfc25d47dce3952`).

## 검증 경계

- 합성 fixture 기반 자동 테스트(속성·통합)로 확인했다. 실제 지원서 수동 검증은 사용자가 수행하며 이 문서는 실사이트 성공을 주장하지 않는다.
- 회사 전용 셀렉터나 분기는 추가하지 않았다. 증명할 수 없는 행·결과는 입력하지 않는다.

# 범용 버튼 드롭다운 소유 관계와 실행 경계

> Issue: [CF-142](https://github.com/woowacourse-teams/2026-career-form/issues/142)
> Collected: 2026-10-02
> Approval-Digest: b1d28af146b567a09987ebfeab7e0ee823bc4be8723710f1f19355b77ac2c7e0
> Source-Revision: ca54009aa971b283f3149710361dc57c666e67e8

## 후보 범위

범용 수집은 입력 컨테이너의 button, role=button, Ant 클릭형 DIV를 검증 대상으로 삼는다. semantic form, fieldset, section, role=group 또는 단일 트리거를 가진 제한된 ID 컨테이너를 사용한다. 링크나 다른 버튼을 가진 비입력 컨테이너와 header, nav, role=navigation은 제외한다. 내비게이션에는 semantic 태그가 없는 DIV 헤더도 포함될 수 있다.

기존 native input/select/textarea와 명시적 combobox는 새로운 버튼형 드롭다운으로 취급하지 않는다. 회사 어댑터와 기존 동기 native collector도 유지한다. 검색형 combobox, 파일 입력과 조건부 영역 확장은 이 범위에 포함하지 않는다.

## 소유 관계

명시적 연결이 있으면 단일 연결 목록을 검증한다. 연결이 없으면 열기 전에 DOM 변화를 구독하고, 해당 조작에 따라 등장한 단일 메뉴의 영역과 실제 위치를 함께 확인한다. 화면에 하나 있다는 사실이나 가장 가까운 목록이라는 이유만으로 소유 관계를 추측하지 않는다.

수집은 검증한 옵션을 기존 FieldCandidate/options의 opaque optionId와 displayName으로 전달한다. DOM 대상과 관계는 로컬 registry에 남기며 API에 DOM 객체나 기존 필드 값 snapshot을 전달하지 않는다.

실행 직전에는 승인 시 확인한 원래 메뉴 객체, 현재 보이는 메뉴의 유일성, 관계와 옵션을 다시 확인한다. 같은 글자를 가진 교체 메뉴도 원래 메뉴로 간주하지 않는다. 검색 입력, 파일 입력, 복수 메뉴, 불명확 관계, 옵션 불일치와 중복은 수집 또는 쓰기를 허용하지 않는다.

## 근거와 검증 경계

현재 메가존의 클릭형 DIV 트리거 4개와 포털 menu/menuitem 구조를 비식별 DOM 관계로 조사했다. 실사이트 자동 입력 성공률을 측정한 결과는 아니다.

ID 컨테이너형 합성 fixture의 4개 수집과 옵션 분석 전달, 관계 불명확, 기존 native·combobox 보존 및 메뉴 교체를 자동 테스트로 검증했다. production workflow를 실제 Chromium에서 실행해 정상 4개 수집·선택과 불명확 관계의 수집 0개를 확인했다. 실제 지원 정보, 계정과 세션 상태는 기록하지 않는다.

## 참고 코드

- `frontend/src/autofill/dom/button-dropdown.ts`
- `frontend/src/autofill/dom/collect.ts`
- `frontend/src/autofill/dom/button-dropdown.test.ts`
- `frontend/src/autofill/workflow/button-dropdown.integration.test.tsx`

# 범용 버튼 드롭다운 안전성

> Topic: generic-button-dropdown-safety
> Status: Current
> Current: [CF-142 버튼 드롭다운 소유 관계와 실행 경계](../../raw/issues/CF-142/documents/generic-button-dropdown-safety.md)
> History: [CF-142 버튼 드롭다운 소유 관계와 실행 경계](../../raw/issues/CF-142/documents/generic-button-dropdown-safety.md)
> Updated: 2026-10-02

## 현재 상태

범용 수집은 입력 컨테이너의 button, role=button과 Ant 클릭형 DIV를 검증한다. semantic 입력 영역 또는 단일 트리거 ID 컨테이너의 경계를 사용하고, 링크·다른 버튼을 가진 비입력 컨테이너와 내비게이션을 제외한다. 기존 native·combobox와 회사 어댑터는 유지한다.

단일 메뉴의 명시적 연결 또는 조작에 따른 등장·영역·위치를 확인한 뒤 기존 opaque optionId로 옵션을 분석에 전달한다. 실행은 원래 메뉴 identity, 현재 유일한 메뉴와 옵션을 다시 확인한다. 검색·파일·복수 메뉴·교체 메뉴·불일치와 중복은 허용하지 않는다.

값 보존, 취소 정리와 실제 표시값 기반 완료는 [지원서 패널 안 자동 기입 흐름](autofill-panel-workflow.md)의 현재 기준을 함께 따른다.

## 검증 경계

실사이트 DOM 구조 조사와 합성 fixture의 자동·실제 Chromium 검증을 구분한다. 메가존 4개 수집·선택은 현재 구조를 본뜬 합성 검증이며 실사이트 자동 입력 성공률 측정이 아니다.

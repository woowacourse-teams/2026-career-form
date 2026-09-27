# 회사 어댑터 개발

> Topic: adapter-development
> Status: Current
> Current: [Greeting을 포함한 어댑터 경계](../../raw/issues/CF-94/documents/adapter-development.md)
> History: [근거 1](../../raw/issues/CF-41/documents/indexes/location-dependent-policies.md); [근거 2](../../raw/issues/CF-46/documents/adapter-development.md); [CF-94 근거](../../raw/issues/CF-94/documents/adapter-development.md)
> Updated: 2026-09-27

## 현재 상태

백엔드는 의미 매핑과 허용 명령을, 프론트 회사 어댑터는 DOM 수집·조건부 처리·특수 입력을 소유한다. 공통 프론트의 승인·로컬 값 결합·실행 검사는 유지한다. 구조를 검증할 수 없으면 추정하지 않는다. 기존 schemaVersion 2 클라이언트 응답은 유지하며, SK 주소 검색의 새 명령은 preparation API에서 지원을 명시한 클라이언트에만 반환한다. SK 경력·검색·년월 입력은 exact DOM, 유일한 프로필 바인딩, READY 상태와 반복 행 수 보호를 함께 적용한다. 현대 정책 v4는 국내 주소, 국적1 대한민국, 학력 그룹별 행·필드 매핑을 조건부로 적용한다.

승인된 전체 패널 검증에서는 공개 fixture를 실제 가져오기 UI에 적용해 설치된 정적 production 확장의 popup→사이드 패널→자동 기입 경로를 확인했다. 준비·필드 분석 API 10회는 모두 HTTP 200/ADAPTER/COMPLETE였고, UI 집계 23개 기입 성공·0개 직접 확인은 선행 선택·미지원·미선택 전체 성공을 뜻하지 않는다. 테스트 후 프로필 키 미존재와 지원서 204개 제어 상태를 원복했으며, 저장·제출 호환성은 미검증이다. WXT watcher의 자동 reload 가능성 때문에 새로고침 승인을 과거 세션에서 재사용하지 않고, 도구 연결 중단 시 복구 보장을 확대하지 않는다.

## 변경 이유

현대·SK 프론트 분리 결과와 LG 검색의 후속 설계 경계를 승인된 CF-46 근거로 기록했다.

현대 최신 검증은 주소의 유일 결과·modal cleanup, 국적1 `KR`와 국적2 불변, 학력 그룹별 준비·재분석, 실제 학교 `school`·전공 `basic` auto-type을 확인했다. 설치 smoke는 고교·학사 2행과 주소·국적1을 독립 대조했고, API 7회가 모두 HTTP 200/ADAPTER/COMPLETE였다. UI 38/0은 writer 집계이며 전체 성공이 아니고, 저장·제출과 실제 toolbar icon 클릭은 검증하지 않았다.

## Greeting 플랫폼 경계

SK·현대의 FE host 분기는 유지한다. Greeting은 [CF-94 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)에 따라 BE가 연결과 공통 정책을 판정하고 `greeting-v1`을 지정한다. FE는 새 DOM snapshot으로 준비·분석·입력하되 공급업체나 정적/범용 경로를 독자 판정하지 않는다. 양성 판정 뒤 구조 불일치와 모호한 필드는 범용 매처로 우회하지 않는다.

이름 없는 이메일 combobox는 `이메일주소` 또는 `이메일`이라는 단일 소유 라벨과 유일한 칸을 확인한 경우에만 연결한다. 값 입력과 이메일 확인을 분리한다. 메디퀴터스 설치 확장에서 비식별 기본 필드 3개 입력을 확인했으며, 다른 Greeting 화면의 전 항목 성공으로 확대하지 않는다. 필드별 경계는 [Greeting 근거](../../raw/issues/CF-94/documents/adapter-greeting.md)에 기록했다.

# 회사 어댑터 개발

> Topic: adapter-development
> Status: Current
> Current: [Greeting을 포함한 어댑터 경계](../../raw/issues/CF-94/documents/adapter-development.md)
> History: [근거 1](../../raw/issues/CF-41/documents/indexes/location-dependent-policies.md); [근거 2](../../raw/issues/CF-46/documents/adapter-development.md); [CF-94 근거](../../raw/issues/CF-94/documents/adapter-development.md)
> Updated: 2026-09-28

## 현재 상태

백엔드는 의미 매핑과 허용 명령을, 프론트 회사 어댑터는 DOM 수집·조건부 처리·특수 입력을 소유한다. 공통 프론트의 승인·로컬 값 결합·실행 검사는 유지한다. 구조를 검증할 수 없으면 추정하지 않는다. 기존 schemaVersion 2 클라이언트 응답은 유지하며, SK 주소 검색의 새 명령은 preparation API에서 지원을 명시한 클라이언트에만 반환한다. SK 경력·검색·년월 입력은 exact DOM, 유일한 프로필 바인딩, READY 상태와 반복 행 수 보호를 함께 적용한다. 현대 정책 v4는 국내 주소, 국적1 대한민국, 학력 그룹별 행·필드 매핑을 조건부로 적용한다.

승인된 전체 패널 검증에서는 공개 fixture를 실제 가져오기 UI에 적용해 설치된 정적 production 확장의 popup→사이드 패널→자동 기입 경로를 확인했다. 준비·필드 분석 API 10회는 모두 HTTP 200/ADAPTER/COMPLETE였고, UI 집계 23개 기입 성공·0개 직접 확인은 선행 선택·미지원·미선택 전체 성공을 뜻하지 않는다. 테스트 후 프로필 키 미존재와 지원서 204개 제어 상태를 원복했으며, 저장·제출 호환성은 미검증이다. WXT watcher의 자동 reload 가능성 때문에 새로고침 승인을 과거 세션에서 재사용하지 않고, 도구 연결 중단 시 복구 보장을 확대하지 않는다.

## 변경 이유

현대·SK 프론트 분리 결과와 LG 검색의 후속 설계 경계를 승인된 CF-46 근거로 기록했다.

현대 최신 검증은 주소의 유일 결과·modal cleanup, 국적1 `KR`와 국적2 불변, 학력 그룹별 준비·재분석, 실제 학교 `school`·전공 `basic` auto-type을 확인했다. 설치 smoke는 고교·학사 2행과 주소·국적1을 독립 대조했고, API 7회가 모두 HTTP 200/ADAPTER/COMPLETE였다. UI 38/0은 writer 집계이며 전체 성공이 아니고, 저장·제출과 실제 toolbar icon 클릭은 검증하지 않았다.

## Greeting 플랫폼 경계

BE는 기존 등록 회사 정책을 우선한 뒤 `site.host`와 지원서 `pathPattern`으로 Greeting 연결을 판정한다. 정확한 Greeting 기본 도메인 또는 제한된 DNS CNAME 조회에서 Greeting으로 이어지는 별칭을 확인하면 하나의 공통 정책을 선택한다. 기업별 자체 도메인 허용 목록은 사용하지 않는다. DNS 조회 시간·동시성·체인 길이·캐시 크기를 제한하며 조회 오류는 차단한다. CNAME 근거가 없다는 결과를 비-Greeting 확정으로 표현하지 않는다.

FE는 SK·현대의 기존 선택 우선순위를 유지하며 유일한 최상위 `basicInformation.name`, `basicInformation.phoneNumber.nationalNumber` 입력과 소유한 Greeting field 구조 등 공통 DOM 속성으로 화면 어댑터를 선택한다. 수집·준비·입력·재검증에서 일관된 선택을 유지하고 DOM 변경 때문에 검증된 Greeting 입력을 범용 실행기로 낮추지 않는다. 정적·범용 분석의 최종 결정은 BE가 담당하며 Greeting 화면에 범용 응답이 오면 입력을 중단한다.

`routingContext`, `executionAdapterId`, Greeting 전용 capability/header와 사용자별 토큰·만료·서버 메모리는 사용하지 않는다. 도메인별 DNS 결과 캐시는 내부 성능 최적화이며 사용자 세션 계약이 아니다. 준비 API → 필요한 준비 동작·재수집 → 필드 매핑 API → 로컬 값 결합·입력 순서를 유지하고, 서버 어댑터 지정을 위한 추가 준비 요청은 만들지 않는다. 기존 주소 검색 capability와 공통 입력 명령은 유지한다.

이름 없는 이메일 combobox는 `이메일주소` 또는 `이메일`이라는 단일 소유 라벨과 유일한 칸을 확인한 경우에만 연결한다. 값 입력과 이메일 확인을 분리한다. 메디퀴터스 설치 확장에서 비식별 기본 필드 3개 입력을 확인했으며, 다른 Greeting 화면의 전 항목 성공으로 확대하지 않는다. 필드별 경계는 [Greeting 근거](../../raw/issues/CF-94/documents/adapter-greeting.md)에 기록했다.

아래 설치 확장 관측은 2026-09-28 라우팅 단순화 이전의 증거다. 기존 필드 지원의 근거로 보존하며 이번 수정의 브라우저 재검증으로 취급하지 않는다. 이후 카카오게임즈 필드 확장의 실화면 관측과 최신 수정본 검증 한계는 별도 후속 절에 기록한다.

이전 설치 확장 관측은 DNS/DOM 자동 판별 이전의 증거다. DNS/DOM 판별은 합성 회귀·정적 검사·빌드와 로컬 서버의 DNS/API 응답으로 검증했다. 이후 필드 확장의 카카오게임즈 설치 브라우저 관측은 별도이며 최신 수정본의 빈 지원서 전체 실행과 재실행은 아직 확정하지 못했다.

## Greeting 필드 확장 후속 경계

고교·대학 추가전공·경력·어학·자격증을 기존 BE 정책과 FE 실행기로 연결했다. 대학 추가전공은 기존 DERIVED 형식의 공통 규칙 목록을 확장하며 준비·필드 API의 필드는 추가하지 않는다. 수집·행 준비·검색 선택·재수집·결과 확인을 함께 검증한다. 최신 설치 브라우저 전체 실행은 확정하지 못했으며 상세 지원 범위와 관측 한계는 Greeting 어댑터 및 필드 현황을 따른다.

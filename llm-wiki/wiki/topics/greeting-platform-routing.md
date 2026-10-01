# Greeting 플랫폼 판정과 실행 어댑터

> Topic: greeting-platform-routing
> Status: Current
> Current: [CF-94 승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)
> History: [CF-94 승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)
> Updated: 2026-09-28

## 현재 상태

BE는 기존 등록 회사 정책을 우선한 뒤 `site.host`와 지원서 `pathPattern`으로 Greeting 연결을 판정한다. 정확한 Greeting 기본 도메인 또는 제한된 DNS CNAME 조회에서 Greeting으로 이어지는 별칭을 확인하면 하나의 공통 정책을 선택한다. 기업별 자체 도메인 허용 목록은 사용하지 않는다. DNS 조회 시간·동시성·체인 길이·캐시 크기를 제한하며 조회 오류는 차단한다. CNAME 근거가 없다는 결과를 비-Greeting 확정으로 표현하지 않는다.

FE는 SK·현대의 기존 선택 우선순위를 유지하며 유일한 최상위 `basicInformation.name`, `basicInformation.phoneNumber.nationalNumber` 입력과 소유한 Greeting field 구조 등 공통 DOM 속성으로 화면 어댑터를 선택한다. 수집·준비·입력·재검증에서 일관된 선택을 유지하고 DOM 변경 때문에 검증된 Greeting 입력을 범용 실행기로 낮추지 않는다. 정적·범용 분석의 최종 결정은 BE가 담당하며 Greeting 화면에 범용 응답이 오면 입력을 중단한다.

`routingContext`, `executionAdapterId`, Greeting 전용 capability/header와 사용자별 토큰·만료·서버 메모리는 사용하지 않는다. 도메인별 DNS 결과 캐시는 내부 성능 최적화이며 사용자 세션 계약이 아니다. 준비 API → 필요한 준비 동작·재수집 → 필드 매핑 API → 로컬 값 결합·입력 순서를 유지하고, 서버 어댑터 지정을 위한 추가 준비 요청은 만들지 않는다. 기존 주소 검색 capability와 공통 입력 명령은 유지한다.

## 변경 이유

기업별 등록 없이 Greeting 공통 구조를 재사용하면서 전용 라우팅 API 필드와 사용자 토큰을 없앤다. 상세 결정은 [승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)을 따른다.

이전 설치 확장 관측은 DNS/DOM 자동 판별 이전의 증거다. DNS/DOM 판별은 합성 회귀·정적 검사·빌드와 로컬 서버의 DNS/API 응답으로 검증했다. 이후 필드 확장의 카카오게임즈 설치 브라우저 관측은 별도이며 최신 수정본의 빈 지원서 전체 실행과 재실행은 아직 확정하지 못했다.

## Greeting 필드 확장 후속 경계

고교·대학 추가전공·경력·어학·자격증을 기존 BE 정책과 FE 실행기로 연결했다. 대학 추가전공은 기존 DERIVED 형식의 공통 규칙 목록을 확장하며 준비·필드 API의 필드는 추가하지 않는다. 수집·행 준비·검색 선택·재수집·결과 확인을 함께 검증한다. 최신 설치 브라우저 전체 실행은 확정하지 못했으며 상세 지원 범위와 관측 한계는 Greeting 어댑터 및 필드 현황을 따른다.

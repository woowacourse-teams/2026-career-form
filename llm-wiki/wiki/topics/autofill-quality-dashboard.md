# 사이트별 자동 입력 결과와 일별 그래프

> Topic: autofill-quality-dashboard
> Status: Current
> Current: [CF-184 사이트별 결과와 일별 그래프](../../raw/issues/CF-184/documents/autofill-quality-dashboard.md)
> History: [CF-184 사이트별 결과와 일별 그래프](../../raw/issues/CF-184/documents/autofill-quality-dashboard.md)
> Updated: 2026-10-14

## 현재 상태

주요 비율은 결과를 받은 항목의 분자와 분모를 합산하고 계산 기준 건수와 제외량을 함께 제공한다. 기존 전체 실행 기준 필드는 유지하며 사람 확인 기준은 별도 표와 그래프로 표시한다.

기존 회사 식별과 그리팅 회사별 사이트를 유지하고 집계 전용 `/api/v1/quality/stats/sites`에서 도메인과 회사 구분 정보로 사이트를 선택한다. 기존 관리 API 권한은 열지 않는다.

KST 일별 추이는 사이트, 입력 방식, 버전별로 구분한다. 없는 날짜는 비율 null과 실행 수 0으로 채우며 선을 연결하지 않는다. 날짜를 채운 뒤에도 500개 그룹과 최대 90일 조회 제한을 적용한다.

## 변경 이유

과거 미보고 실행이 새 정상 결과의 비율을 가리지 않도록 관측 표본의 성능과 결과 수집 범위를 함께 표시한다. 회사별 사이트 비교와 일별 변화를 쉬운 이름으로 확인한다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
- [품질 확인 사이트와 공개 지원서 링크](quality-site-links.md)

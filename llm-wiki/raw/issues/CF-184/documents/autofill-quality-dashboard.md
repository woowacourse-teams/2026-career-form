# 사이트별 자동 입력 결과와 일별 그래프

## 관측 결과의 비율

주요 비율은 결과를 받은 항목의 분자와 분모 합으로 계산한다. 기존 전체 실행 기준 필드의 의미를 유지하고 새 `observed` 응답에 지표별 비율, 분자, 분모, 포함한 표본 수와 제외량을 제공한다. 개별 비율을 평균하지 않고 보고가 없는 결과를 성공이나 실패로 계산하지 않는다. 사람 확인 기준은 별도 표와 그래프로 표시하며 정답률이 아니다.

입력값 준비율은 보고된 연결 칸 중 값이 준비된 칸 비율이다. 입력 성공률은 입력 결과를 받은 시도 칸, 입력 후 1초 유지율은 유지 결과를 받은 성공 칸을 분모로 사용한다. 전체 칸 대비 입력 유지율은 필요한 필드, 입력, 유지 결과와 같은 칸 대응이 확인된 실행의 수집 칸을 분모로 한정한다. 계산 기준 건수와 결과 누락, 제외량을 함께 표시한다.

## 회사별 사이트 조회

사이트별 조회는 기존 회사 식별과 그리팅 회사별 사이트를 유지한다. 확인되지 않은 사이트를 임의로 합치지 않는다. 새로운 회사명을 수집하거나 외부 사이트를 조회하지 않고 기존 도메인과 회사 구분 정보를 표시한다.

집계 전용 사이트 선택 API는 `GET /api/v1/quality/stats/sites`다. 표시 이름과 실제 필터 값을 구분하며 환경, 날짜, 입력 방식, 버전, 화면 구조 범위를 적용한다. 집계 전용 Bearer 자격으로 조회할 수 있지만 기존 관리 API의 권한은 열지 않는다. 회사 전용, 그리팅 전용, 범용은 입력 방식의 구분이며 채용 플랫폼별 집계와 같은 의미가 아니다.

## KST 일별 추이

사이트별 일별 조회는 `SITE_VERSION_TREND`로 사이트, 입력 방식, 버전을 구분한다. 기존 `VERSION_TREND`는 사이트를 합산하는 범위를 유지한다. 시각은 KST 자정을 UTC ISO 형식으로 제공한다.

없는 날짜는 비율 null과 실행 수 0으로 채운다. Grafana는 비율을 0으로 대체하거나 빈 구간을 선으로 연결하지 않는다. 최대 90일 범위를 유지하고 날짜를 채운 뒤에도 500개 그룹 제한을 적용한다. 표와 그래프는 동일한 필터와 집계를 사용하며 같은 날짜의 계산 기준을 상세 표에서 확인한다.

## 구현과 검증 근거

- `backend/src/main/java/com/careerform/quality/QualityObservedStats.java`: 지표별 같은 표본의 분자와 분모 합산.
- `backend/src/main/java/com/careerform/quality/QualityStats.java`: 사이트 식별 보존, 일별 공백과 그룹 제한.
- `backend/src/main/java/com/careerform/quality/QualityStatsController.java`, `QualityApiFilter.java`: 읽기 전용 사이트 선택 API 경계.
- `backend/src/test/java/com/careerform/quality/QualityObservedStatsTest.java`, `QualityStatsTrendTest.java`, `QualityStatsHttpTest.java`: 혼합 표본, 가중 합산, 필터, 공백, 직렬화와 접근 경계.
- `infra/monitoring/grafana/dashboards/autofill-quality.json`, `infra/tests/test_quality_dashboard.py`: 쉬운 이름, 사이트별 비교와 격리 Grafana의 합성 시계열 검증.

검증은 합성 데이터와 로컬 환경을 사용했다. 실제 배포와 스테이징 화면 확인은 사람 담당이다.

# 부하테스트 대시보드

기존 모니터링 서버의 Grafana에 `부하테스트` 폴더를 provisioning합니다.
추가 Grafana 서버나 exporter는 필요하지 않으며 기존 Prometheus 데이터를 사용합니다.

- 운영서버 상태: `/d/cf-loadtest-server`
- DB 상태: `/d/cf-loadtest-db`

기본 환경은 prod, 조회 범위는 최근 30분, 갱신은 30초입니다.
상단 링크는 환경 변수와 시간 범위를 유지합니다. 부하 실행 전후를 포함해 절대 시간 범위를 선택하면 비교하기 좋습니다.
운영서버의 환경과 서버는 각각 선택합니다. prod는 career-prod,
dev/staging은 career-dev-staging에 대응합니다.
DB 서버 지표는 공용 서버 전체 부하이며 앱 풀/호출 지표만 환경별입니다.
DB 지연 분위수는 5분 구간을 사용하며 P50/P95/P99 모두 표본 20개 이상에서 표시합니다.
데이터 없음은 0이나 정상 상태가 아닙니다. 수집 문제는 기존 모니터링 대시보드에서 확인하세요.

배포 담당자는 compose.yaml, dashboards.yaml과 이 디렉터리를 함께 반영하고
기존 절차로 Grafana 컨테이너를 재생성해야 새 bind mount가 적용됩니다.
MongoDB staging 알림의 40자 초과 UID 3개는 레포에서 단축했습니다.
서버에 기존 설정이 남아 있다면 서버 설정도 함께 수정한 후 Grafana를 재생성해야 합니다.
JSON은 UI Import로도 사용할 수 있습니다. 데이터소스 UID는 prometheus입니다.
운영 서버 적용과 실측 그래프 확인은 아직 수행하지 않았습니다.

# 공용 모니터링 시스템

> Topic: monitoring-system
> Status: Current
> Current: [CF-158 장애 분석 로그와 외부 호출 P95](../../raw/issues/CF-158/documents/monitoring-system.md)
> History: [CF-158 장애 분석 로그와 외부 호출 P95](../../raw/issues/CF-158/documents/monitoring-system.md); [CF-131 공용 모니터링 구성과 관측 경계](../../raw/issues/CF-131/documents/monitoring-system.md); [CF-144 공용 모니터링과 호스트 디스크 알림](../../raw/issues/CF-144/documents/monitoring-system.md); [CF-151 dev 호스트 루트 디스크 임계값 95%](../../raw/issues/CF-151/documents/monitoring-system.md); [CF-154 Grafana HTTP 접속과 수동 반영](../../raw/issues/CF-154/documents/monitoring-system.md)
> Updated: 2026-10-06

## 현재 상태

호스트별 Alloy가 dev/staging/prod의 로그와 메트릭을 중앙 Loki/Prometheus로
전송하고 Grafana가 환경별 조회와 Discord 알림을 담당한다. 공용 호스트 자원은
환경별로 중복 집계하지 않는다. Grafana UI는 Nginx HTTP 80에서 내부 grafana:3000으로 전달한다. 필수
MONITORING_PUBLIC_URL이 외부 링크와 Live Origin의 기준이며 Grafana 로그인과
Viewer 계정으로 조회한다. 수집용 3100/9090에는 별도의 IP 제한과 Basic 인증을
유지하고 Docker socket 접근은 높은 권한으로 취급한다. HTTP는 암호화되지 않는다.

develop/main 머지만으로 중앙 모니터링 설정이 자동 배포되지는 않는다. 운영자가
compose.yaml과 proxy.conf를 백업 후 반영하고 Grafana, Nginx를 재생성한다.
실제 서버 배포와 조회 사용자 접속 검증은 사람이 수행한다.

중앙 보존 정책은 Loki 7일과 Prometheus 14일이며 gp3 루트 EBS 16GiB를 사용한다.
t4g.micro의 실제 용량과 메모리 적합성, AWS 배포와 Discord 수신은 미검증이다.
공용 서버 중단은 중앙 조회와 Grafana 알림도 중단시킨다. S3, cron, HA와 외부
감시는 범위에서 제외한다. 상세 결정과 근거는 Current 문서를 따른다.

루트 디스크 사용률은 호스트당 한 규칙으로 `career-dev-staging` 95% 이상,
`career-prod` 90% 이상이 5분 지속되면 장애로 평가한다. 실측 사용률이 각 임계값
미만이면 복구한다. dev와 staging은 같은 호스트를 공유한다. host 지표와 규칙은 앱 env와 분리하며
`career-monitor`의 기존 80% 규칙은 유지한다. 기존 Discord receiver와 10분 반복
정책을 사용하고 `instance`별로 통지를 분리한다.

호스트 디스크 규칙은 No Data와 쿼리 오류에 KeepLast를 적용한다. 직전 상태와
Pending 시작 시각을 유지하며 측정 실패를 디스크 초과나 복구로 취급하지 않는다.
미측정 메시지는 `측정 불가`로 표시한다. Pending 누락 구간도 경과 시간에 포함되고
수집 실패 자체의 별도 통지는 없으므로 alert instance 상태 사유와 시계열 최신
시각을 확인한다. 로컬 합성 장애, 복구 검증과 실제 서버 반영 및 Discord 수신은
구분한다.

CF-158에서 기존 일반 로그를 유지하며 상태 코드별 3xx/4xx/5xx 추이, 서버 오류,
API별 지연 기준 초과와 외부 실패 로그를 추가했다. 지연 기준은 분석 20초,
interaction 5초, 기타 API 2초 초과이며 Actuator를 제외한다.
외부 성공 P95는 provider, operation별 15분 이동 구간으로 계산하고 결과별 건수와
표본 상태를 함께 표시한다. 성공 0건은 데이터 없음, 20건 미만은 표본 부족이다.
100ms~60초 히스토그램과 기존 5초, 20초 SLO 버킷을 사용한다.
상태 코드와 requestId 연결은 환경과 시간을 보존한다. 관련 로그는 다른 필터를
해제하고 시간순으로 조회한다. 빈 선택은 조회하지 않으며 신규 로그는 최대 500줄이다.
최근 30초 scrape 상태는 Loki 전송 정상의 근거가 아니다. 빈 결과, 쿼리 오류와
API_RESULT 파싱 실패를 구분하고 기존 알림과 timeout은 유지한다.

## 변경 이유

기존 health와 Docker 로그 회전만으로 제공되지 않았던 중앙 관측 경로를 추가했다.
난수 요청 ID와 비식별 로그 경계, 초기 scrape의 계수 한계, 컨테이너 교체 뒤
DNS 재조회 복구를 승인된 근거로 기록했다. 기존 배포 Runbook은 대체하지 않는다.
CF-144에서 앱 호스트의 디스크 고갈을 독립적으로 감시하도록 범위를 추가하고,
측정 실패만으로 잘못된 장애나 복구 통지를 만들지 않는 정책을 기록했다.
CF-151에서 dev/staging의 기존 규칙 UID를 유지하며 임계값을 95%로 조정했다.
prod 90%와 monitor 80%, 기존 지속 시간과 통지 정책은 유지한다. 95%는 남은
공간이 적어 이미지 다운로드와 로그 증가에 대응할 여유가 줄어든다.

CF-154에서 조회 사용자의 SSH 없는 조회를 위해 HTTP 진입점을 추가하고, 수집 인증과 UI
인증 적용 범위를 분리했다. 수동 반영, 복구 절차와 로컬 검증 경계를 함께 기록했다.

CF-158에서 개별 로그 확인을 줄이기 위해 조건이 적용된 패널과 요청 연결을 추가했다.
P95 표본과 수집 상태의 해석 한계를 함께 기록했다.

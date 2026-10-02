# 공용 모니터링 시스템

> Topic: monitoring-system
> Status: Current
> Current: [CF-144 공용 모니터링과 호스트 디스크 알림](../../raw/issues/CF-144/documents/monitoring-system.md)
> History: [CF-131 공용 모니터링 구성과 관측 경계](../../raw/issues/CF-131/documents/monitoring-system.md); [CF-144 공용 모니터링과 호스트 디스크 알림](../../raw/issues/CF-144/documents/monitoring-system.md)
> Updated: 2026-10-02

## 현재 상태

호스트별 Alloy가 dev/staging/prod의 로그와 메트릭을 중앙 Loki/Prometheus로
전송하고 Grafana가 환경별 조회와 Discord 알림을 담당한다. 공용 호스트 자원은
환경별로 중복 집계하지 않는다. Grafana UI는 SSH 터널, 수집 구간은 IP 제한과
인증을 사용하며 Docker socket 접근은 높은 권한으로 취급한다.

중앙 보존 정책은 Loki 7일과 Prometheus 14일이며 gp3 루트 EBS 16GiB를 사용한다.
t4g.micro의 실제 용량과 메모리 적합성, AWS 배포와 Discord 수신은 미검증이다.
공용 서버 중단은 중앙 조회와 Grafana 알림도 중단시킨다. S3, cron, HA와 외부
감시는 범위에서 제외한다. 상세 결정과 근거는 Current 문서를 따른다.

`career-dev-staging`과 `career-prod`의 루트 디스크 사용률은 호스트당 한 규칙으로
90% 이상, 5분 지속 평가한다. host 지표와 규칙은 앱 env와 분리하며
`career-monitor`의 기존 80% 규칙은 유지한다. 기존 Discord receiver와 10분 반복
정책을 사용하고 `instance`별로 통지를 분리한다.

새 디스크 규칙은 No Data와 쿼리 오류에 KeepLast를 적용한다. 직전 상태와
Pending 시작 시각을 유지하며 측정 실패를 디스크 초과나 복구로 취급하지 않는다.
미측정 메시지는 `측정 불가`로 표시한다. Pending 누락 구간도 경과 시간에 포함되고
수집 실패 자체의 별도 통지는 없으므로 alert instance 상태 사유와 시계열 최신
시각을 확인한다. 로컬 합성 장애, 복구 검증과 실제 서버 반영 및 Discord 수신은
구분한다.

## 변경 이유

기존 health와 Docker 로그 회전만으로 제공되지 않았던 중앙 관측 경로를 추가했다.
난수 요청 ID와 비식별 로그 경계, 초기 scrape의 계수 한계, 컨테이너 교체 뒤
DNS 재조회 복구를 승인된 근거로 기록했다. 기존 배포 Runbook은 대체하지 않는다.
CF-144에서 앱 호스트의 디스크 고갈을 독립적으로 감시하도록 범위를 추가하고,
측정 실패만으로 잘못된 장애나 복구 통지를 만들지 않는 정책을 기록했다.

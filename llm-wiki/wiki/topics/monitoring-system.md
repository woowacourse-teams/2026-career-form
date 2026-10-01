# 공용 모니터링 시스템

> Topic: monitoring-system
> Status: Current
> Current: [CF-131 공용 모니터링 구성과 관측 경계](../../raw/issues/CF-131/documents/monitoring-system.md)
> History: [CF-131 공용 모니터링 구성과 관측 경계](../../raw/issues/CF-131/documents/monitoring-system.md)
> Updated: 2026-09-30

## 현재 상태

호스트별 Alloy가 dev/staging/prod의 로그와 메트릭을 중앙 Loki/Prometheus로
전송하고 Grafana가 환경별 조회와 Discord 알림을 담당한다. 공용 호스트 자원은
환경별로 중복 집계하지 않는다. Grafana UI는 SSH 터널, 수집 구간은 IP 제한과
인증을 사용하며 Docker socket 접근은 높은 권한으로 취급한다.

중앙 보존 정책은 Loki 7일과 Prometheus 14일이며 gp3 루트 EBS 16GiB를 사용한다.
t4g.micro의 실제 용량과 메모리 적합성, AWS 배포와 Discord 수신은 미검증이다.
공용 서버 중단은 중앙 조회와 Grafana 알림도 중단시킨다. S3, cron, HA와 외부
감시는 범위에서 제외한다. 상세 결정과 근거는 Current 문서를 따른다.

## 변경 이유

기존 health와 Docker 로그 회전만으로 제공되지 않았던 중앙 관측 경로를 추가했다.
난수 요청 ID와 비식별 로그 경계, 초기 scrape의 계수 한계, 컨테이너 교체 뒤
DNS 재조회 복구를 승인된 근거로 기록했다. 기존 배포 Runbook은 대체하지 않는다.

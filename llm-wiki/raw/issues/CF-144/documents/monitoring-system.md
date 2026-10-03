# 공용 모니터링과 호스트 디스크 알림

> Issue: [CF-144](https://github.com/woowacourse-teams/2026-career-form/issues/144)
> Approval-Digest: 7e3be48100b9de605c9003b848f9799f83f06d952fabc568c025ee7996026056
> Collected: 2026-10-02
> Source-Revision: b8d419b74e081f1d7b248e477e58287cf1819b80

## 승인한 지식 후보

1. 호스트 디스크 감시는 애플리케이션 env와 분리한다. career-dev-staging과 career-prod의 루트 디스크를 호스트당 한 규칙으로 90% 이상, 5분 지속 평가한다. career-monitor의 기존 80% 규칙은 유지하고 career-discord의 10분 반복 정책을 상속하며 instance별로 통지를 분리한다.

2. 새 호스트 디스크 규칙의 No Data와 쿼리 오류는 KeepLast로 처리한다. Normal, Pending, Alerting과 Pending 시작 시각을 유지하고 측정 실패만으로 장애나 복구를 통지하지 않는다. 미측정 사용률은 측정 불가로 표시한다. 누락 구간도 Pending 경과 시간에 포함되므로 Grafana alert instance 상태 사유와 Prometheus 시계열 최신 시각을 함께 확인한다.

## 유지하는 기존 구성

호스트별 Alloy, 중앙 Loki/Prometheus 저장과 Grafana 조회, SSH 터널과 인증,
보존 기간과 자원 적합성의 관측 경계는
[CF-131의 승인 근거](https://github.com/woowacourse-teams/2026-career-form/blob/308f18bae459ba8a68214f9c97f22ed141dfe44f/llm-wiki/raw/issues/CF-131/documents/monitoring-system.md)를 유지한다.
요청 로그의 비식별 경계, 메트릭의 첫 scrape 한계와 컨테이너 교체 뒤 DNS 재조회
복구 결정도 유지한다. CF-144는 앱 호스트의 루트 디스크 규칙과 통지 그룹을 추가한다.

## 구현 근거와 검증 경계

- [호스트별 규칙과 메시지](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/monitoring/grafana/provisioning/alerting/rules-hosts.json)
- [통지 그룹과 기존 반복 정책](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/monitoring/grafana/provisioning/alerting/policies.json)
- [기존 monitoring 80% 규칙](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/monitoring/grafana/provisioning/alerting/rules.json)
- [실제 쿼리의 경계값과 지속 시간 시험](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/tests/test_monitoring_host_disk.py)
- [Grafana 장애, 복구와 KeepLast 시험](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/tests/test_monitoring_disk_runtime.py)
- [운영 확인 절차](https://github.com/woowacourse-teams/2026-career-form/blob/b8d419b74e081f1d7b248e477e58287cf1819b80/infra/monitoring/README.md)

실제 provisioning 쿼리로 89%, 90%, 91%, 5분 미만 초과, 5분 지속과 복구를
합성 시계열로 확인했다. 격리된 Grafana에서 실제 5분 대기와 두 호스트의
장애 및 실측 89% 복구 메시지를 mock Discord receiver로 확인했다.
데이터 누락과 쿼리 오류 중 Normal, Pending, Alerting 유지, Pending 시작 시각
유지와 미측정 메시지 표기를 확인했다.

KeepLast는 수집 실패 자체를 별도 Discord 알림으로 보내지 않는다.
Pending 누락 구간도 경과 시간에 포함되고 기존 장애의 반복 통지는 이어질 수 있다.
Grafana rule health가 ok여도 alert instance의 상태 사유와 시계열 최신 시각을
확인한다. 실제 서버 반영, 실제 Discord 수신과 10분 반복의 실시간 수신 확인은
사람 담당 범위이며 이 로컬 검증으로 완료됐다고 해석하지 않는다.

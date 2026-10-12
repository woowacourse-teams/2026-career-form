# dev 호스트 루트 디스크 임계값 95%

> Issue: [CF-151](https://github.com/woowacourse-teams/2026-career-form/issues/151)
> Collected: 2026-10-03
> Approval-Digest: 775160facdfcfd37acb841ce7fabf5338b75644155897a0d05e3243b01a98189
> Source-Revision: 7c81d191c810991aabe856699e680dd75e91df2a

## 승인한 지식 후보

CF-151에서 career-dev-staging 공유 호스트의 루트 디스크 알림 임계값을 90%에서 95%로 변경한다. 기존 UID와 mountpoint=/ 고정 쿼리, 5분 지속, 실측 임계값 미만 복구, No Data와 datasource error의 KeepLast, Discord 복구 통지와 10분 반복 정책을 유지한다. prod 90%와 career-monitor 80%는 유지한다. 95%는 남은 공간이 적어 이미지 다운로드와 로그 증가에 대응할 여유가 줄어든다. 로컬 합성 시계열과 격리된 Grafana 검증은 실제 서버 반영 및 Discord 수신 확인과 구분하며 운영 반영은 사람이 수행한다.

## 유지하는 기존 구성

공용 수집, 보존, 접근 경계와 호스트별 통지 그룹은
[CF-144의 승인 근거](https://github.com/woowacourse-teams/2026-career-form/blob/aa48f46394d5660a67f7abf6d2eb4a47b9ae4e74/llm-wiki/raw/issues/CF-144/documents/monitoring-system.md)를 유지한다.
dev와 staging은 하나의 EC2를 공유하므로 95% 기준은 공유 호스트 전체에 적용된다.
기존 `cf-host-dev-staging-disk-full` UID를 유지하며 규칙을 추가하지 않는다.
host 지표와 규칙은 앱 env와 분리하고 대시보드 선택과 무관하게 평가한다.

KeepLast는 Normal, Pending, Alerting과 Pending 시작 시각을 유지한다.
측정 실패를 사용률 초과나 복구로 취급하지 않으며 누락 구간도 Pending 경과 시간에
포함된다. 수집 실패 자체의 별도 통지는 없고 기존 장애의 반복 통지는 이어질 수 있다.
alert instance 상태 사유와 시계열 최신 시각을 함께 확인한다.

## 구현 근거와 검증 경계

- [호스트별 규칙과 메시지](https://github.com/woowacourse-teams/2026-career-form/blob/7c81d191c810991aabe856699e680dd75e91df2a/infra/monitoring/grafana/provisioning/alerting/rules-hosts.json)
- [실제 쿼리의 경계값과 지속 시간 시험](https://github.com/woowacourse-teams/2026-career-form/blob/7c81d191c810991aabe856699e680dd75e91df2a/infra/tests/test_monitoring_host_disk.py)
- [Grafana 장애, 복구와 KeepLast 시험](https://github.com/woowacourse-teams/2026-career-form/blob/7c81d191c810991aabe856699e680dd75e91df2a/infra/tests/test_monitoring_disk_runtime.py)
- [운영 확인 절차](https://github.com/woowacourse-teams/2026-career-form/blob/7c81d191c810991aabe856699e680dd75e91df2a/infra/monitoring/README.md)

promtool로 실제 provisioning 쿼리의 dev/staging 94%, 95%, 96%, 5분 미만 초과,
5분 지속과 복구를 검증했다. prod 89%, 90%, 91%와 monitor 79%, 80%, 81%도
같이 검증했다. 격리된 Grafana에서 실제 5분 대기, 장애 통지와 dev/staging의
실측 94% 복구 통지를 mock receiver로 확인했다. Normal, Pending, Alerting의
측정 실패 중 상태 유지, Pending 시작 시각 유지와 미측정 메시지 표기도 확인했다.
디스크 통합 테스트 6개가 통과했다.

실제 서버 반영과 Discord 수신, 10분 반복 통지의 실제 수신 확인은 사람이 수행한다.
실제 서버 디스크를 채우지 않았으며 로컬 검증을 운영 반영 완료로 해석하지 않는다.

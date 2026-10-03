# Grafana HTTP 접속과 수동 반영

> Issue: [CF-154](https://github.com/woowacourse-teams/2026-career-form/issues/154)
> Collected: 2026-10-03
> Approval-Digest: 2668b9f7c5e2968895780831f9e889ad176c65919d2f21bc26fe184e6bd9016b
> Source-Revision: 732932774645a1576264520f3f4c5c4ba6e6d1d3

## 승인한 지식 후보

모니터링 UI는 Nginx HTTP 80에서 내부 grafana:3000으로 전달하며, 외부 링크와 Live Origin 기준은 필수 MONITORING_PUBLIC_URL로 지정한다. 수집용 3100/9090의 Basic 인증과 IP 제한은 해당 server에만 적용한다.

모니터링 설정은 develop/main 머지로 자동 배포되지 않는다. 운영자는 compose.yaml과 proxy.conf를 백업 후 반영하고 Grafana와 Nginx만 재생성하며, 검프에게 Viewer 계정을 제공한다. 실제 서버 배포와 접속 검증은 사람이 수행한다.

## 유지하는 기존 구성

[CF-151의 기존 근거](https://github.com/woowacourse-teams/2026-career-form/blob/f4dedd27f83759a9b8e759e9bc9c31b52f26fee4/llm-wiki/raw/issues/CF-151/documents/monitoring-system.md)에 기록한 수집·보존·디스크 알림 기준을 유지한다.
UI의 SSH 필수 접근만 HTTP 진입점으로 대체하며 Grafana의 호스트 3000은 loopback으로 유지한다.
HTTP는 암호화되지 않으며 운영자가 허용 원본 범위를 확인한다. HTTPS는 이번 범위 밖이다.

## 구현 근거와 검증 경계

- [Nginx 진입점과 수집 접근 제한](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/infra/monitoring/proxy.conf)
- [포트와 외부 URL 설정](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/infra/monitoring/compose.yaml)
- [Viewer 세션과 Live 연결 시험](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/infra/tests/monitoring_proxy_checks.py)
- [반영·복구 절차](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/infra/monitoring/README.md)
- [로컬 검증 기록](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/infra/monitoring/VERIFICATION.md)

로컬 macOS에서 격리한 Linux ARM64 컨테이너로 중앙 스택 통합 시험 15개를 확인했다.
실제 AWS 배포, 검프 계정 생성·외부 접속과 실제 Discord 수신은 미실행이며 사람이 확인한다.

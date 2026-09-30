# 공용 모니터링 구성과 관측 경계

> Issue: [CF-131](https://github.com/woowacourse-teams/2026-career-form/issues/131)
> Approval-Digest: c4372b8759c34da242143a1bda83d89131652f1d19a6bb4c4f702424ae12c02b
> Collected: 2026-09-30

## 승인한 지식 후보

1. dev/staging/prod 공용 중앙 서버에서 Loki는 로그, Prometheus는 메트릭을 EBS에 저장하고 Grafana는 조회와 환경별 Discord 알림을 담당한다. 앱 호스트별 Alloy 하나를 두어 dev/staging 공용 호스트 지표의 이중 집계를 피한다.

2. Grafana UI는 SSH 터널의 loopback 경로로 제공한다. 중앙 수집은 앱 호스트 IP allowlist와 Basic 인증을 함께 사용하며 관리 포트를 공개하지 않는다. Docker socket 접근은 root 수준 권한으로 취급한다.

3. 중앙 Loki 로그 7일과 Prometheus 메트릭 14일을 gp3 루트 EBS 16GiB에 보존한다. t4g.micro의 RAM과 저장량 적합성은 실제 측정 전에는 확정하지 않으며 공용 서버 중단 시 중앙 조회와 Grafana 알림도 중단된다. S3, cron, HA와 외부 감시는 제외한다.

4. 요청 ID는 서버 난수로 생성하고 로그 본문과 MDC에만 사용한다. 경로 패턴과 타입, 상태, 시간만 기록하며 원문과 예외 메시지는 제외한다. 메트릭 증가량은 첫 scrape 이전 사건을 놓칠 수 있고 무트래픽과 환경 수집 소실은 별도 알림 쿼리로 구분한다.

5. 중앙 컨테이너 교체로 IP가 바뀔 때 Nginx의 시작 시점 DNS 해석만으로는 수집이 복구되지 않았다. Docker DNS를 동적으로 재조회하도록 구성하고 실제 IP 변경 뒤 인증된 로그 전송 복구를 합성 회귀 시험으로 확인한다.

## 구현 근거와 검증 경계

- [운영 구성과 수동 설치](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/infra/monitoring/README.md)
- [자동 시험과 미확인 운영 항목](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/infra/monitoring/VERIFICATION.md)
- [중앙 Compose](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/infra/monitoring/compose.yaml)
- [호스트별 Alloy](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/infra/monitoring/alloy/config.alloy)
- [요청 로그 경계](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/backend/src/main/java/com/careerform/monitoring/RequestObservationFilter.java)
- [외부 호출 계측](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/backend/src/main/java/com/careerform/monitoring/ExternalCallMetrics.java)
- [IP 변경 복구 시험](https://github.com/woowacourse-teams/2026-career-form/blob/4f97e227f281b6c2be04c40fd5be5dd78f3da371/infra/tests/test_monitoring_runtime.py)

구현과 로컬 합성 검증을 실제 AWS 배포나 Discord 수신 성공으로 해석하지 않는다.
보존 기간의 실제 만료, 용량과 메모리 적합성, 10분 반복 통지와 남은 운영 시나리오는
검증 기록에 별도로 남긴다. 실제 값, 계정, 세션과 시크릿은 이 근거에 포함하지 않는다.

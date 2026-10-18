# 공용 MongoDB 관측과 수집 신뢰성

> Issue: [CF-207](https://github.com/woowacourse-teams/2026-career-form/issues/207)
> Collected: 2026-10-13
> Approval-Digest: a6f687d3bd725214fa37de4509a5f0ba195e8fb80ffe2272f2a4381f9acffa2b
> Source-Revision: cbd283762b4b30a485f1ce8be1f48680d00c65cb

## 승인한 지식 후보

공용 DB 자원은 한 번 수집한다. 앱 풀은 환경, 인스턴스, 풀별로, 호출은 환경,
인스턴스, 작업별로 구분한다. 명령 왕복, 전체 호출, 서버 로그의 내부 시간은
별도 지표다.

DB 로그는 허용 필드만 전송한다. HTTP requestId와 드라이버 ID를 구분하고,
시작 시 저장한 문맥을 비동기 완료 로그에 사용한다.

수집 누락과 낮은 표본은 복구 근거가 아니다. 중앙 단절 중 수집기 재시작에서는
로그 유실이 관찰됐으며, 중앙 모니터링 중단은 독립 감시가 필요하다.

## 유지하는 기존 구성

[CF-158의 기존 근거](https://github.com/woowacourse-teams/2026-career-form/blob/914d811a3919defbee3aced12d706c57ba63942e/llm-wiki/raw/issues/CF-158/documents/monitoring-system.md)에 기록한
일반 로그, 요청 연결과 외부 호출 P95를 유지한다. 기존 앱 호스트 디스크 알림,
수집 인증, 보존 정책과 수동 반영 경계도 유지한다.

## 구현 근거와 검증 경계

- [수집 원본, 단위, 설치 절차와 한계](https://github.com/woowacourse-teams/2026-career-form/blob/cbd283762b4b30a485f1ce8be1f48680d00c65cb/infra/monitoring/mongodb/README.md)
- [드라이버 요청 문맥과 정제 로그](https://github.com/woowacourse-teams/2026-career-form/blob/cbd283762b4b30a485f1ce8be1f48680d00c65cb/backend/src/main/java/com/careerform/monitoring/mongo/MongoCommandMetrics.java)
- [집계와 장애 상태 recording rules](https://github.com/woowacourse-teams/2026-career-form/blob/cbd283762b4b30a485f1ce8be1f48680d00c65cb/infra/monitoring/mongodb-metrics.yaml)
- [실제 exporter와 로그 수집 재개 시험](https://github.com/woowacourse-teams/2026-career-form/blob/cbd283762b4b30a485f1ce8be1f48680d00c65cb/infra/tests/test_mongodb_monitoring_runtime.py)
- [Grafana 상태, 반복 알림과 링크 시험](https://github.com/woowacourse-teams/2026-career-form/blob/cbd283762b4b30a485f1ce8be1f48680d00c65cb/infra/tests/test_mongodb_grafana_runtime.py)

격리 컨테이너의 짧은 중앙 단절에서는 로그 marker가 재전송됐다. 단절 중
수집기 재시작을 겹치면 중간 marker가 중앙에 전달되지 않고 로컬 사건 파일에만
남는 경계를 관찰했다. WAL과 positions의 영속화가 무유실이나 정확히 한 번
전달을 보장하지 않는다.

코드와 로컬 합성 검증은 운영 반영과 구분한다. 실제 배포, Discord 수신,
운영 원본과 dashboard 대조, 지속 부하와 보존 기간의 운영 검증은 사람 담당이다.
중앙 모니터링 중단에 대비한 독립 외부 감시는 이번 변경에 포함하지 않는다.

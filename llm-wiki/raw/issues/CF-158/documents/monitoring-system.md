# 장애 분석 로그와 외부 호출 P95

> Issue: [CF-158](https://github.com/woowacourse-teams/2026-career-form/issues/158)
> Collected: 2026-10-06
> Approval-Digest: 1cb4110f01da3eb03cd9bd1bd5a5d5ffba56c4dd910990521f61bab3527623cf
> Source-Revision: 15a5e992a3e291263ecfdf564162ea04930094e0

## 승인한 지식 후보

기존 일반 로그를 유지하고 HTTP 3xx/4xx/5xx 최근 5분 추이와 5xx, API 지연 기준 초과, 외부 failure/timeout 로그 패널을 추가한다. 지연 조회 기준은 preparation/analyze와 fields/analyze 20초, interaction-decisions 5초, 기타 API 2초 초과이며 Actuator를 제외한다. 기존 알림과 timeout은 변경하지 않는다.

외부 호출 성공 P95는 provider와 operation별 최근 15분 이동 구간으로 계산하고 성공, 실패, timeout 건수를 함께 표시한다. 성공 0건은 데이터 없음, 20건 미만은 표본 부족이다. 20건은 통계적 신뢰 보장이 아니며 건수는 counter 증가량 추정값이다. 히스토그램 범위는 100ms~60초이고 기존 5초와 20초 SLO 버킷을 보존한다.

상태 코드와 requestId 연결은 환경과 시간 범위를 유지하고 서로의 선택 조건을 초기화한다. 관련 로그는 환경, 시간, requestId만으로 시간순 조회하며 정상 외부 호출도 포함한다. 빈 선택은 전체 로그를 조회하지 않고 각 신규 로그 패널은 최대 500줄이다.

최근 30초 backend scrape 상태와 데이터 소실을 표시하되 Loki 전송 정상의 근거로 사용하지 않는다. 조회 결과 없음, 쿼리 오류, API_RESULT 파싱 실패를 구분해 표시하며 실제 서버 반영은 사람이 수행한다.

## 유지하는 기존 구성

[CF-154의 기존 근거](https://github.com/woowacourse-teams/2026-career-form/blob/732932774645a1576264520f3f4c5c4ba6e6d1d3/llm-wiki/raw/issues/CF-154/documents/monitoring-system.md)에 기록한 HTTP UI 진입점,
수집 접근 제한과 수동 반영 경계를 유지한다. 기존 수집, 보존과 디스크 알림 기준은
CF-154가 연결하는 이전 근거를 따른다.

## 구현 근거와 검증 경계

- [대시보드 조회와 패널](https://github.com/woowacourse-teams/2026-career-form/blob/15a5e992a3e291263ecfdf564162ea04930094e0/infra/monitoring/grafana/dashboards/backend.json)
- [requestId 연결](https://github.com/woowacourse-teams/2026-career-form/blob/15a5e992a3e291263ecfdf564162ea04930094e0/infra/monitoring/grafana/provisioning/datasources/datasources.yaml)
- [외부 호출 히스토그램](https://github.com/woowacourse-teams/2026-career-form/blob/15a5e992a3e291263ecfdf564162ea04930094e0/backend/src/main/java/com/careerform/monitoring/ExternalCallMetrics.java)
- [조회, 반영과 복구 절차](https://github.com/woowacourse-teams/2026-career-form/blob/15a5e992a3e291263ecfdf564162ea04930094e0/infra/monitoring/README.md)
- [로컬 검증 근거](https://github.com/woowacourse-teams/2026-career-form/blob/15a5e992a3e291263ecfdf564162ea04930094e0/infra/monitoring/VERIFICATION.md)

실제 AWS 반영과 조회 사용자 접속은 사람 담당이다. 로컬 합성 검증은 실제 운영
배포, 장기 저장 증가량 또는 Loki 전송 정상의 근거로 확대하지 않는다.

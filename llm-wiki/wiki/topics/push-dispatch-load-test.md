# 공고 알림 발송 시험

> Topic: push-dispatch-load-test
> Status: Current
> Current: [CF-441 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작](../../raw/issues/CF-441/documents/push-dispatch-load-test.md)
> History: [CF-441 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작](../../raw/issues/CF-441/documents/push-dispatch-load-test.md)
> Updated: 2026-11-09

## 현재 상태

SQS 전환 전후 발송 비교는 운영 리전 임시 EC2 한 대에서 전환 직전 커밋과 전환 커밋을 같은 날 같은 시험 스택(`loadtest/push-dispatch/`)으로 연달아 잰다. 전후에 달라지는 것은 발송 구조와 실제 SQS 왕복뿐이어야 하므로 다음을 같게 둔다.

- MongoDB는 운영과 같은 standalone이다.
- 동시 발송은 20이다.
- 모의 서버 지연은 운영 FCM 호출 p50에 맞춘다.
- 모의 서버 상태 추첨 시드는 고정한다.
- tracing은 끈다.

노트북은 리허설에만 쓰고, 공용 MongoDB에서는 재지 않는다.

발송기는 저장된 endpoint로 그대로 POST한다. `allowed-endpoint-hosts`는 구독 등록 API에서만 검사한다. 그래서 시험 도구는 시험 표지가 없는 구독이 있거나, 관리 API가 보는 구독 수가 검사한 DB와 다르면 아무것도 쓰지 않고 멈춘다.

전 구조의 백엔드는 SIGTERM을 받으면 진행 중인 주기를 끝까지 보낸다. 종료 유예 30초를 넘기면 강제 종료되고, 보내던 발송 문서는 lease 120초 뒤 다시 나가며 중복이 생긴다. S3은 첫 주기가 유예보다 긴 30,000건으로 잰다.

팀 측정 계획과는 다음을 다르게 한다.

- S5의 Retry-After는 90초로 준다.
- 수락 공백은 시각과 함께 읽는다.
- 자원 요약은 발송 구간으로 자른다.
- S9는 새 스택에서 세 번 잰다.
- 기본 포트는 팀 관리 터널을 피한다.

## 변경 이유

CF-348 ADR은 큐 도입 전후를 같은 숫자로 비교하라고 했지만, 저장소에는 모의 푸시 서버, 시험 데이터, 결과 집계가 없었다. CF-441에서 그 도구와 측정 조건을 정했다. 근거와 수치는 연결된 raw를 따른다.

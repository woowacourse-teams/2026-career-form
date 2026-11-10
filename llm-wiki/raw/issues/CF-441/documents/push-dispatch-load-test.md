# 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작

> Issue: [CF-441](https://github.com/woowacourse-teams/2026-career-form/issues/441)
> Collected: 2026-11-09
> Approval-Digest: 69abe134e0fe90cce8e69994cd3aaebdd978528009b5d669d419281ed5b9678f
> Source-Revision: 0c1a9000

이 문서는 2026-11-09에 승인된 CF-441 후보 네 개를 주제별로 정리한 기록이다. 후보 원문은 [승인 후보 스냅샷](approved-candidates.md)에 있다. 시험 도구의 실행 절차와 시나리오별 순서는 Source-Revision의 `loadtest/push-dispatch/README.md`를 따른다. 호스트 주소, 키 값, 비밀번호, 구독 endpoint, 대화 전문은 포함하지 않는다.

## 전후 비교 측정 방식 (결정)

SQS 전환 전후 발송 비교는 운영 리전 임시 EC2 한 대에서 전환 직전 커밋과 전환 커밋을 같은 날 같은 시험 스택(`loadtest/push-dispatch/compose.yaml`)으로 연달아 잰다. 전후 차이는 발송 구조와 실제 SQS 왕복뿐이어야 한다. 그래서 다음을 같게 둔다.

- MongoDB: 운영과 같은 standalone(replica set 아님)
- 동시 발송 20
- 모의 서버 지연: 운영 `career_form_push_send_seconds` p50
- 모의 서버 상태 추첨 시드(`MOCK_SEED`): 고정
- tracing: 끔

노트북은 SQS까지 거리가 달라 도구 개발과 리허설에만 쓴다. dev·staging·공용 MongoDB에서는 재지 않는다.

## 발송 경로의 endpoint 검사 범위 (사실)

2026-11-09 로컬 실행으로 확인했다.

- `allowed-endpoint-hosts`는 구독 등록 API(`PushSubscriptionService`)에서만 검사한다. 발송기(`PushDispatcher` → `ZerodepWebPushClient`)는 저장된 endpoint로 그대로 POST한다.
- MongoDB에 직접 넣은 `http://` 구독에도 발송된다. JDK HttpClient가 `Upgrade: h2c`를 붙여도 HTTP/1.1로 답하면 정상 처리된다.
- 그래서 시험 DB에 실제 구독이 있으면 시험 공고가 실제 FCM으로 나간다.

시험 도구는 다음 경우 아무것도 쓰지 않고 멈춘다.

- 시험 표지(endpoint `/fcm/send/loadtest-`, 링크 `https://loadtest.invalid/`)가 없는 구독이 있을 때
- 관리 API가 보는 구독 수가 검사한 DB와 다를 때

발송 시점 host 재검사는 후속 후보(BE)다.

## 전 구조의 재시작 동작 (사실)

2026-11-09 로컬 리허설(MongoDB 8.0.4, 모의 서버 지연 500ms라 동시성 20에서 초당 40건)에서 관측했다. 대상은 백엔드 안 발송기다.

- SIGTERM을 받으면 진행 중인 발송 주기를 끝까지 보낸 뒤 내려간다.
- 주기가 종료 유예(운영 루트 `compose.yaml`과 같은 30초) 안에 끝나면 끊기지 않는다. 1,000건, 약 25초 주기에서 중복은 0이었다.
- 넘으면 30초 뒤 강제 종료된다. 그때 보내던 발송 문서(동시성 20만큼)는 lease 120초 뒤 다음 주기에 다시 나가고, 모의 서버가 이미 수락한 건이 중복이 된다. 2,000건, 약 50초 주기에서 중복 20, 유실 0이었다. 수락 공백은 두 번 생겼다. 강제 종료 뒤 새 백엔드 첫 주기까지 12.7초, lease 대기 60.5초다.
- 아직 집지 않은 문서는 새 백엔드의 첫 주기(기동 10초 뒤)가 보낸다.

그래서 S3은 첫 주기가 유예보다 긴 30,000건으로 잰다.

## 팀 측정 계획 대비 조정 (결정)

- S5의 Retry-After는 90초로 준다. 전 구조 주기가 60초라 30초로는 조기 재요청을 잡을 수 없다.
- 수락 공백은 2초 이상 구간을 시각과 함께 보고 재시작·종료 시각과 맞춰 읽는다. 전 구조는 주기 사이와 lease 대기 동안에도 60초 공백이 생긴다.
- 자원 요약은 첫 요청부터 마지막 수락까지로 잘라, 등록 때 PBKDF2 CPU와 빈 주기를 뺀다.
- S9는 새 스택에서 세 번 잰다.
- 시험 스택 기본 포트 28080·28081·29091은 팀 관리 터널 로컬 포트 18080·18081을 피한다.

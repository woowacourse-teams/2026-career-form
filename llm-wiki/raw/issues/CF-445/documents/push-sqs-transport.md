# 공고 알림 발송의 SQS 방식: 구조 결정과 동작 규칙

> Issue: [CF-445](https://github.com/woowacourse-teams/2026-career-form/issues/445)
> Collected: 2026-11-10
> Approval-Digest: ea356ce89986bea6f83cd3530e98d1cf7daa81dd5362d312f9f617af633bc226
> Source-Revision: 1abf5c5c

이 문서는 2026-11-10에 승인된 CF-445 후보 가운데 발송 구조에 관한 다섯 개(1, 2, 3, 4, 6)를 주제별로 정리한 기록이다. 후보 원문은 [승인 후보 스냅샷](approved-candidates.md)에, 구조 결정의 전문은 [ADR](adr/445-push-sqs-relay-worker.md)에 있다. 설정 키, 상태 전이 표, 지표와 로그 이름은 Source-Revision의 `backend/docs/job-posting-notifications.md`를 따른다. 호스트 주소, 계정 번호, 큐 주소, 키 값, 구독 endpoint, 대화 전문은 포함하지 않는다.

## 구조 결정 (결정)

팀원 제안은 Outbox 트랜잭션, FIFO 큐, 가시성 타임아웃 재시도였다. CF-445는 다음과 같이 정했다.

- 발송 문서(`push_deliveries`)를 상태 정본으로 유지하고 그 사이에 표준 큐와 DLQ를 둔다.
- 큐 메시지 본문은 발송 문서 id만 담는다. 중복 발송은 워커의 조건부 갱신 선점으로 막는다.
- 재시도 대기는 지금처럼 `nextAttemptAt`에 적는다.
- 발송 방식은 설정 `push.transport`(`direct` 기본, `sqs`)로 고른다.
- Outbox 트랜잭션과 MongoDB replica set은 넣지 않는다. 등록 빈틈은 CF-439의 재등록 보충으로 메운다. 팀 측정 계획의 S8 기준은 이 전환에서 뺀다.
- 서버는 인스턴스 역할 자격 증명으로 SQS를 부르고 액세스 키를 만들지 않는다.
- 개발·운영 적용과 릴레이·워커 배치는 전후 측정 결과를 보고 후속 Infra Issue에서 정한다.

## SQS 방식의 동작 규칙 (사실)

상태는 PENDING → QUEUED → SENDING → ACCEPTED·ABANDONED·PENDING(재시도)다.

릴레이:

- 발송기와 같은 주기와 한 주기 상한을 쓴다.
- 때가 된 PENDING, 큐 리스(기본 15분)가 지난 QUEUED, lease가 지난 SENDING을 찾는다.
- 큐에 먼저 넣고, 넣은 건만 QUEUED로 표시한다. 표시 전에 릴레이가 멈춰도 메시지는 남고, 다시 넣은 중복은 워커 선점이 거른다.

워커:

- 남은 동시 발송 수만큼(최대 10건) long polling으로 받는다.
- QUEUED, 때가 된 PENDING, lease가 지난 SENDING만 선점해 보낸다.
- 선점하지 못한 메시지는 지운다. 발송 id 형식(32자 hex)이 아닌 메시지는 지우지 않아 DLQ로 가게 둔다.

복구와 되돌리기:

- 워커가 죽은 건은 lease 120초 뒤 릴레이가 다시 넣는다.
- 큐에서 사라진 건은 큐 리스 뒤 다시 넣는다.
- `sqs`에서 `direct`로 되돌리면 발송기가 큐 리스가 지난 QUEUED까지 집어 보낸다.

관리 화면의 발송 진행과 요약 API는 QUEUED를 대기에 합쳐 센다. 공고 삭제는 PENDING과 QUEUED를 함께 취소한다.

## 가상 스레드와 맵 잠금 (사실)

2026-11-10 로컬 리허설에서 확인했다.

- `ConcurrentHashMap.computeIfAbsent` 안에서 저장소(MongoDB)를 부르면 맵 잠금을 쥔 채 I/O를 하게 된다. JDK 21의 가상 스레드는 그 잠금을 쥐거나 기다리는 동안 운반 스레드를 놓지 못한다.
- CPU 2개로 제한한 컨테이너(운반 스레드 2개)에서 워커가 같은 공고의 발송 10건을 한꺼번에 받자 1,000건 중 971건에서 발송 전체가 멈췄다. `-Djdk.tracePinnedThreads=full`로 위치를 확인했다.
- 조회를 잠금 밖(`get` 뒤 `putIfAbsent`)으로 옮겨 고쳤다.
- 이 코드는 지금 방식(`direct`) 발송기에도 원래 있었다. 발송기는 한 건씩 선점하며 넘겨서 드러날 확률이 낮았다.

가상 스레드에서 도는 코드는 `synchronized`나 `computeIfAbsent` 안에서 I/O를 하지 않는다.

## 알림 조립과 테스트 규칙 (사실)

- `NotificationConfiguration` 안쪽의 방식별 조립 클래스에 `@Configuration`을 붙이면 컴포넌트 스캔이 바깥 조건(알림 켜짐)과 무관하게 따로 읽어, 알림이 꺼진 컨텍스트가 깨진다. 안쪽 클래스에는 조건과 `@Bean` 메서드만 둔다.
- `push.transport`가 `direct`·`sqs`가 아니거나 비어 있으면 조건이 둘 다 맞지 않아 발송이 조용히 꺼질 수 있다. 그래서 `PushTransport`가 기동을 멈춘다.
- `ApplicationContextRunner`로 조립을 시험할 때는 `ApplicationConversionService`를 넣어야 `60s`·`15m` 같은 기간 값을 읽는다.
- SQS 어댑터는 실제 AWS SDK 클라이언트를 로컬 HTTP 서버(AWS JSON 응답 흉내, 본문 MD5 포함)에 붙여 검증한다.

## 공용 AWS 계정의 SQS 사정 (사실)

2026-11-10 콘솔을 읽어 확인했다.

- 팀 계정은 공용 역할 `ec2-project`의 정책을 볼 수 없다(`iam:GetRole` 거부). 역할에 SQS 권한이 있는지는 큐를 만든 뒤 역할이 붙은 EC2에서 불러 봐야 안다.
- SQS 큐 목록은 보이고 다른 팀 큐 25개가 모두 표준 큐였다.
- 2026-Chalkak은 환경별 표준 큐와 DLQ를 두고 SDK 기본 자격 증명과 `ec2-project`로 부르며, 팀 큐 범위 권한은 담당자에게 요청하는 것으로 문서에 적었다.
- 운영 앱 서버와 개발·스테이징 서버에는 역할이 연결돼 있지 않았고 DB 서버만 `ec2-project`였다.

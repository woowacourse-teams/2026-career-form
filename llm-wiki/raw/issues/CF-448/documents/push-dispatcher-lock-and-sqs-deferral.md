# 공고 조회 잠금 수정과 SQS 전환 보류

> Issue: [CF-448](https://github.com/woowacourse-teams/2026-career-form/issues/448)
> Collected: 2026-11-10
> Approval-Digest: 87630dbbfefb64b4398c8a30206ee7ca5d3852e7698afa2644c9a045f1f5bf67
> Source-Revision: 324a016c

발송기의 공고 조회가 맵 잠금을 쥔 채 MongoDB를 읽던 문제를 고친 기록과, SQS 방식을 구현하고 측정한 뒤 켜지 않기로 한 결정이다. [승인 후보 스냅샷](approved-candidates.md)의 후보 1과 2를 적는다. 직무 분류, 대상 산정, 선점과 재시도, 같은 링크 재등록 규칙은 CF-439·CF-432·CF-394·CF-348 payload의 내용이 그대로 유효하다.

## 가상 스레드와 잠금 (후보 1)

- JDK 21의 가상 스레드는 `synchronized`나 `ConcurrentHashMap.computeIfAbsent`의 맵 잠금을 쥔 채 I/O로 멈추면 운반 스레드를 놓지 못한다(pinned). 같은 잠금을 기다리는 가상 스레드도 운반 스레드를 붙잡는다.
- 운반 스레드 수는 CPU 수와 같다. CPU 2개 서버에서는 몇 건만 겹쳐도 가상 스레드 전체가 멈출 수 있다.
- 규칙: 가상 스레드에서 도는 코드는 잠금을 쥔 채 I/O를 하지 않는다.
- 가상 스레드에서 캐시를 채울 때는 `get`, 잠금 밖 조회, `putIfAbsent` 순서로 쓴다. 동시에 처음 조회할 때 저장소를 여러 번 읽는 것은 받아들인다.
- 확인은 `-Djdk.tracePinnedThreads=full`로 띄워 로그의 `reason:MONITOR`와 `<== monitors` 줄을 본다.

## 발송기에서 확인한 것 (후보 1)

- 원인: `PushDispatcher.deliver`가 `postings.computeIfAbsent(postingId, store::findPosting)`으로 맵 잠금 안에서 MongoDB를 읽었다.
- CF-445의 SQS 워커 리허설은 CPU 2개 컨테이너에서 같은 공고의 발송 10건을 한꺼번에 시작했다. 1,000건 중 971건에서 발송이 멈췄고, 조회를 잠금 밖으로 옮기자 1,000건이 끝나고 고정 기록이 0이었다.
- 기존 방식 발송기는 발송을 한 건씩 선점하며 넘겨 겹침이 적다. 2026-11-10 로컬 시험 스택(CPU 2개, MongoDB 8.0.4, 모의 서버 지연 100ms, 구독 1,000개 × 공고 1건)의 결과는 아래와 같다.

| jar | 수락 | 유실 | 중복 | 고정 기록 | 첫 요청부터 마지막 수락까지 |
|---|---|---|---|---|---|
| 수정 전(develop 10e2a779) | 1,000 | 0 | 0 | 2건(`computeIfAbsent`) | 5.42초 |
| 수정 후(324a016c) | 1,000 | 0 | 0 | 0건 | 5.32초 |

- 운영에서 실제로 멈춘 적이 있는지는 확인하지 않았다.
- 회귀 테스트 `PushDispatcherTest.lookupDoesNotHoldCacheLock`은 저장소를 `java.lang.reflect.Proxy`로 감싸 `findPosting`에서 래치를 걸고, 두 발송이 함께 조회에 들어가는지 본다. 수정 전에는 둘째 발송이 맵 잠금에서 2초를 기다려 실패한다.

## SQS 전환 보류 (후보 2)

결정의 전문은 [ADR](adr/448-push-sqs-deferred.md)에 있다. 요지는 다음과 같다.

- 기존 방식(API 서버 안의 주기 발송기)을 유지하고 SQS 방식의 코드는 머지하지 않는다.
- SQS로 새로 얻는 것은 API 서버를 배포하거나 재시작하는 동안에도 발송이 계속되는 것 하나다. 지금은 그 지연이 최대 2분이고 목표가 10분이라, 새로 운영할 큐, 권한, 워커 컨테이너, 배포 절차와 바꿀 만하지 않다고 봤다.
- 구현과 측정 기록은 닫은 PR #446과 브랜치 `CF-445`에 남긴다.
- 다시 볼 조건은 네 가지다. 1~2분 지연이 문제가 되는 알림이 생길 때, 한 번에 몰리는 발송이 5,000건을 넘게 될 때, 다른 발송 채널을 붙일 때, API 서버 장애가 발송에 자주 영향을 줄 때다.

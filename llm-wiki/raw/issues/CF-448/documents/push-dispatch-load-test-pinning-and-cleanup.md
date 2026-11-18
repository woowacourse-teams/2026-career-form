# 발송 시험 스택의 고정 기록 확인과 시험 자원 정리 절차

> Issue: [CF-448](https://github.com/woowacourse-teams/2026-career-form/issues/448)
> Collected: 2026-11-10
> Approval-Digest: 87630dbbfefb64b4398c8a30206ee7ca5d3852e7698afa2644c9a045f1f5bf67
> Source-Revision: 324a016c

2026-11-10에 승인된 CF-448 후보 가운데 발송 시험에 해당하는 내용이다. 후보 원문은 [승인 후보 스냅샷](approved-candidates.md)에 있다. 측정 방식, 안전장치, 전 구조의 재시작 동작은 CF-441 payload의 내용이 그대로 유효하다. SQS 전환은 CF-448에서 보류했으므로 전후 비교 측정은 다시 볼 때 쓴다. 호스트 주소, 계정 번호, 인스턴스 ID, 키 값, 비밀번호는 포함하지 않는다.

## 고정 기록 확인 (후보 1)

- 시험 스택의 백엔드를 `-Djdk.tracePinnedThreads=full`로 띄운다. compose override 파일로 백엔드 서비스에 `JAVA_TOOL_OPTIONS`를 넣으면 된다.
- 발송이 끝난 뒤 백엔드 로그에서 `reason:MONITOR` 줄 수를 세고, `<== monitors`가 붙은 줄로 잠금을 쥔 위치를 본다.
- 2026-11-10 로컬 리허설은 CPU 2개로 제한한 백엔드, MongoDB 8.0.4, 모의 서버 지연 100ms, 구독 1,000개 × 공고 1건이었다. 수정 전 jar(develop 10e2a779)는 고정 기록 2건(`computeIfAbsent`), 수정 후 jar(324a016c)는 0건이었다. 두 실행 모두 수락 1,000, 유실 0, 중복 0이었고 첫 요청부터 마지막 수락까지 5.42초와 5.32초였다.

## 공용 AWS 계정의 시험 자원 정리 (후보 3)

- 팀 계정으로 되는 것: SQS 큐 생성, EC2 실행과 중지, 탄력적 IP 릴리스.
- 권한이 없어 거부되는 것: EC2 종료(`ec2:TerminateInstances`), SQS 큐 삭제(`sqs:DeleteQueue`).
- 삭제는 운영진 Slack 채널에 자원 ID와 이름을 적어 요청한다. 처리 표시를 받은 뒤에도 콘솔에서 실제로 사라졌는지 확인한다. 처리 표시 뒤에도 남아 있던 인스턴스가 한 대 있었다.
- 임시 EC2와 큐를 쓰는 작업은 측정이 끝나면 EC2를 먼저 중지해 요금을 멈추고 삭제를 요청하는 순서를 계획에 넣는다. 쉬는 큐는 요금이 없다.

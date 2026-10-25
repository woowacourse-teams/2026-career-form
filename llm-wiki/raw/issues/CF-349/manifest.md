# CF-349 Knowledge Bundle

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: dab518584df0f2191e1b2b11ab24a5ebda3ed6297255baad4e3e5142db471952
> Approval-Response: FE Wiki 후보 5개와 Infra Wiki 후보 2개 모두 승인하고, 이해 확인 문항은 전부 skip으로 처리해 줘. 내 말 그대로 두 세션에 전달해서 Draft PR까지 진행시켜.
> Approval-Date: 2026-10-26
> Source-Revision: 7dd07128ad3ccd0edf2834f4084d5b8e0e76cfed
> Checkpoint-Candidate-Digest: 1730a87f545e25c69030c6f2ec87d367a2b756cb540ca2fc2ecaca4f876491f6

승인 digest는 사람이 위 응답(부모 세션이 전달한 사용자 원문)으로 승인한 [후보 다섯 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. Checkpoint-Candidate-Digest는 같은 후보 다섯 개를 worktree 체크포인트가 JSON으로 직렬화해 계산한 값이다.

두 payload는 후보 1·2·3·5(extension-push-notifications)와 후보 4(usage-analytics)를 담는다. 모든 서술은 CF-349 브랜치의 Source-Revision 시점 코드와 원격 Draft PR #351(CF-348)의 컨트롤러가 근거이며 구독 endpoint와 키, 실제 공고·프로필 값은 기록하지 않는다. 각 payload의 승인 후보 절은 어미만 한다체로 바꿔 옮겼다.

## extension-push-notifications

> Payload: [확장 Web Push 구독과 공고 알림](documents/extension-push-notifications.md)
> Supersedes: None

## usage-analytics

> Payload: [공고 알림 구독·표시·공지함 계측](documents/usage-analytics.md)
> Supersedes: [CF-271 Greeting 가져오기 진입과 저장 완료 계측](../CF-271/documents/usage-analytics.md)

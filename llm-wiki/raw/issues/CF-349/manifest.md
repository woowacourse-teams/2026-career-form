# CF-349 Knowledge Bundle

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: a13a98b7258ec33fcc5fa174e18f6134f21ade908376db2df0d821e4042b7010
> Approval-Response: Wiki 지식 후보 9개 모두 승인하고, 이해 확인 3문항은 전부 skip으로 처리해 줘. 내 말 그대로 FE 세션에 전달해서 PR #353 갱신까지 진행시켜.
> Approval-Date: 2026-10-26
> Source-Revision: 33c6c4590afa16e7f241871ec84147e09ef28457
> Checkpoint-Candidate-Digest: 7ce65ac94c57cf4153de5b855137a5c988938291e82354e2c0679a5cfb9fe48f

승인 digest는 사람이 위 응답(부모 세션이 전달한 사용자 원문)으로 승인한 [후보 아홉 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 후보 1~5는 같은 날 앞선 응답("FE Wiki 후보 5개와 Infra Wiki 후보 2개 모두 승인하고, 이해 확인 문항은 전부 skip으로 처리해 줘.")으로 먼저 승인됐고 글자 그대로 유지됐으며, 6~9는 Issue #349의 2026-10-26 범위 수정(알림 표시 자가 진단, 미확인 배지, 열기 자동 저장, 화면 정리) 뒤 추가돼 함께 승인됐다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. Checkpoint-Candidate-Digest는 같은 후보 아홉 개를 worktree 체크포인트가 JSON으로 직렬화해 계산한 값이다.

두 payload는 후보 1·2·3·5·6·7·8·9(extension-push-notifications)와 후보 4와 9의 계측 부분(usage-analytics)을 담는다. 모든 서술은 CF-349 브랜치의 Source-Revision 시점 코드와 원격 Draft PR #351(CF-348)의 컨트롤러가 근거이며 구독 endpoint와 키, 실제 공고·프로필 값은 기록하지 않는다. 각 payload의 승인 후보 절은 어미만 한다체로 바꿔 옮겼다.

## extension-push-notifications

> Payload: [확장 Web Push 구독과 공고 알림](documents/extension-push-notifications.md)
> Supersedes: None

## usage-analytics

> Payload: [공고 알림 구독·표시·공지함 계측](documents/usage-analytics.md)
> Supersedes: [CF-271 Greeting 가져오기 진입과 저장 완료 계측](../CF-271/documents/usage-analytics.md)

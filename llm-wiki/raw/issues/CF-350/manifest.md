# CF-350 Knowledge Bundle

> Issue: CF-350
> Collected: 2026-10-26
> Approval-Digest: e4434614c1e89a70afbbcc7888e48e4574efd1d8e82b811f02845fc4de049961
> Approval-Response: 승인. 사용자 원문 "FE Wiki 후보 5개와 Infra Wiki 후보 2개 모두 승인하고, 이해 확인 문항은 전부 skip으로 처리해 줘"를 알림 기능 설계 검토 세션이 그대로 전달했다.
> Approval-Date: 2026-10-26
> Source-Revision: cc7215ecafd7a5406c58d2c9ea5b1f4c47dbee6e
> Checkpoint-Candidate-Digest: 8f12f9ac6665f1631e8feab9e6d7e3180f4bde71eefb5ef3258f46f2211b1480

승인 digest는 사람이 위 응답으로 승인한 [후보 두 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 체크포인트에 기록해 승인을 요청한 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. Checkpoint-Candidate-Digest는 같은 후보 두 개를 worktree 체크포인트가 JSON으로 직렬화해 계산한 값이다.

두 payload는 후보 1(cicd-setup)과 후보 2(deployment-runbook)를 담는다. payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 서술의 근거는 Source-Revision 시점의 workflow, compose, 테스트, 절차 문서와 `[BE]` #348 작업 브랜치의 설정 코드이며, VAPID 키 값, 호스트 주소, 계정, 시크릿은 기록하지 않는다.

## cicd-setup

> Payload: [알림 토글과 VAPID 시크릿의 배포 설정 레버](documents/notification-deployment-levers.md)
> Supersedes: [CF-327 배포 설정 레버 전체와 운영 LLM 비활성 이력](../CF-327/documents/deployment-config-levers.md)

## deployment-runbook

> Payload: [릴리스 점검표의 운영 알림 토글 결정](documents/release-checklist-notification-toggle.md)
> Supersedes: [CF-337 정책 활성 버전은 배포 커밋의 seed를 따른다](../CF-337/documents/policy-active-version-follows-seed.md)

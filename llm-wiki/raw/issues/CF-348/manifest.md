# CF-348 Knowledge Bundle

> Issue: CF-348
> Collected: 2026-10-25
> Approval-Digest: 41070bd2e6e1cd5e2c2f81feb60063cd207325b077be71f1ee0b00b3eb0ab7fd
> Approval-Response: 승인
> Approval-Date: 2026-10-25
> Checkpoint-Candidate-Digest: f2db20a764a70d467ff37168a4b737bc7b35749f287bd0fbdf2d949cad5d2f31
> Source-Revision: 650d2894db36c707606a96d71a5d3d699d29de6f

승인 digest는 사람이 위 응답으로 승인한 [후보 두 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 체크포인트가 계산한 후보 digest는 Checkpoint-Candidate-Digest에 따로 적었다. payload는 Issue #348 본문의 ADR 후보 전문을 상태 '승인됨', 관련 Issue #348·#349·#350으로 바꾸고 결과 끝에 단계적 도입 경로와 숫자의 근거 두 항목을 더한 ADR 하나다. 실제 지원값·계정·세션·시크릿·VAPID 키·구독 endpoint는 포함하지 않는다.

## job-posting-notifications

> Payload: [채용 공고 구독 알림의 전달 경로와 발송 보장](documents/adr/348-push-notification-delivery.md)
> Supersedes: None

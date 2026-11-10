# CF-445 Knowledge Bundle

> Issue: CF-445
> Collected: 2026-11-10
> Approval-Digest: ea356ce89986bea6f83cd3530e98d1cf7daa81dd5362d312f9f617af633bc226
> Source-Revision: 1abf5c5c

승인 digest는 worktree 체크포인트가 계산한 [후보 일곱 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-10 "승인"으로 확정했다. payload는 둘이다. 발송 구조에 관한 후보 다섯 개(1, 2, 3, 4, 6)는 공고 알림 문서로, 발송 시험에 관한 후보 두 개(5, 7)는 발송 시험 문서로 정리했다. 구조 결정의 전문은 Issue #445 본문의 ADR 후보를 상태 '승인됨', 관련 Issue #445로 바꿔 [ADR](documents/adr/445-push-sqs-relay-worker.md)로 기록했다. 호스트 주소, 계정 번호, 큐 주소, 키 값, 비밀번호, 구독 endpoint, 대화 전문은 포함하지 않는다.

## job-posting-notifications

> Payload: [공고 알림 발송의 SQS 방식: 구조 결정과 동작 규칙](documents/push-sqs-transport.md)
> Supersedes: [CF-439 같은 링크 재등록의 빠진 발송 채우기와 등록 복구 절차](../CF-439/documents/duplicate-link-refill.md)

## push-dispatch-load-test

> Payload: [공고 알림 발송 시험 스택의 SQS 방식과 로컬 리허설 결과](documents/push-dispatch-load-test-sqs.md)
> Supersedes: [CF-441 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작](../CF-441/documents/push-dispatch-load-test.md)

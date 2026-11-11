# CF-448 Knowledge Bundle

> Issue: CF-448
> Collected: 2026-11-10
> Approval-Digest: 87630dbbfefb64b4398c8a30206ee7ca5d3852e7698afa2644c9a045f1f5bf67
> Source-Revision: 324a016c

승인 digest는 worktree 체크포인트가 계산한 [후보 세 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-10 "승인"으로 확정했다. payload는 둘이다. 가상 스레드 잠금 규칙과 SQS 전환 보류 결정(후보 1, 2)은 공고 알림 문서로, 고정 기록 확인과 시험 자원 정리 절차(후보 1의 확인 방법과 후보 3)는 발송 시험 문서로 정리했다. 결정의 전문은 Issue #448 본문의 ADR 후보를 상태 '승인됨'으로 바꿔 [ADR](documents/adr/448-push-sqs-deferred.md)로 기록했다. 호스트 주소, 계정 번호, 큐 주소, 인스턴스 ID, 키 값, 비밀번호, 구독 endpoint, 대화 전문은 포함하지 않는다.

## job-posting-notifications

> Payload: [공고 조회 잠금 수정과 SQS 전환 보류](documents/push-dispatcher-lock-and-sqs-deferral.md)
> Supersedes: [CF-439 같은 링크 재등록의 빠진 발송 채우기와 등록 복구 절차](../CF-439/documents/duplicate-link-refill.md)

## push-dispatch-load-test

> Payload: [발송 시험 스택의 고정 기록 확인과 시험 자원 정리 절차](documents/push-dispatch-load-test-pinning-and-cleanup.md)
> Supersedes: [CF-441 공고 알림 발송 비교 측정 방식과 전 구조 재시작 동작](../CF-441/documents/push-dispatch-load-test.md)

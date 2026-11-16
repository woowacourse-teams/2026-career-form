# CF-463 Knowledge Bundle

> Issue: CF-463
> Collected: 2026-11-16
> Approval-Digest: 1de0e43eadcffe548c06a76dbea8f80ce34e8e357c2b5bef50ffde3399ff8d68
> Source-Revision: 5c43a4e7

승인 digest는 worktree 체크포인트가 계산한 [후보 여섯 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-16 "승인"으로 확정했다. payload는 확장 알림 topic의 저장 경로·화면 위치 정정(후보 1·2·5·6), 계측 topic의 저장 계기 정정(후보 3), 저장 공고 topic의 정리 시점 보완과 안내 결정(후보 4) 셋이다. 구독 endpoint, 키 값, 실제 공고, 계정, 대화 전문은 포함하지 않는다.

## extension-push-notifications

> Payload: [공고 저장 경로와 확장 화면 위치 정정](documents/extension-push-notifications.md)
> Supersedes: [CF-432 서버와 확장의 직무 미선택 정책 일치](../CF-432/documents/extension-server-alignment.md)

## usage-analytics

> Payload: [공고 저장 계기 계측 정정](documents/usage-analytics.md)
> Supersedes: [CF-431 온보딩 단계 진입과 완료 계측](../CF-431/documents/usage-analytics.md)

## saved-job-postings

> Payload: [저장 공고 정리 시점 보완과 자동 삭제 안내 결정](documents/saved-job-postings.md)
> Supersedes: [CF-453 마감 지난 지원 예정 공고 자동 삭제와 저장 공고 수명](../CF-453/documents/saved-posting-expiry.md)

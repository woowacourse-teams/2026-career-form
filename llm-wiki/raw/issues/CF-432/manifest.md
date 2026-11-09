# CF-432 Knowledge Bundle

> Issue: CF-432
> Collected: 2026-11-07
> Approval-Digest: 7fa81d649c3847946c61720c258533e9dd42172144711304010e08025c5d43df
> Source-Revision: da17fde3

승인 digest는 worktree 체크포인트가 계산한 [후보 세 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-07 "승인"으로 확정했다. payload는 후보 1·3을 담은 공고 알림 문서, 후보 2를 담은 배포 설정 문서, 후보 1의 확장 쪽 의미를 담은 확장 알림 문서 셋이다. 호스트 주소, 키 값, 계정, 구독 endpoint, 사용자의 직무 선택값, 대화 전문은 포함하지 않는다.

## job-posting-notifications

> Payload: [공고 알림 미선택 구독 상시 발송과 전환 설정 제거](documents/unselected-always-delivered.md)
> Supersedes: [CF-394 공고 알림 직무 필터: 분류 정본, 공고 직무 필수, 구독별 받을 직무와 대상 발송](../CF-394/documents/job-posting-role-filter.md)

## cicd-setup

> Payload: [직무 필터 전환 변수의 배포 경로 잔존](documents/role-filter-variable-leftover.md)
> Supersedes: [CF-413 공고 알림 직무 필터 전환 변수의 배포 전달](../CF-413/documents/role-filter-toggle-deployment.md)

## extension-push-notifications

> Payload: [서버와 확장의 직무 미선택 정책 일치](documents/extension-server-alignment.md)
> Supersedes: [CF-431 직무 미선택 구독의 전체 공고 수신](../CF-431/documents/extension-role-default.md)

# CF-413 승인 후보 스냅샷

> Issue: CF-413
> Approval-Digest: 058720dcf405d4c6c31bfaa925163a583a91843a28d3f459f0a5b1cc732c7aec
> Approval-Date: 2026-11-05

worktree 체크포인트에 기록해 승인을 요청한 후보 목록을 그대로 옮겼다. 사람은 2026-11-05 "승인"으로 확정했다. 승인 digest는 체크포인트가 후보 목록을 JSON으로 직렬화해 계산한 값이다.

1. 배포 전환 변수 전달(CF-413): 공고 직무 필터 전환 CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED는 세 deploy workflow의 deploy job env(vars)와 infra/compose.deploy.yaml(:-false)을 거쳐 backend에 닿는 Environment 변수이며 미설정·빈 값은 compose가 false로 채우고 infra/scripts/deploy.sh 필수값에는 넣지 않는다. 릴리스와 함께 켜지 않고 새 확장 게시 → 관리 요약 API roleSelectedSubscriptions로 보급 확인 → 사람이 true로 두고 재배포한다. 스테이징은 true로 한 번 배포해 기동 로그 NOTIFICATION_ROLE_FILTER enforced=true와 미선택 구독 제외를 확인한 뒤 false로 되돌린다. 알림 설정 이름을 하나 더할 때는 infra/tests/test_notification_deployment.py의 DEFAULTS와 SYNTHETIC 사전에 이름만 더하면 기본값·주입·deploy job 한정·deploy.sh 제외 네 검사가 함께 적용된다.

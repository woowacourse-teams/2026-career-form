# CF-435 승인 후보 스냅샷

> Issue: [CF-435](https://github.com/woowacourse-teams/2026-career-form/issues/435)
> Collected: 2026-11-07
> Approval-Digest: 00e55f273b4cb38bc64ae426fbb48bf19696a77a30aafcd81be17afe2097dc25

worktree 체크포인트에 기록한 후보 한 개의 원문이다. 사람이 2026-11-07 "승인"으로 확정했다.

1. 직무 필터 전환 변수의 배포 경로 제거(CF-435): CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED를 세 deploy workflow의 deploy job env, infra/compose.deploy.yaml, infra/tests/test_notification_deployment.py의 DEFAULTS·SYNTHETIC, infra/WEB_PUSH_VAPID.md(변수 표, 스테이징 활성화 점검 5단계, 운영 점검표의 켜는 항목)에서 지웠다. 배포 변수는 세 환경 공통 14개, 시크릿 12개이고 development는 #423의 평가 설정 변수 3개와 시크릿 1개를 더 읽는다. test_removed_role_filter_setting_is_not_passed_to_backend가 옛 이름이 세 workflow와 compose 원문에 없고, 배포 환경에 그 변수가 있어도 compose 렌더 결과로 backend에 전달되지 않는지 검사한다. 2026-11-07 확인 때 development·staging·production Environment에는 이 변수가 없어 지울 값이 없었다.

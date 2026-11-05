# CF-415 승인 후보 스냅샷

> Issue: CF-415
> Approval-Digest: 0331d54bd1a62ae15bdab9c1de13450ceb567cb14a7ef3bae73f0c4b4ab19846
> Approval-Date: 2026-11-05

worktree 체크포인트에 기록해 승인을 요청한 후보 목록을 그대로 옮겼다. 사람은 2026-11-05 "승인"으로 확정했다. 승인 digest는 체크포인트가 후보 목록을 JSON으로 직렬화해 계산한 값이다.

1. 프론트엔드 CI 실행 조건(CF-415): .github/workflows/frontend-ci.yml은 pull_request와 develop·main push 모두 paths 필터(frontend/**, .github/workflows/frontend-ci.yml)에 걸릴 때만 shard 8개(--maxWorkers=1)와 커버리지 병합을 돈다. develop 브랜치 보호에는 필수 상태 체크가 없고 리뷰 1명만 필수라 프론트 CI를 건너뛰어도 머지가 막히지 않는다. 2026-11-04 develop 13d84d5f 측정: 테스트 파일 597개·총 2,808초 중 20초 넘는 38개 파일이 2,049초(73%)를 차지하고 shard별 합계가 146~702초로 불균형이라 FE PR CI는 14~16분이다. 경로 필터는 backend·infra·llm-wiki만 바꾼 PR의 15분을 없애고 FE PR 시간은 바꾸지 않으며, shard 균형 조정과 느린 fixture 테스트 정리는 별도 FE 작업이다. 계약 테스트 test_frontend_ci_runs_only_for_frontend_changes가 두 트리거의 경로와 shard 8개·--maxWorkers=1·coverage needs를 고정한다.

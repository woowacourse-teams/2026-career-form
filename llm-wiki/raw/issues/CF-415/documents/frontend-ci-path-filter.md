# 프론트엔드 CI의 frontend 경로 필터와 실행 시간 측정

> Issue: CF-415
> Collected: 2026-11-05
> Approval-Digest: 0331d54bd1a62ae15bdab9c1de13450ceb567cb14a7ef3bae73f0c4b4ab19846
> Source-Revision: bc613742

이 문서는 2026-11-05에 승인된 CF-415 후보 1을 수집한 기록이다. CF-304가 정한 shard 8개·워커 1개·blob 병합 구조는 바꾸지 않고 실행 조건만 더하므로, 두 프로젝트(unit·browser) 분리, 병합 검증 경계, 120초 제한 같은 내용은 Supersedes가 가리키는 CF-304 근거를 따른다.

## 승인 후보

프론트엔드 CI 실행 조건(CF-415): .github/workflows/frontend-ci.yml은 pull_request와 develop·main push 모두 paths 필터(frontend/**, .github/workflows/frontend-ci.yml)에 걸릴 때만 shard 8개(--maxWorkers=1)와 커버리지 병합을 돈다. develop 브랜치 보호에는 필수 상태 체크가 없고 리뷰 1명만 필수라 프론트 CI를 건너뛰어도 머지가 막히지 않는다. 2026-11-04 develop 13d84d5f 측정: 테스트 파일 597개·총 2,808초 중 20초 넘는 38개 파일이 2,049초(73%)를 차지하고 shard별 합계가 146~702초로 불균형이라 FE PR CI는 14~16분이다. 경로 필터는 backend·infra·llm-wiki만 바꾼 PR의 15분을 없애고 FE PR 시간은 바꾸지 않으며, shard 균형 조정과 느린 fixture 테스트 정리는 별도 FE 작업이다. 계약 테스트 test_frontend_ci_runs_only_for_frontend_changes가 두 트리거의 경로와 shard 8개·--maxWorkers=1·coverage needs를 고정한다.

## 실행 조건

`.github/workflows/frontend-ci.yml`의 `on.pull_request`와 `on.push`(branches `develop`, `main`)에 같은 `paths`를 둔다.

| 트리거 | paths |
|---|---|
| `pull_request` | `frontend/**`, `.github/workflows/frontend-ci.yml` |
| `push` (develop, main) | `frontend/**`, `.github/workflows/frontend-ci.yml` |

`backend-ci.yml`이 `backend/**`와 자기 workflow 파일에만 도는 것과 같은 방식이다. frontend 빌드·테스트 설정은 모두 `frontend/` 아래에 있어(상위 디렉터리 참조 없음) 다른 경로 변경이 프론트 테스트 결과를 바꾸지 않는다. `develop` 브랜치 보호(2026-11-05 확인)는 리뷰 1명만 필수고 필수 상태 체크가 없으므로 프론트 CI 체크가 생성되지 않아도 머지가 막히지 않는다. `quality-gate.yml`(verify.py)과 `pr-contract.yml`은 모든 PR에서 그대로 돈다.

## 측정 (develop 13d84d5f, 2026-11-04 run 41847479073)

| 항목 | 값 |
|---|---|
| 테스트 파일 / 테스트 | 597 / 7,185 |
| 총 실행 시간 | 2,808초 |
| 20초 이상 파일 | 38개, 2,049초(73%) |
| 5초 미만 파일 | 518개, 360초 |
| shard별 합계 | 1: 455, 2: 146, 3: 702, 4: 480, 5: 414, 6: 168, 7: 225, 8: 219초 |
| shard job 벽시계 | 설치 약 30초 + 테스트, 가장 긴 job 14~16분 |

가장 느린 파일은 `src/autofill/workflow/AutofillWorkflow.hplace-step2-shaped.test.tsx`(258초, 테스트 하나 109초), `AutofillWorkflow.hplace-major-details.test.tsx`(161초), `AutofillWorkflow.hplace-education-majors.test.tsx`(128초), `src/autofill/generic/generic-analysis.integration.test.tsx`(126초), `src/autofill/adapters/hyundai/workflow-military-veteran.integration.test.tsx`(121초)다. 느린 원인은 대기 타이머가 아니라 jsdom에서 실제 자동 기입 흐름을 끝까지 돌리는 fixture 통합 테스트라는 점이다. vitest `--shard`는 파일 수로만 나누므로 이름이 인접한 무거운 파일이 같은 shard에 몰린다.

## 효과와 남은 일

- backend·infra·llm-wiki만 바꾼 PR(#405, #411, #414)에서 매번 돌던 14~16분이 사라진다.
- frontend를 바꾼 PR의 시간은 그대로다. shard를 파일별 소요 시간으로 균형 분배하면 벽시계가 약 7분으로 줄고, 느린 fixture 테스트 정리는 FE 소유자 판단이 필요하다. 둘은 별도 `[FE]` 작업이다.
- 계약 테스트 `infra/tests/test_workflow_contract.py::test_frontend_ci_runs_only_for_frontend_changes`가 두 트리거의 경로, shard 1~8 매트릭스, `--maxWorkers=1`, `coverage` job의 `needs: test`를 고정한다.

## 근거

- `.github/workflows/frontend-ci.yml`, `backend-ci.yml`(Source-Revision bc613742)
- `infra/tests/test_workflow_contract.py`
- GitHub Actions run 41847479073의 vitest blob 보고서(파일·테스트별 duration), `gh api repos/.../branches/develop/protection`

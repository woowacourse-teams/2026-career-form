# 20초 넘는 fixture 통합 테스트 38개 삭제 결정과 측정

> Issue: CF-417
> Collected: 2026-11-05
> Approval-Digest: 8ac79d222b67025f9b957d911e318172f6108fcf0771e9ee3450cc8b20c1155a
> Source-Revision: 7d2436bf

이 문서는 2026-11-05에 승인된 CF-417 후보 1을 수집한 기록이다. CF-304가 정한 shard 8개·워커 1개·blob 병합 구조와 두 프로젝트(unit·browser) 분리는 바꾸지 않으며, 그 내용은 Supersedes가 가리키는 CF-304 근거를 따른다. 이 문서는 어떤 테스트를 왜 지웠고 무엇을 잃었는지만 적는다.

## 승인 후보

프론트 테스트 삭제 결정(CF-417): 2026-11-05 사용자 결정("그냥 다 삭제")으로 20초 넘는 테스트 파일 38개(CF-177 C2·C3·C7·C10 등 에이치닷·현대·네이버·SK·안랩 fixture 통합 테스트와 사이드패널 App 테스트 2개 포함)와 그 파일만 import하던 보조 파일 2개를 지웠다. 삭제 전 단독 실행 측정에서 38개 모두 다른 테스트가 덮지 않는 statement가 0이었고, 삭제 뒤 unit·browser 전체 커버리지는 statements 89.08·branches 85.65·functions 92.88·lines 91.55로 80% 기준을 넘는다(삭제 전 90.45/87.35/93.99/92.84). 테스트 파일 597→559, 테스트 7,185→6,528, 로컬 전체 78초이며 CI shard 합계는 약 2,808초에서 약 760초로 준다. 지워진 시나리오(2단계 재실행 무중복 기입, 전공 세부 활성화, 학교 실패 시 수동 행, 범용 대형 페이지 API 호출 수, 현대 병역·보훈 조건부 기입, 구조 반복 종료·안전 한도, 사이드패널 탭 상태 등)는 자동 테스트가 더 지키지 않으며 재발은 실사이트 QA로만 잡힌다. 파일은 Git 이력(13d84d5f 이전)에서 되살릴 수 있고 fixture 자산(frontend/fixtures, frontend/tests/fixtures의 html·json)은 보존했다.

## 결정 경위

CF-415 측정(develop 13d84d5f, run 41847479073)에서 테스트 파일 597개·총 2,808초 중 20초 넘는 38개 파일이 2,049초(73%)를 차지했다. 38개를 각각 단독으로 실행해 statement 커버리지를 재면 모두 다른 테스트가 덮지 않는 statement가 0이었다(가벼운 파일 559개가 statement 90.4%를 이미 덮음). 그러나 파일 머리말은 각각 CF-177 C2·C3·C7·C10 같은 실사이트 버그를 고정하고 있어 커버리지만으로는 "불필요"를 가를 수 없었고, 2026-11-05 사용자가 "그냥 다 삭제"로 결정했다. shard 가중치 분배 대안(약 15분→7분)은 삭제로 필요가 줄어 하지 않았다.

## 지운 파일

테스트 파일 38개는 Issue #417 본문 목록과 같다(`src/autofill/workflow/AutofillWorkflow.hplace-*.test.tsx` 11개, `src/autofill/generic/*` 7개, `src/autofill/workflow/dom-snapshot.*` 5개, `src/autofill/policy/*` 3개, `entrypoints/sidepanel/App.tabs.test.tsx`·`App.test.tsx`, 현대 병역·보훈 통합 테스트, 그 외). 보조 파일 2개(`src/autofill/adapters/hyundai/workflow-military-veteran.integration.test-fixtures.tsx`, `tests/fixtures/generic-certificate/generic-certificate-fixtures.ts`)는 지운 테스트만 import했다. sanitized DOM 스냅샷과 fixture 자산은 지운 테스트만 참조하는 3개(`fixtures/dom-snapshots/ahnlab-write-resume-form`, `sk-careers-application-form`, `fixtures/generic-autofill/pages/large-generic-form.html`)가 있어도 보존했다.

## 측정

| 항목 | 삭제 전 | 삭제 후 |
|---|---|---|
| 테스트 파일 / 테스트 | 597 / 7,185 | 559 / 6,528 |
| statements / branches / functions / lines | 90.45 / 87.35 / 93.99 / 92.84 | 89.08 / 85.65 / 92.88 / 91.55 |
| CI shard 합계(워커 1개) | 2,808초 | 약 760초(추정) |
| 로컬 `npm run coverage`(unit·browser) | - | 78초(14코어) |

## 잃은 것

지워진 시나리오는 자동 테스트가 더 지키지 않는다. 2단계 재실행 시 무중복 기입, 전공 세부 활성화 후 기입, 학교 실패 시 전공 수동 행, 범용 대형 페이지의 API 호출 수 최소화, 현대 병역·보훈 조건부 기입, 범용 구조 반복의 종료·안전 한도, 네이버 행 추가, 사이드패널 탭 상태 유지 등이다. 재발은 실사이트 QA(`cf-live-autofill-evaluation`)로만 잡힌다. 파일은 Git 이력(13d84d5f 이전)에서 되살릴 수 있다.

## 근거

- Issue #417 본문, PR 본문의 검증 기록(Source-Revision 7d2436bf)
- CF-415 raw `frontend-ci-path-filter.md`의 실행 시간 측정, 파일별 단독 커버리지 실행(2026-11-05 로컬)
- `frontend/vitest.config.ts`, `frontend/tests/vitest/run-policy.ts`(네 지표 80%)

# 프론트 테스트 shard 실행과 병합 검증 경계

근거: [CF-304](https://github.com/woowacourse-teams/2026-career-form/issues/304).

Approval-Digest: 1353a9195e46ac8fd65e3b6c6fb4ce01fc241997b71801d04ea16584531abb88

## 실행 계약

`unit`(jsdom)과 `browser`(Playwright Chromium) 프로젝트 구성, 브라우저 8개 사례, 합성 fixture 경계는 CF-178 실행 경계(`llm-wiki/raw/issues/CF-178/documents/browser-testing.md`)를 유지한다. 바뀐 것은 실행 방식이다.

- 설정 파일의 단일 워커 제한(`maxWorkers: 1`)은 제거했다. 로컬은 Vitest 기본 워커 수를 쓰고, CI shard는 `--maxWorkers=1`로 실행한다.
- 로컬 `npm run coverage`는 한 명령으로 두 프로젝트를 실행하고, statements, branches, functions, lines 80% 기준과 browser 수집 검사를 적용한다.
- CI는 `npm run coverage:shard -- --shard=<i>/8 --maxWorkers=1`을 여덟 job에서 실행한다. 각 shard는 기본 보고를 로그에 출력하고 blob 보고서를 artifact(보존 1일)로 올린다.
- `통합 커버리지 검증` job은 보고서 여덟 개가 모두 있는지 확인한 뒤 `npm run coverage:merge`를 실행한다. 테스트 실패, browser 명세 미수집, 커버리지 기준 미달 중 하나라도 있으면 실패한다.
- `continue-on-error`나 재시도로 실패를 성공으로 바꾸지 않는다. 프론트엔드 CI는 브랜치 보호 필수 검사에 포함되지 않는다.

## 제품 수집 캐시와 테스트 제한 시간

- `genericFormGroupFor(element)`는 입력칸마다 `genericFormGroups(document)`로 문서 전체 그룹을 다시 계산했다. `genericFormGroups(root)`는 이제 `cachedDomRead(root, "generic-form-groups", ...)`로 동기 읽기 패스 안에서만 결과를 재사용한다. 패스 밖이나 다음 패스에서는 다시 계산한다(`generic-form-groups.test.ts`).
- 로컬 단일 워커 coverage 기준으로 무거운 fixture 6개 파일이 189초에서 134초로, 전체 테스트 시간 합계가 943초에서 774초로 줄었다. 결과값 고정 테스트를 포함한 전체 테스트가 기대값 변경 없이 통과했다.
- 캐시 뒤 남은 비용은 `collectSemanticContext` 37%, `genericLabelOf` 22%, `trustedLabels` 18%다(대형 범용 폼 기준).
- 상태를 바꿔 가며 분석을 반복하는 테스트는 평소 CI에서도 15~20초가 걸려 느린 러너에서 30초를 넘었다. 이미 30초를 명시한 실사이트 fixture 테스트 6개 파일(`generic-analysis.integration`, `structure-loop`, `section-segments`, `dom-snapshot.sk-careers`, `dom-snapshot.title-only`, `field-grading`)의 제한을, 같은 종류 테스트가 쓰던 120초로 맞췄다. unit 기본 `testTimeout` 15초와 단언, 기대값은 그대로다.

## Vitest 4.1.10 동작

- `--shard` 실행도 shard 단위로 coverage thresholds를 검사한다. shard 하나는 전체의 일부만 담으므로 `tests/vitest/run-policy.ts`가 argv의 `--shard`를 보고 thresholds를 비운다. 병합 실행에는 `--shard`가 없어 네 기준이 그대로 적용된다.
- CLI `--reporter=blob`은 config의 reporters를 대체한다. shard에서는 browser 수집 검사가 동작하지 않는다.
- `--merge-reports`는 reporter의 `onInit`과 `onTestRunStart`를 pool이 포함된 specification으로 다시 호출한다. 그래서 reporter 기반 browser 수집 검사가 병합 결과에서 동작한다.
- 로컬에서 shard 하나만 병합하면 기준 미달로 실패하고, browser 명세가 없는 blob을 병합하면 수집 검사로 실패하는 것을 확인했다.

## shard 수와 워커 수 결정

- 첫 PR 실행(shard 3개, Vitest 기본 워커 3개, 러너 nproc 4)에서 무거운 fixture 테스트가 테스트당 2~3배 느려져(예: 16초에서 40~54초) 30초 제한을 넘었다. 같은 러너 안의 병렬 jsdom 워커는 경합만 늘렸다.
- 그래서 shard당 워커를 1개로 두고 shard 수로 병렬화한다. 단일 워커 CI의 파일별 시간과 Vitest의 경로 해시 분배를 재현하면, 8개일 때 가장 무거운 shard가 약 214초, 6개일 때 약 271초, 3개일 때 약 449초다.
- 테스트별 시간은 단일 워커 develop 실행과 같게 유지된다.

## 진단 근거

CF-304 시점(develop `9b79fd1`)의 단일 워커 CI는 테스트 단계에 약 1,150초를 썼다. 2026-10-19~20 실행 36회 중 성공은 8회였고, 실패 표본 14건 중 13건이 30초 테스트 제한 초과였다.

- 상위 20개 jsdom 실사이트 fixture 파일이 테스트 시간의 61%를 차지했다.
- 테스트 4,414개 중 10초 이상인 14개가 시간의 33%, 5초 이상인 39개가 50%를 차지했다. 대부분 `sk-careers-application-form`이나 `large-generic-form` 전체를 수집, 분석한다.
- 가장 느린 파일의 CPU 시간 중 95%가 jsdom 내부, 79%가 셀렉터 엔진(`querySelectorAll`, `closest`, `matches`)에서 쓰였다.
- V8 커버리지 계측을 켜면 같은 파일 실행 시간이 약 2배가 됐다.
- CI 러너 편차로 같은 파일이 실행마다 70초에서 151초까지 달라졌다.

실사이트 fixture 테스트 경량화와 제품 DOM 조회 비용 축소는 이 Issue 범위 밖이다. Issue로 만들지 않고 후속 후보로만 남긴다.

결정과 대안은 [ADR](adr/304-frontend-test-sharding.md)에 기록한다.

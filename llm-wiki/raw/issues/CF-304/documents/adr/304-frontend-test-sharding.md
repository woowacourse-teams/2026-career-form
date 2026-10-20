# 프론트엔드 테스트의 CI shard 분할과 커버리지 병합

## 상태

승인됨. Issue 계약과 지식 후보 묶음에 대한 사람 승인을 받았다.

Approval-Digest: 7a00004c1382c5d9a3dc7c67868c7828594f155b5e905e79b2a5d00585d37e3d

## 날짜

2026-10-20

## 관련 Issue

- [CF-304](https://github.com/woowacourse-teams/2026-career-form/issues/304)
- 대체 대상: CF-178 ADR(`llm-wiki/raw/issues/CF-178/documents/adr/178-browser-interaction-test-boundary.md`)의 "CI는 같은 coverage 명령 한 번으로 실행" 결정

## 배경

단일 job, 단일 워커로 jsdom 실사이트 fixture 테스트와 V8 커버리지를 실행하면 실행 시간이 테스트 시간 총합과 같아진다. 러너 성능 편차만으로 30초 테스트 제한과 30분 job 제한을 넘어 실패가 반복됐다.

## 검토한 대안

1. 한 러너 안에서 워커 수만 늘린다. 첫 PR 실행에서 4 vCPU 러너의 병렬 jsdom 워커가 무거운 테스트를 2~3배 느리게 만들어 제한 시간을 넘었으므로 채택하지 않는다.
2. 테스트 제한 시간을 늘린다. 실패는 줄지만 실행 시간이 그대로이고 실제 정지와 구분하기 어려워 채택하지 않는다.
3. 제품 DOM 조회를 최적화한다. 근본 비용을 줄이지만 제품 동작을 바꾸므로 별도 작업으로 둔다.
4. 고정 개수 shard job으로 나누고 blob 보고서를 병합해 기준을 한 번 검사한다. 러너를 여러 대 쓰면서 기존 기준을 그대로 유지할 수 있어 선택한다.

## 결정

CI는 프론트엔드 테스트를 shard job 8개에서 shard당 워커 1개로 실행한다. 로컬은 Vitest 기본 워커 수를 쓴다. 병합 job에서 커버리지 네 지표 80%와 browser 수집 검사를 적용한다. shard 실행은 커버리지 기준을 검사하지 않는다. 로컬 `npm run coverage`는 한 명령으로 두 프로젝트를 실행한다. 제한 시간, 단언, 기준은 바꾸지 않는다. 보호 영역 workflow 변경은 사용자 선택으로 이 Issue에 포함했고 `harness-change` 라벨과 공유 파일 검사는 유지한다.

## 결과

실행 시간이 가장 느린 shard와 병합 시간으로 줄어든다. shard마다 설치가 반복돼 러너 사용 시간이 늘고 blob artifact를 관리해야 한다. 새 무거운 테스트가 한 shard에 몰리면 shard 수나 파일 배치를 다시 측정해야 한다. 실제 CI 소요 시간은 PR 검증 기록에 남긴다.

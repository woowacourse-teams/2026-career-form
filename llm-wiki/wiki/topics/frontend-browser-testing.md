# 프론트 브라우저 테스트

> Topic: frontend-browser-testing
> Status: Current
> Current: [CF-417 20초 넘는 fixture 통합 테스트 38개 삭제 결정과 측정](../../raw/issues/CF-417/documents/slow-fixture-test-removal.md)
> History: [CF-304 shard 실행과 병합 검증 경계](../../raw/issues/CF-304/documents/frontend-test-sharding.md); [CF-178 실행 경계](../../raw/issues/CF-178/documents/browser-testing.md); [CF-415 프론트엔드 CI의 frontend 경로 필터와 실행 시간 측정](../../raw/issues/CF-415/documents/frontend-ci-path-filter.md); [CF-417 20초 넘는 fixture 통합 테스트 38개 삭제 결정과 측정](../../raw/issues/CF-417/documents/slow-fixture-test-removal.md)
> Updated: 2026-11-05

## 현재 상태

기존 jsdom 단위 테스트와 Playwright Chromium 상호작용 테스트를 Vitest의 별도 프로젝트로 실행한다. 합성 달력, 실제 같은 출처 iframe 탐색, Shadow CSS 클릭 전달은 브라우저에서 확인하고, 기존 단위 회귀와 네 지표 80% 커버리지 기준을 유지한다.

로컬 `npm run coverage`는 한 명령으로 두 프로젝트를 실행한다. CI는 여덟 shard job이 워커 1개로 blob 보고서를 만들고, 병합 job이 보고서 여덟 개를 확인한 뒤 `npm run coverage:merge`로 테스트 실패, browser 미수집, 커버리지 미달을 검사한다. CF-415부터 이 CI는 `frontend/**`나 `frontend-ci.yml`을 바꾼 pull_request와 develop·main push에서만 실행되며, develop 보호 규칙에 필수 상태 체크가 없어 건너뛰어도 머지는 막히지 않는다. 2026-11-04 측정으로 597개 파일·2,808초 중 20초 넘는 38개 파일이 73%를 차지하고 shard 합계가 146~702초로 치우쳐 FE PR CI는 14~16분이며, shard 균형 분배와 느린 fixture 테스트 정리는 별도 FE 작업이다([CF-415 근거](../../raw/issues/CF-415/documents/frontend-ci-path-filter.md)). shard 실행은 커버리지 기준을 검사하지 않는다. 범용 폼 그룹 계산은 읽기 패스 안에서 캐시한다. 2026-11-05 CF-417에서 20초 넘는 fixture 통합 테스트 38개(CF-177 C-시리즈 에이치닷·현대·네이버·SK·안랩 시나리오, 사이드패널 App 테스트 2개)와 보조 파일 2개를 사용자 결정으로 지웠다. 삭제 뒤 테스트 파일 559개·테스트 6,528개, 커버리지 statements 89.08·branches 85.65·functions 92.88·lines 91.55이고 CI shard 합계는 약 2,808초에서 약 760초로 준다. 지워진 시나리오의 회귀는 자동 테스트가 더 잡지 않고 실사이트 QA에 의존한다. 같은 작업에서 vitest `sequence.hooks`를 `list`로 바꿔 setup의 `cleanup`이 파일별 afterEach(URL 되돌리기·정책 해제)보다 먼저 돌게 했다. 기본 `stack` 역순에서는 아직 돌고 있는 워크플로가 바뀐 환경을 보고 `Missing hidden-code execution rules`로 간헐 실패했다([CF-417 근거](../../raw/issues/CF-417/documents/slow-fixture-test-removal.md)). 브라우저 미수집이나 미설치를 성공으로 처리하지 않는다. 이 계층의 성공을 설치 확장 E2E, 실사이트 성공률 또는 R1 기준선으로 해석하지 않는다. 원격 CI 성공은 실제 PR check를 별도로 확인한다.

## 변경 이유

CF-417은 frontend PR CI 14~16분의 73%를 차지하던 느린 fixture 통합 테스트를 사용자 결정으로 지우고, 잃은 회귀 범위를 기록했다. CF-415는 frontend를 바꾸지 않은 BE·Infra PR에서도 shard 8개가 14~16분씩 돌던 낭비를 경로 필터로 없앴다. jsdom의 문서 속성 재정의와 CSS 모사만으로는 실제 포커스, iframe 문서 수명과 클릭 전달을 입증할 수 없어 브라우저가 필요한 경계만 분리했다(CF-178). 단일 워커, 단일 job 실행은 테스트 시간 총합이 CI 시간이 되어 러너 편차만으로 제한 시간을 넘었기 때문에 shard 분할과 병합 검증으로 바꿨다(CF-304). 세부 대안은 연결된 raw의 ADR에서 확인한다.

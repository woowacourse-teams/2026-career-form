# jsdom 단위 테스트와 Chromium 상호작용 테스트의 분리

## 상태

승인됨. Issue 계약과 지식 후보 묶음에 대한 사람 승인을 받았다.

Approval-Digest: a44d4319a65cb6f0fc17934d216e915b38e1c1fec8acb5c1d1839957fa6b7013

## 날짜

2026-10-11

## 관련 Issue

- [CF-178](https://github.com/woowacourse-teams/2026-career-form/issues/178)

## 배경

브라우저의 포커스, iframe 문서 수명, Shadow CSS와 클릭 전달을 jsdom의 속성 재정의로 검증하면 브라우저 동작과 테스트 모사가 다를 수 있다. 반대로 순수 판정과 대량 조합 테스트까지 브라우저로 옮기면 실행 비용과 비동기 실패 가능성이 커진다. 테스트 실행 계층과 책임 경계는 후속 테스트 추가 및 CI 운영에 지속적으로 영향을 준다.

## 검토한 대안

1. jsdom만 유지하고 mock을 보강한다. 실행이 빠르고 변경이 작지만 실제 브라우저 의미론을 검증할 수 없다.
2. 전체 Vitest를 Browser Mode로 전환한다. 환경은 통일되지만 Node API, DOM mock, fake timer와 전체 회귀의 전환 비용이 이번 목적보다 크다.
3. unit(jsdom)과 browser(Playwright Chromium)를 같은 Vitest 구성의 별도 프로젝트로 둔다. 기존 빠른 회귀를 유지하면서 브라우저가 필요한 행동만 검증할 수 있으므로 선택한다.
4. 별도 Playwright E2E 체계를 만든다. 설치 확장 프로그램과 service worker 검증에는 적합하지만 이번의 제품 함수/DOM 상호작용 테스트에는 실행기와 fixture 운영이 중복된다. 기존 test:panel은 자체 목적대로 유지한다.

## 결정

Vitest 4.1.10을 유지하고 같은 버전의 @vitest/browser-playwright를 사용한다. Playwright와 이에 대응하는 Chromium revision은 설치된 의존성으로 고정한다. 명시적인 파일 규칙으로 unit/browser를 분리하되 npm test와 coverage는 두 프로젝트를 함께 실행한다. 첫 전환은 날짜 선택, 같은 출처 검색 iframe, Shadow DOM 클릭 전달의 세 경계로 제한한다. 합성 fixture와 제품 함수를 사용하며 네트워크 공급자/사용자 세션/실사이트는 테스트 경계 밖에 둔다. 브라우저 결과를 얻기 위해 제품 동작이나 안전 경계를 바꾸지 않는다. fixture 비동기는 이벤트 기반으로 제어한다.

CI를 별도 후속 작업으로 미루는 대안은 CF-175에서 연결한 원래 범위 및 사용자의 통합 선택과 맞지 않아 채택하지 않는다. 새 frontend-ci.yml에서 같은 coverage 명령으로 unit/browser를 함께 실행한다. 보호 영역 분리 규칙은 이번 workflow 추가에 한해 예외로 하고 harness-change 라벨과 공유 파일 검사는 유지한다. 브랜치 보호 설정은 변경하지 않는다.

## 결과

실제 브라우저 동작과 직접 연결된 회귀 근거를 얻고, 새 상호작용 테스트를 어느 계층에 둘지 기준을 제공한다. Chromium 설치와 브라우저 프로세스 비용, browser 전용 ESM mock 제약 및 fixture cleanup 책임이 추가된다. PR마다 브라우저 테스트가 실행되므로 runner 비용도 발생한다. 실행 시간과 메모리 수치는 구현 시 측정해 기록하며 임의의 개선 수치를 약속하지 않는다. 순수 의미 분석/분류는 jsdom에 남고, 확장 프로그램 설치 E2E와 실사이트 기준선은 별도 증거가 필요하다. 테스트 전환과 실제 CI check 확인이 모두 끝나야 이 Issue를 완료한다.

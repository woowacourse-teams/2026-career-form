# 지원서 페이지 분석 기술 결정

## 상태

조건부 채택. 자동 PoC 결과로 기술 방향을 정했으며 삼성·SK·CJ 실제 페이지 검증이 남아 있다.

## 결정

- 운영 분석 기술: Chrome 확장 프로그램에서 실행되는 네이티브 DOM API
- 자동 회귀 기술: Playwright Test와 비식별 HTML fixture
- 실제 페이지 검증: Manifest V3 `activeTab` + `scripting` 기반 읽기 전용 probe
- 제외: Cheerio를 운영 분석기로 사용하지 않음

## 비교

| 기준 | 네이티브 DOM API | Playwright | Cheerio |
| --- | --- | --- | --- |
| 확장 프로그램 런타임 적합성 | 높음 | 낮음 | 중간 |
| 현재 동적 DOM 관찰 | 가능 | 가능 | 불가능 |
| 열린 Shadow DOM | 직접 순회 가능 | locator 지원 | 브라우저 상태 없음 |
| iframe | same-origin만 직접 접근 | frame locator 제공 | 전달된 문자열만 분석 |
| 자동 회귀 | 브라우저 harness 필요 | 높음 | 정적 markup에 한정 |
| 런타임 비용 | 낮음 | 높음 | 낮음 |
| 선택 | 운영 채택 | 테스트 채택 | 운영 제외 |

## 근거

Chrome 공식 문서는 Manifest V3에서 `chrome.scripting.executeScript()`를 사용하려면 `scripting`과 host permission 또는 `activeTab`이 필요하다고 설명한다. `activeTab`은 사용자 동작 후 현재 탭에 임시 접근을 부여하므로 상시 host permission 없이 수동 probe를 실행할 수 있다.

- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab

Playwright locator는 동적으로 변하는 DOM을 다시 조회하며 iframe과 열린 Shadow DOM 검증 수단을 제공한다. 따라서 실제 제품 런타임에 포함하지 않고 재현 가능한 브라우저 회귀 테스트에 사용한다.

- https://playwright.dev/docs/locators

Cheerio 공식 문서는 Cheerio가 브라우저가 아니며 렌더링, 외부 리소스 로딩과 JavaScript 실행을 하지 않는다고 명시한다. 동적으로 렌더링된 현재 지원서 상태가 핵심인 이번 요구에는 운영 분석기로 적합하지 않다.

- https://cheerio.js.org/docs/intro

## PoC 결과

- text, textarea, select, radio, checkbox와 contenteditable을 구조화해 분류한다.
- hidden, disabled, password와 민감 autocomplete는 `unsupported`로 안전하게 실패한다.
- ARIA combobox, listbox, textbox, checkbox와 radio는 쓰기 의미를 추측하지 않고 `review-required`로 분류한다.
- 접근 가능한 iframe과 열린 Shadow DOM을 재귀 분석한다.
- sandbox/cross-origin iframe과 닫힌 Shadow DOM 기반 custom element는 접근 불가 경계로 드러낸다.
- 분석 전후 fixture DOM이 동일하다.
- 결과와 probe 보고서에 값, 레이블, selector, DOM과 URL을 포함하지 않는다.

## 알려진 한계

- 교차 출처 iframe은 상위 문서에서 내부 DOM에 접근할 수 없다.
- 닫힌 Shadow DOM은 외부 코드가 내부 요소를 열람할 수 없다.
- 커스텀 widget의 값 쓰기 방식은 구조만으로 확정할 수 없다.
- 페이지가 사용자 동작 뒤 필드를 생성하면 동작 전후에 각각 probe를 실행해야 한다.
- 실제 기업 사이트는 공고와 시점에 따라 구조가 바뀌므로 삼성·SK·CJ 수동 검증이 완료되기 전에는 범용 적합성을 확정하지 않는다.

## 후속 후보

- 운영 확장 프로그램 페이지 분석기 통합
- 공통 규칙 기반 매핑 엔진
- 삼성·SK·CJ 전용 어댑터와 기업별 회귀 fixture 유지 절차
- 교차 출처 iframe을 포함한 지원 불가 필드의 사용자 안내 UX

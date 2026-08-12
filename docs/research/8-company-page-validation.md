# 삼성·SK·CJ 지원서 페이지 검증 기록

## 기록 원칙

- 실제 지원서 페이지의 입력값, 레이블 원문, DOM, selector, URL 경로·쿼리와 세션 정보는 기록하지 않는다.
- 사용자가 직접 로그인하고 페이지로 이동한 뒤 읽기 전용 probe를 실행한다.
- fixture 통과는 실제 사이트 검증을 대체하지 않는다.
- 화면에서 사람이 센 입력 후보와 probe의 `totalCandidates`를 대조한다.
- 모든 후보가 `supported`, `review-required`, `unsupported` 중 하나로 분류되어야 `검증 완료`로 표시한다.

## 자동 fixture 검증

| 구조 fixture | 재현한 특성 | 자동 검증 상태 |
| --- | --- | --- |
| Samsung | 중첩 그룹, native input, ARIA combobox | 통과 |
| SK | 사용자 동작 후 생성된 필드, ARIA listbox | 통과 |
| CJ | contenteditable, ARIA checkbox, 접근 불가 iframe | 통과 |

기업 fixture는 기업별 실제 DOM이나 selector를 복사하지 않은 비식별 구조 예시다.

## 실제 페이지 검증

| 기업 | 검증일 | 출처 | 화면 후보 | probe 후보 | supported | review-required | unsupported | 경계 | 누락 | 상태 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 삼성 | - | 사용자 접근 필요 | - | - | - | - | - | - | - | 미검증 |
| SK | - | 사용자 접근 필요 | - | - | - | - | - | - | - | 미검증 |
| CJ | - | 사용자 접근 필요 | - | - | - | - | - | - | - | 미검증 |

## 사용자 수동 검증 절차

1. `npm --prefix spikes/page-analysis run build`를 실행한다.
2. Chrome `chrome://extensions`에서 개발자 모드를 켠다.
3. `spikes/page-analysis/dist/extension`을 압축 해제된 확장 프로그램으로 로드한다.
4. 사용자가 해당 기업 지원서 페이지에 직접 로그인하고 이동한다.
5. 화면의 입력 후보 수를 센 뒤 probe의 `현재 탭 분석`을 실행한다.
6. 동적으로 펼쳐지는 영역은 사용자가 직접 펼친 후 다시 실행한다.
7. 위 표에는 비식별 집계와 누락 수만 기록한다.

## 판정

현재 자동 fixture 검증은 완료됐지만 실제 삼성·SK·CJ 페이지는 모두 `미검증`이다. 따라서 Issue #8의 실제 기업 검증 인수 조건은 아직 충족되지 않았다.

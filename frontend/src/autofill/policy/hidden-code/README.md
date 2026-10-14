# DB 행동 규칙 실행기

회사 식별은 설치된 정책의 host/path를 사용한다. 실제 사이트 선택자와 코드, 프로필 연결, 조건 관계는 서버의 `browserPolicy.hiddenCodeContract`에서 받으며 이 디렉터리에 기본 회사 정책은 없다.

- `behavior.conditionalStates`: 선택값마다 기대하는 활성화·필수 상태. 없는 선택 필드를 허용할지도 데이터로 지정한다.
- `behavior.dependencies`: 어떤 필드를 입력하기 전에 어떤 선택과 상태 확인을 요구할지 지정한다.
- `rowKinds`, `rowPreparation`, `groupKinds`, `rowActions`: 프로필 분류, 처리 순서, 화면 반복 행 식별과 준비 전략.
- `searches`, `fixedCodeSearches`: 검색 필드, 프로필 키, 카탈로그 종류, 허용 코드, 직접 입력 여부.
- `drivers`, `settlements`, `failureScopes`: 실행 순서, 다음 입력 준비 조건, 필요 시 누를 버튼, 실패 보류 범위.
- `textControls`, `codedButtons`, `catalogButtons`, `catalogTexts`: 필드별 입력 형식과 코드 확인 계약.
- `address`: 결과 선택 방식, 입력 가능한 주소 상태와 반영 확인 기준.
- `modules`: 위 동작이 사용하는 DOM 선택자·템플릿과 위젯 코드 표.

`dom-condition.ts`는 all/any, query/closest/parent 탐색, 개수·활성화·필수·값 조건만 해석한다. 자바스크립트나 eval은 받지 않는다. 클릭, 입력, 변경 대기, 중단 신호, 대상 동일성, 기존 값 보존은 공통 실행 기능이다.

계약 v2의 스키마는 목록의 원래 길이를 강제하지 않는다. 동일한 지원 연산의 규칙을 추가할 때 프론트 수정이 필요하지 않다. 새로운 위젯 실행 방식에는 공통 실행 기능을 추가해야 한다.

`adapters/hyundai/`에는 테스트와 fixture만 남아 있다. 실제 실행 경로와 테스트는 공통 실행기를 사용한다. 테스트 실행 시에도 문서에 실행 정책을 먼저 설치해야 한다.

## 로컬 실행 조건 정책 (2026-10-14)

`POST /api/v1/execution-policy`의 `browserPolicy.runtimeRules`가 사이트별 입력 제한, 구조, 선택/성공 판정 조건을 제공한다. 프론트 `runtime-rules.ts`는 데이터 스키마를 검증하고 공통 실행기에 전달한다. 사이트 기본값으로 우회하지 않는다.

명시적 로컬 이관은 `backend/scripts/migrate-execution-policy-behavior.mjs`를 사용한다. SK 35→36, 현대 19→20, 그리팅 13→14이며 이전 문서와 필드/준비 규칙을 보존한다. 서버 시작 시 기존 정책을 seed로 덮어쓰지 않는다. 타입 검사·빌드·세 사이트 실제 API와 저장 문서의 일치는 확인한다. 자동 테스트와 새 빌드의 실사이트 재기입 검증은 수행하지 않았다.

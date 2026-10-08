# 상태 드라이버 실패의 안전 범위 보류

## 적용 경계

CF-142까지의 패널 흐름, 승인과 덮어쓰기 정책은 유지한다. 모든 회사와 범용 경로가 공유하는 `createAnalyzeFields`의 상태 드라이버 실패 처리만 바꾼다.

## 어댑터 경로

어댑터의 `stateDriverFailureGroup`이 범위를 반환하면 그 범위만 보류하고 재분석해 계속하며, 범위가 없으면 예외로 전체 중단하는 기본 규칙은 유지한다.

## 범용 경로

범용 드라이버(`LLM_SUGGESTED`의 `SELECT_OPTION`·`CHECK_RADIO`와 `aria-controls` 제어 영역)가 DOM을 바꾸기 전에 실패했다고 증명되면 해당 드라이버의 요소와 제어 영역을 실패 범위로 보류하고 재분석해 계속한다. 같은 단계에서 성공한 드라이버는 완료로 기록하고, 재분석 횟수 한도(`genericPass`)는 유지한다.

변경 전 실패로 보는 기준은 `isPreMutationFailure`에 있다. 결과의 outcome이 `unsupported` 또는 `unchanged`이거나 코드가 `CONFLICT`, `NOT_APPROVED`, `DUPLICATE_BINDING`, `REVIEW_UNAVAILABLE`이면 변경 전이다. `STALE_TARGET`, `EXECUTION_FAILED`, `RETAINED_VALUE_UNCONFIRMED`는 변경 후이거나 불확실하다고 보고, 범용 정착 확인 실패와 함께 기존처럼 결과 화면에서 멈춘다. 같은 단계 결과 중 하나라도 불확실하면 보류하지 않는다.

## 실패 코드와 사유

일치하는 선택지가 하나도 없을 때 네이티브 select, 버튼 드롭다운, Greeting 버튼 선택이 `OPTION_UNMATCHED`를 보고한다. 보류 사유는 원인별로 구분한다. 선택지 불일치는 해당 항목만 건너뛴 사실과 프로필 확인 안내를, 그 밖의 범용 보류는 조건부 선택을 적용하지 못해 연결된 입력란을 건너뛴 사실을 알린다. 사유에 실제 프로필 값은 넣지 않는다.

## 검증 범위

합성 DOM에서 불일치 select와 그 제어 영역만 건너뛰고 독립 항목과 다른 드라이버 영역은 입력됨을, 쓰기 뒤 값 유지 확인 실패는 기존 동작임을 확인했다. 실제 설치 확장 확인은 사람 담당이다.

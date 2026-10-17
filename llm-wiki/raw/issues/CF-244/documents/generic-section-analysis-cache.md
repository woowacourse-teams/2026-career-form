# 범용 섹션 분석 캐시의 키와 수명

## 승인한 지식 후보

범용 섹션 흐름의 캐시는 섹션 지문, 제목, 상위 제목, 반복 행 여부, 칸별 visibility/disabled/readonly/inert를 키로 하고 워크플로우 실행 객체(addressRun.current)별 WeakMap과 URL로 수명을 정한다. 같은 키 섹션은 한 실행 안에서도 대표 하나만 보낸다. 실패와 LLM_UNAVAILABLE 섹션은 캐시하지 않는다.

## 적용과 검증

`frontend/src/autofill/generic/generic-analysis.ts`의 `cacheKey`가 구조·칸 상태를 키로 만든다. `analyzeGenericFields`는 현재 URL이 캐시 URL과 다르면 저장 결과를 버리고, 같은 키의 미분석 섹션은 대표 하나로 묶어 요청한다. 분류·매칭 호출 실패는 캐시에 넣을 성공 결과가 없으며, 칸 응답에 reason이 있으면 매칭 결과를 캐시에 저장하지 않는다.

`frontend/src/autofill/workflow/workflow-analysis.ts`의 `genericAnalysisCaches`는 실행 객체를 WeakMap 키로 쓴다. 캐시 결과는 섹션 안 칸의 위치 순서로 새 snapshot의 candidateId에 다시 연결하고 프로필 값 판정과 등급은 로컬에서 수행한다.

unit 테스트는 같은 DOM 재사용, disabled 상태 변경, 실패 후 재시도와 URL 변경을 검증한다. 대형 합성 문서 integration 테스트는 같은 DOM 재진입, 새 섹션·숨김 해제 섹션만 전송, 같은 구조의 반복 행 재사용과 최대 동시 요청 1건을 검증한다. 실제 provider 성능 측정 결과를 의미하지 않는다.

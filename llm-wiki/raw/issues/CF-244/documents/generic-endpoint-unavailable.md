# 범용 endpoint 부재의 frontend 오류 전달

## 승인한 지식 후보

범용 섹션 분류와 칸 매칭 endpoint의 HTTP 404는 background 응답의 선택 status:404와 RuntimeAnalysisApiClient의 AnalysisServiceError.status로 전달하여 ENDPOINT_UNAVAILABLE로 격리한다. 기존 공유 endpoint의 BAD_REQUEST 응답 형태는 유지한다. 실제 handler와 runtime client를 연결한 테스트로 분류·매칭 양쪽의 404 전파를 검증한다.

## 적용과 검증

`frontend/src/autofill/api/background-handler.ts`는 두 범용 분석 endpoint의 HTTP 404에만 선택 status:404를 붙인다. `api/messages.ts`는 이 선택 메타데이터를 검증하고 `api/runtime-client.ts`는 `AnalysisServiceError.status`로 전달한다. `generic/generic-analysis.ts`의 `failureOf`가 이를 `ENDPOINT_UNAVAILABLE`로 구분한다.

`generic/generic-analysis.test.ts`는 실제 background handler와 runtime client를 연결하고 HTTP 응답만 합성하여 분류·매칭 각각의 404가 해당 칸을 ENDPOINT_UNAVAILABLE로 차단하는지 검증한다. `api/background-handler.test.ts`는 공유 endpoint의 404가 기존 BAD_REQUEST envelope인 것을 유지하고, `api/runtime-client.test.ts`는 잘못된 status 메타데이터를 거부한다.

오래된 backend에서 범용 endpoint가 없다고 공유 분석 API로 재시도하지 않는다. BE 코드, 공유 fields 응답 validator, 정적 정책과 어댑터는 변경하지 않는다.

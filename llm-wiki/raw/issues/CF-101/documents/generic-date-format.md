# 범용 날짜 형식 변환과 로컬 승인

CF-101은 범용 모드에서 실제 프로필 정의의 inputType이 date인 DIRECT 결합에만 날짜 변환을 적용한다. 완전하고 유효한 그레고리력 YYYY-MM-DD 원본을 검증한 뒤 YYYY-MM-DD, YYYY-MM, YYYY.MM, YYYY.MM.DD 중 확인된 목표 형식으로 변환한다. 변환값은 검토 표시, 기존 값 비교와 쓰기에 공유하며 실패 시 원본 fallback을 하지 않는다. 기존 값 결합의 공백 처리, ADAPTER 정적 변환과 DERIVED/YEAR_MONTH는 유지한다.

목표 형식은 현재 입력칸의 native date/month 타입 또는 명확한 점 구분 placeholder와 적용 가능한 제약에서 판별한다. 승인은 로컬 DOM 요소 동일성, type, placeholder와 관련 제약 스냅샷을 보관한다. 쓰기 직전 요소나 형식·제약이 달라졌으면 재변환해 쓰지 않고 보류한다. 대상 입력칸에 시험 값을 넣지 않으며 승인 정보와 DOM 참조를 Backend/LLM 요청에 추가하지 않는다.

합성 통합 검증은 실제 수집기, 검토 모델, 승인된 쓰기와 사후 유지 확인을 연결한다. 이는 설치 확장 UI 검증이나 실제 CJ 검증을 대체하지 않는다. 검증 결과를 보고할 때 자동 통합, 설치 UI, 실사이트 입력을 구분해야 한다. 기존 reviewItemsForDisplay는 unavailable 항목을 제외하므로 개별 날짜 보류 이유가 로컬 모델에 있어도 검토 목록에 표시되지 않는 제한이 있다.

근거: [Issue #101](https://github.com/woowacourse-teams/2026-career-form/issues/101), `frontend/src/autofill/profile/date-format.ts`, `frontend/src/autofill/review/date-target-format.ts`, `frontend/src/autofill/review/review-plan.ts`, `frontend/src/autofill/write/executor.ts`, `frontend/src/autofill/workflow/date-format.integration.test.ts` 및 관련 단위 테스트(Source-Revision 참조).

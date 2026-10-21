# 범용 검토 화면의 3단계 표시

> Topic: generic-review-tiers
> Status: Current
> Current: [CF-307 선택 기반 검토 패널 소속과 개수](../../raw/issues/CF-307/documents/generic-review-tiers.md)
> History: [CF-259 범용 검토 화면의 3단계 표시](../../raw/issues/CF-259/documents/generic-review-tiers.md); [CF-307 선택 기반 검토 패널 소속과 개수](../../raw/issues/CF-307/documents/generic-review-tiers.md)
> Updated: 2026-10-21

## 현재 상태

범용 검토 화면은 수집 후보로 올라온 칸만 AUTO(기본 선택), REVIEW(기본 체크 해제와 확인 필요),
BLOCKED(선택 불가와 입력 불가)로 구분한다. CF-307부터 패널 소속은 실제 선택 상태를 따른다.
선택된 available·비활성 아님·non-BLOCKED 항목은 달력·검색 항목이어도 자동 기입 예정에
들어가고, 배지는 그 목록 길이와 같다. 선택 해제·사용 불가 항목은 예외 목록에 들어가며
BLOCKED는 입력 불가, 나머지는 확인 필요다. 상세는 [현재 근거](../../raw/issues/CF-307/documents/generic-review-tiers.md)를 따른다.

동의·파일·제출 컨트롤은 수집에서 제외돼 나오지 않는다. 입력 불가 칸은 disabled라 토글과
승인으로도 쓰이지 않는다. 표시 대상 밖의 숨은 칸과 전체 DOM control 수를 패널 분모에 섞지 않는다.

등급과 이유 코드는 범용 경로에서만 검토 항목의 `genericGrade`, `genericReasonCode`에
담긴다. 정적·컴포넌트 경로는 이 필드를 만들지 않아 기존 표시와 `unavailable` 숨김이
그대로다. CF-307의 `tiered` guard도 정적 경로의 달력·검색 예외 처리를 보존한다.
매칭 키가 null이라 등급이 없는 칸은 BLOCKED와 UNLINKED 이유로 보충되어
"저장된 정보와 연결하지 못했습니다"로 보인다.

이유 코드와 섹션 실패 코드의 문구는 `genericReasonText` 한 함수가 변환하고 모르는
코드는 일반 문구를 쓴다. 문구 표는 Record 타입이라 새 코드는 문구 없이는 컴파일되지
않는다.

## 변경 이유

범용 검토 화면이 자동·확인 필요·입력 불가를 구분하지 못했고, 연결하지 못한 칸은 목록에서
사라져 사용자가 처리되지 않은 칸을 알 수 없었다. 정적 어댑터 동작을 바꾸지 않고
범용 경로에서만 등급과 이유를 화면에 연결하기 위해서다. CF-259 당시 브라우저 QA와 실사이트
확인은 하지 못했다. CF-307은 기존 분석 세 실행의 배지·목록 일치를 기록하되 실제 기입 성공과
전체 매핑의 반복 실행 동일성은 주장하지 않는다.

## 관련 주제

- [범용 등급의 다른 사람 대상 칸 차단](generic-other-person-context.md)
- [지원서 패널 안 자동 기입 흐름](autofill-panel-workflow.md)

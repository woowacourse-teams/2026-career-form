import type { PreparationFailureReason } from "./executor";

export function preparationFailureMessage(
  reason: PreparationFailureReason,
): string {
  switch (reason) {
    case "expected-fields-not-visible":
      return "조건부 입력 항목이 표시되지 않았습니다";
    case "action-not-ready":
      return "라디오 후보를 다시 찾지 못했습니다";
    case "profile-value-unavailable":
      return "저장된 프로필 값을 사용할 수 없습니다";
    case "option-label-mismatch":
      return "정책 선택값과 현재 라디오가 일치하지 않습니다";
    case "unsupported-option-action":
      return "현재 라디오 선택 방식을 지원하지 않습니다";
    case "action-not-executable":
      return "준비 동작을 실행할 수 없습니다";
    case "action-not-reidentified":
      return "화면 갱신 뒤 추가 동작을 다시 찾지 못했습니다";
    case "invalid-local-item-count":
      return "프로필 항목 수를 확인하지 못했습니다";
    case "invalid-group-count":
      return "지원서의 추가 항목 수를 확인하지 못했습니다";
    case "group-count-not-incremented":
      return "추가 동작의 반영을 확인하지 못했습니다";
    case "refresh-failed":
      return "지원서 화면을 다시 읽지 못했습니다";
    case "target-not-visible":
      return "준비 대상 영역이 표시되지 않았습니다";
    default:
      return "준비 동작을 확인하지 못했습니다";
  }
}

import type { PushStateView } from "./push-messages";
import { MINIMUM_CHROME_VERSION } from "./push-subscription";

const unsupportedText = `Chrome ${MINIMUM_CHROME_VERSION} 이상 필요`;

/** One-line subscription status for the settings dialog and the side panel. */
export function subscriptionStatusText(state: PushStateView | undefined) {
  if (!state) return "확인 중";
  if (!state.supported) return unsupportedText;
  if (!state.enabled) return "꺼짐";
  switch (state.status?.code) {
    case "registered":
      return "등록됨";
    case "failed":
      return "등록 실패 (자동 재시도)";
    case "not_configured":
      return "알림 서버 없음";
    case "endpoint_unavailable":
      return "서버 미지원";
    case "unsupported":
      return unsupportedText;
    default:
      return "등록 확인 중";
  }
}

/** Why new postings are not arriving, for a subscription that is on. */
export function registrationFailureText(state: PushStateView): string {
  if (!state.supported || state.status?.code === "unsupported")
    return `Chrome ${MINIMUM_CHROME_VERSION} 이상에서 받을 수 있어요.`;
  switch (state.status?.code) {
    case "not_configured":
      return "이 빌드에는 알림 서버가 없어요.";
    case "endpoint_unavailable":
      return "서버가 아직 알림을 지원하지 않아요.";
    default:
      return "알림 서버에 등록하지 못했어요. 자동으로 다시 시도하고 있어요.";
  }
}

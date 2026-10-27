import { useId } from "react";
import type { TrackEvent } from "../analytics/events";
import styles from "./JobPostings.module.css";
import type { VisibilityAnswer } from "./notification-check";
import type { PushStateView, RecordSource } from "./push-messages";
import { MINIMUM_CHROME_VERSION } from "./push-subscription";
import { VisibilityCheck } from "./VisibilityCheck";

const unsupportedText = `Chrome ${MINIMUM_CHROME_VERSION} 이상에서만 새 공고 알림을 받을 수 있습니다. 현재 Chrome에서는 구독하지 않습니다.`;
export function subscriptionStatusText(state: PushStateView | undefined) {
  if (!state) return "구독 상태를 확인하는 중입니다.";
  if (!state.supported) return unsupportedText;
  if (!state.enabled) return "꺼짐 · 새 공고 알림을 받지 않습니다.";
  switch (state.status?.code) {
    case "registered":
      return "등록됨 · 새 공고가 등록되면 알림이 옵니다.";
    case "failed":
      return "등록 실패 · 잠시 후 자동으로 다시 시도합니다.";
    case "not_configured":
      return "백엔드 없음 · 이 빌드에는 알림 서버가 설정되지 않았습니다.";
    case "endpoint_unavailable":
      return "서버 미지원 · 서버가 아직 공고 알림을 지원하지 않습니다.";
    case "unsupported":
      return unsupportedText;
    default:
      return "등록 확인 중 · 구독을 서버에 등록하고 있습니다.";
  }
}

interface Props {
  state: PushStateView | undefined;
  failed: boolean;
  busy: boolean;
  onEnabledChange(enabled: boolean): Promise<void>;
  onAutoSaveChange(enabled: boolean): Promise<void>;
  onTest(): Promise<void>;
  onAnswer(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  track: TrackEvent;
  userAgent?: string;
}

export function SubscriptionSettings({
  state,
  failed,
  busy,
  onEnabledChange,
  onAutoSaveChange,
  onTest,
  onAnswer,
  track,
  userAgent,
}: Props) {
  const id = useId();
  const toggle = async (enabled: boolean) => {
    await onEnabledChange(enabled);
    track(
      enabled ? "push_subscription_enabled" : "push_subscription_disabled",
      { surface: "options" },
    );
  };
  return (
    <section
      className={styles.subscription}
      aria-labelledby={`${id}-subscription`}
    >
      <div className={styles.sectionHeading}>
        <h2 id={`${id}-subscription`}>공고 알림 구독</h2>
      </div>
      <div className={styles.subscriptionPanel}>
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            checked={state?.enabled ?? true}
            disabled={!state || busy || !state.supported}
            onChange={(event) => void toggle(event.target.checked)}
          />
          새 공고를 Chrome 알림으로 받기
        </label>
        <p className={styles.subscriptionStatus} role="status">
          {subscriptionStatusText(state)}
        </p>
        {failed && (
          <p className={styles.subscriptionStatus}>
            구독 상태를 불러오지 못했습니다.
          </p>
        )}
        {state?.enabled && state.status?.code === "failed" && (
          <div className={styles.subscriptionActions}>
            <button disabled={busy} onClick={() => void onEnabledChange(true)}>
              다시 등록
            </button>
          </div>
        )}
        <VisibilityCheck
          variant="settings"
          state={state}
          busy={busy}
          onTest={onTest}
          onAnswer={onAnswer}
          track={track}
          surface="options"
          userAgent={userAgent}
        />
        <label className={`${styles.switch} ${styles.switchSpaced}`}>
          <input
            type="checkbox"
            role="switch"
            checked={state?.autoSave ?? true}
            disabled={!state || busy}
            onChange={(event) => void onAutoSaveChange(event.target.checked)}
          />
          공고를 열면 마감 알림에 자동 저장
        </label>
        <p className={styles.subscriptionStatus}>
          알림이나 공지함에서 공고를 열면 마감 24시간·2시간 전 알림을 함께
          저장하고, 바로 취소할 수 있어요. 구독을 꺼도 이 설정은 따로
          유지됩니다.
        </p>
        <ul className={styles.subscriptionNotes}>
          <li>
            Chrome이 완전히 종료된 동안에는 알림이 도착하지 않으며, OS 알림
            설정에 따라 차단되거나 늦게 표시될 수 있습니다.
          </li>
          <li>
            OS 알림이 꺼져 있어도 확장 아이콘 숫자와 공지함으로 새 공고를 알 수
            있어요. 공지함을 열면 숫자가 사라집니다.
          </li>
          <li>
            구독을 켜면 이 브라우저의 푸시 구독 주소가 서버에 저장되고, 끄면
            서버에 삭제를 요청합니다. 프로필 값과 지원서 내용은 보내지 않습니다.
          </li>
        </ul>
      </div>
    </section>
  );
}

import { useState } from "react";
import type { TrackEvent } from "../analytics/events";
import { POSTING_TIME_ZONE } from "./model";
import type { VisibilityAnswer, VisibilityState } from "./notification-check";
import type { PushStateView, RecordSource } from "./push-messages";
import styles from "./VisibilityCheck.module.css";

export type VisibilityVariant =
  "onboarding" | "question" | "confirm" | "settings";
interface Props {
  variant: VisibilityVariant;
  state: PushStateView | undefined;
  busy: boolean;
  onTest(): Promise<void>;
  onAnswer(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  onLater?(): Promise<void>;
  onDisable?(): Promise<void>;
  track: TrackEvent;
  surface: "options" | "extension_onboarding";
  userAgent?: string;
}

function shortDate(at: number | undefined): string {
  if (at === undefined) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: POSTING_TIME_ZONE,
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.month}/${parts.day}`;
}
export function visibilityText(visibility: VisibilityState): string {
  if (visibility.result === "seen")
    return `알림 표시 확인됨 · ${shortDate(visibility.checkedAt)}`;
  if (visibility.result === "not_seen")
    return "보이지 않는다고 응답 · 설정 안내";
  return "아직 확인하지 않음";
}

const MAC_GUIDE =
  "macOS: 시스템 설정 › 알림 › Google Chrome에서 알림 허용을 켜고 알림 스타일을 배너나 알림으로 두세요. 집중 모드가 켜져 있으면 알림이 숨겨질 수 있어요.";
const WINDOWS_GUIDE =
  "Windows: 설정 › 시스템 › 알림에서 알림을 켜고 Google Chrome을 허용하세요. 방해 금지가 켜져 있으면 알림이 숨겨질 수 있어요.";
const CHROME_GUIDE =
  "Chrome에서 이 확장의 알림을 껐다면 Chrome 설정 › 개인정보 보호 및 보안 › 사이트 설정 › 알림에서 Career Form 확장을 허용으로 바꾸세요.";
// Text only: the extension never opens or changes system settings itself.
export function osGuidance(userAgent: string): string[] {
  const mac = /Mac OS X|Macintosh/.test(userAgent);
  const windows = /Windows/.test(userAgent);
  const lines = mac
    ? [MAC_GUIDE]
    : windows
      ? [WINDOWS_GUIDE]
      : [MAC_GUIDE, WINDOWS_GUIDE];
  return [...lines, CHROME_GUIDE];
}

export function VisibilityCheck({
  variant,
  state,
  busy,
  onTest,
  onAnswer,
  onLater,
  onDisable,
  track,
  surface,
  userAgent = navigator.userAgent,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "asking">("idle");
  const [answeredHere, setAnsweredHere] = useState(false);
  const [disabledHere, setDisabledHere] = useState(false);
  const visibility = state?.visibility ?? { result: "unknown" };
  const known = visibility.result !== "unknown";
  const card = variant === "question" || variant === "confirm";
  if (card && known && !answeredHere) return null;
  if (variant === "question" && !answeredHere) {
    if (visibility.askLaterAt !== undefined || (state && !state.enabled))
      return null;
  }
  const needsGuidance =
    phase === "idle" &&
    (visibility.result === "not_seen" || state?.permission === "denied");
  const test = async () => {
    track("notification_test_sent", { surface });
    setPhase("asking");
    await onTest();
  };
  const answer = async (value: VisibilityAnswer, source: RecordSource) => {
    track("notification_visibility_answered", { surface, answer: value });
    setPhase("idle");
    setAnsweredHere(true);
    await onAnswer(value, source);
  };
  const testButton = (primary = false) => (
    <button
      className={primary ? styles.primary : undefined}
      disabled={busy}
      onClick={() => void test()}
    >
      알림 테스트
    </button>
  );
  const asking = phase === "asking" && (
    <div className={styles.ask} role="group" aria-label="알림 표시 확인">
      <p>방금 알림이 보였나요?</p>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={busy}
          onClick={() => void answer("seen", "test")}
        >
          보였어요
        </button>
        <button disabled={busy} onClick={() => void answer("not_seen", "test")}>
          안 보였어요
        </button>
      </div>
    </div>
  );
  const guidance = needsGuidance && (
    <div className={styles.guidance}>
      <p>
        <strong>알림이 보이지 않을 때</strong>
      </p>
      {state?.permission === "denied" && (
        <p>Chrome의 알림 권한이 차단되어 있어요.</p>
      )}
      <ul>
        {osGuidance(userAgent).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        OS 알림이 꺼져 있어도 확장 아이콘의 숫자와 공지함으로 새 공고를 확인할
        수 있어요.
      </p>
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => void test()}>
          다시 테스트
        </button>
      </div>
    </div>
  );
  const seenHere = answeredHere && visibility.result === "seen" && (
    <p role="status">알림 표시가 확인됐어요.</p>
  );
  if (variant === "settings")
    return (
      <div>
        <div className={styles.row}>
          <span role="status">{visibilityText(visibility)}</span>
          {!needsGuidance && phase === "idle" && (
            <div className={styles.actions}>{testButton()}</div>
          )}
        </div>
        {asking}
        {guidance}
      </div>
    );
  if (variant === "onboarding") {
    const off = disabledHere || (state !== undefined && !state.enabled);
    return (
      <section className={styles.card} aria-label="새 공고 알림">
        <span className={styles.eyebrow}>새 공고 알림</span>
        <h3>새 공고 알림이 켜져 있어요</h3>
        <p>
          팀이 등록한 채용 공고를 Chrome 알림으로 받아요. 알림이 잘 보이는지
          지금 확인해 보세요.
        </p>
        {off ? (
          <p role="status">
            알림을 껐어요. 관리 페이지의 지원 공고 탭에서 다시 켤 수 있어요.
          </p>
        ) : (
          phase === "idle" &&
          !needsGuidance && (
            <div className={styles.actions}>
              {testButton(true)}
              <button
                disabled={busy}
                onClick={() =>
                  void onDisable?.().then(() => setDisabledHere(true))
                }
              >
                알림 끄기
              </button>
            </div>
          )
        )}
        {!off && asking}
        {!off && guidance}
        {seenHere}
        <p className={styles.row}>{visibilityText(visibility)}</p>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-label="알림 표시 확인">
      <h3>
        {variant === "question"
          ? "알림이 잘 보이는지 확인해 볼까요?"
          : "조금 전 공고 알림을 보냈어요. 보셨나요?"}
      </h3>
      <p>
        {variant === "question"
          ? "OS 알림 설정에 막혀 있으면 공고 알림이 보이지 않을 수 있어요. 테스트 알림으로 확인해 보세요."
          : "알림이 보이지 않았다면 OS 설정을 함께 확인해 드릴게요."}
      </p>
      {phase === "idle" && !answeredHere && !needsGuidance && (
        <div className={styles.actions}>
          {variant === "question" ? (
            <>
              {testButton(true)}
              <button disabled={busy} onClick={() => void onLater?.()}>
                나중에
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => void answer("seen", "card")}
              >
                봤어요
              </button>
              <button
                disabled={busy}
                onClick={() => void answer("not_seen", "card")}
              >
                못 봤어요
              </button>
            </>
          )}
        </div>
      )}
      {asking}
      {guidance}
      {seenHere}
    </section>
  );
}

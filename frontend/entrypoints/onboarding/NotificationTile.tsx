import { useState } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import type { VisibilityAnswer } from "../../src/job-postings/notification-check";
import type { PushClient } from "../../src/job-postings/push-client";
import { usePushState } from "../../src/job-postings/use-push-state";
import {
  osGuidance,
  settingsVisibilityText,
} from "../../src/job-postings/VisibilityCheck";
import styles from "./App.module.css";

const surface = "extension_onboarding";

export function NotificationTile({
  client,
  track,
}: {
  client: PushClient;
  track: TrackEvent;
}) {
  const push = usePushState(client);
  const [asking, setAsking] = useState(false);
  const [answeredHere, setAnsweredHere] = useState(false);
  const [disabledHere, setDisabledHere] = useState(false);
  const { state, busy } = push;
  const visibility = state?.visibility ?? { result: "unknown" as const };
  const off = disabledHere || (state !== undefined && !state.enabled);
  const needsGuidance =
    !asking &&
    (visibility.result === "not_seen" || state?.permission === "denied");
  const status = off
    ? "꺼짐"
    : state
      ? "켜짐"
      : push.failed
        ? "확인 실패"
        : "확인 중";
  const test = async () => {
    track("notification_test_sent", { surface });
    setAsking(true);
    await push.test();
  };
  const answer = async (value: VisibilityAnswer) => {
    track("notification_visibility_answered", { surface, answer: value });
    setAsking(false);
    setAnsweredHere(true);
    await push.record(value, "test");
  };
  return (
    <section
      className={`${styles.tile} ${styles.wide}`}
      aria-label="새 공고 알림"
    >
      <div className={styles.grow}>
        <h2>새 공고 알림</h2>
        <dl className={styles.status}>
          <dt>상태</dt>
          <dd>{status}</dd>
          <dt>알림 표시</dt>
          <dd>
            {visibility.result === "unknown"
              ? "확인 전"
              : visibility.result === "not_seen"
                ? "보이지 않음"
                : settingsVisibilityText(visibility)}
          </dd>
        </dl>
      </div>
      {!off && !asking && !needsGuidance && (
        <div className={styles.btns}>
          <button
            type="button"
            className={styles.outline}
            disabled={busy}
            onClick={() => void test()}
          >
            알림 테스트
          </button>
          <button
            type="button"
            className={styles.quiet}
            disabled={busy}
            onClick={() => {
              void push.setEnabled(false).then(() => {
                track("push_subscription_disabled", { surface });
                setDisabledHere(true);
              });
            }}
          >
            알림 끄기
          </button>
        </div>
      )}
      {off && (
        <p role="status" className={styles.tileRow}>
          알림을 껐어요. 관리 페이지의 지원 공고 탭에서 다시 켤 수 있어요.
        </p>
      )}
      {!off && asking && (
        <div
          className={styles.tileRow}
          role="group"
          aria-label="알림 표시 확인"
        >
          <p>방금 알림이 보였나요?</p>
          <div className={styles.btns}>
            <button
              type="button"
              className={styles.filled}
              disabled={busy}
              onClick={() => void answer("seen")}
            >
              보였어요
            </button>
            <button
              type="button"
              className={styles.outline}
              disabled={busy}
              onClick={() => void answer("not_seen")}
            >
              안 보였어요
            </button>
          </div>
        </div>
      )}
      {!off && needsGuidance && (
        <div className={styles.tileRow}>
          <p>
            <strong>알림이 보이지 않을 때</strong>
          </p>
          {state?.permission === "denied" && (
            <p>Chrome의 알림 권한이 차단되어 있어요.</p>
          )}
          <ul>
            {osGuidance(navigator.userAgent).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className={styles.btns}>
            <button
              type="button"
              className={styles.outline}
              disabled={busy}
              onClick={() => void test()}
            >
              다시 테스트
            </button>
          </div>
        </div>
      )}
      {answeredHere && visibility.result === "seen" && (
        <p role="status" className={styles.tileRow}>
          알림 표시가 확인됐어요.
        </p>
      )}
    </section>
  );
}

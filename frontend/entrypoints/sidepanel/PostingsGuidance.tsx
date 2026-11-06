import type { PushStateView } from "../../src/job-postings/push-messages";
import {
  registrationFailureText,
  subscriptionStatusText,
} from "../../src/job-postings/subscription-status";
import styles from "./App.module.css";

/**
 * Why the 마감 공고 tab may stay empty, read from the push state:
 * off — the user switched new posting alerts off;
 * failed — alerts are on but the subscription is not registered;
 * none — alerts arrive, the user just has not saved a posting yet. An empty
 * 받을 직무 selection receives every posting, so it needs no guidance.
 */
export type GuidanceKind = "off" | "failed" | "none";

/**
 * undefined means nothing is known yet (or the state cannot be read), so the
 * tab keeps its plain empty line.
 */
export function guidanceFor(
  state: PushStateView | undefined,
): GuidanceKind | undefined {
  if (!state) return undefined;
  if (!state.enabled) return "off";
  if (!state.supported) return "failed";
  switch (state.status?.code) {
    case "failed":
    case "not_configured":
    case "endpoint_unavailable":
    case "unsupported":
      return "failed";
    default:
      // Registration is still being confirmed; nothing to warn about yet.
      return "none";
  }
}

interface Actions {
  busy: boolean;
  onEnable(): void;
  onOpenSettings(): void;
}

interface EmptyProps extends Actions {
  guidance: GuidanceKind;
  state: PushStateView;
  unread: number;
  onOpenPostings(): void;
}

/** Replaces "저장한 공고 없음" with the reason and the next step. */
export function PostingsEmptyGuidance({
  guidance,
  state,
  unread,
  busy,
  onEnable,
  onOpenSettings,
  onOpenPostings,
}: EmptyProps) {
  switch (guidance) {
    case "off":
      return (
        <section className={styles.postingsGuide} aria-label="알림 꺼짐 안내">
          <h2>새 공고 알림이 꺼져 있어요</h2>
          <p>
            켜면 새 공고를 알림으로 받고, 마음에 드는 공고를 저장해 여기서
            마감을 챙길 수 있어요.
          </p>
          <button
            className={styles.guideAction}
            type="button"
            disabled={busy}
            onClick={onEnable}
          >
            알림 켜기
          </button>
        </section>
      );
    case "failed":
      return (
        <section className={styles.postingsGuide} aria-label="등록 실패 안내">
          <h2>새 공고 알림이 아직 안 와요</h2>
          <p>{registrationFailureText(state)}</p>
          <p className={styles.guideStatus} role="status">
            구독: {subscriptionStatusText(state)}
          </p>
          <button
            className={`${styles.guideAction} ${styles.guideSecondary}`}
            type="button"
            onClick={onOpenSettings}
          >
            알림 설정 열기
          </button>
        </section>
      );
    case "none":
      return (
        <section
          className={styles.postingsGuide}
          aria-label="저장한 공고 없음 안내"
        >
          <h2>아직 저장한 공고가 없어요</h2>
          <p>새 공고 탭에서 저장하면 마감이 가까운 순서로 여기 보여요.</p>
          <button
            className={`${styles.guideAction} ${styles.guideSecondary}`}
            type="button"
            onClick={onOpenPostings}
          >
            {unread > 0 ? `새 공고 ${unread}건 보기` : "새 공고 보기"}
          </button>
        </section>
      );
  }
}

interface NoticeProps extends Actions {
  guidance: GuidanceKind;
}

/** One line above a non-empty list while new postings are not arriving. */
export function PostingsNotice({
  guidance,
  busy,
  onEnable,
  onOpenSettings,
}: NoticeProps) {
  if (guidance === "none") return null;
  const [text, label, action] =
    guidance === "off"
      ? (["새 공고 알림이 꺼져 있어요", "켜기", onEnable] as const)
      : (["새 공고 알림이 아직 안 와요", "알림 설정", onOpenSettings] as const);
  return (
    <div className={styles.postingsNotice} role="status">
      <span>{text}</span>
      <button
        type="button"
        disabled={guidance === "off" && busy}
        onClick={action}
      >
        {label}
      </button>
    </div>
  );
}

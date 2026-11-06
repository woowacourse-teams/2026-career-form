import { useState, type RefObject } from "react";
import type { TrackEvent } from "../../../src/analytics/events";
import type { VisibilityAnswer } from "../../../src/job-postings/notification-check";
import type { PushClient } from "../../../src/job-postings/push-client";
import { categoryFailureText } from "../../../src/job-postings/RoleSelector";
import { useJobCategories } from "../../../src/job-postings/use-job-categories";
import {
  usePushState,
  type PushStateHandle,
} from "../../../src/job-postings/use-push-state";
import { osGuidance } from "../../../src/job-postings/VisibilityCheck";
import bellArt from "../../../site/landing/assets/C4.webp";
import { Coach } from "./Coach";
import styles from "./Flow.module.css";

const surface = "extension_onboarding";

/** Role chips by category, each led by a 전체 chip for the whole category;
 *  every toggle saves at once. Mounted only when the user chooses to pick, so
 *  the category list is not requested before that. */
function RolePicker({
  client,
  push,
  track,
}: {
  client: PushClient;
  push: PushStateHandle;
  track: TrackEvent;
}) {
  const categories = useJobCategories(client);
  const [saveFailed, setSaveFailed] = useState(false);
  const selected = push.state?.roles ?? [];
  const list = categories.view?.categories?.categories;
  if (!list) {
    if (!categories.view || categories.loading)
      return (
        <p className={styles.sm} role="status">
          직무 분류 불러오는 중
        </p>
      );
    const error = categories.view.error ?? "INVALID_RESPONSE";
    return (
      <div className={styles.ask} role="status">
        <span>{categoryFailureText(error)}</span>
        {error !== "NOT_CONFIGURED" && (
          <button
            type="button"
            className={`${styles.btn} ${styles.soft} ${styles.small}`}
            onClick={() => void categories.reload()}
          >
            다시 시도
          </button>
        )}
      </div>
    );
  }
  const save = async (next: string[]) => {
    const ok = await push.setRoles(next);
    setSaveFailed(!ok);
    if (ok) track("push_roles_saved", { surface, role_count: next.length });
  };
  const toggle = (code: string) =>
    save(
      selected.includes(code)
        ? selected.filter((item) => item !== code)
        : [...selected, code],
    );
  // All of a category on, or all of it off; other categories stay as they are.
  const toggleAll = (codes: string[]) =>
    save(
      codes.every((code) => selected.includes(code))
        ? selected.filter((code) => !codes.includes(code))
        : [...selected, ...codes.filter((code) => !selected.includes(code))],
    );
  return (
    <div className={styles.picker}>
      {list.map((category) => {
        const codes = category.roles.map((role) => role.code);
        const picked = codes.filter((code) => selected.includes(code)).length;
        const whole = picked === codes.length;
        return (
          <div
            key={category.code}
            className={styles.grp}
            role="group"
            aria-label={category.label}
          >
            <span aria-hidden="true">{category.label}</span>
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${styles.whole} ${whole ? styles.on : ""}`}
                aria-label={`${category.label} 전체`}
                aria-pressed={whole ? true : picked > 0 ? "mixed" : false}
                onClick={() => void toggleAll(codes)}
              >
                전체
              </button>
              {category.roles.map((role) => {
                const on = selected.includes(role.code);
                return (
                  <button
                    key={role.code}
                    type="button"
                    className={on ? `${styles.chip} ${styles.on}` : styles.chip}
                    aria-pressed={on}
                    onClick={() => void toggle(role.code)}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {saveFailed && (
        <p className={styles.error} role="alert">
          선택을 저장하지 못했어요
        </p>
      )}
    </div>
  );
}

/** Step 3: which postings to receive, with the alert switch and a test. */
export function RolesStep({
  client,
  track,
  heading,
  onBack,
  onNext,
}: {
  client: PushClient;
  track: TrackEvent;
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onNext: () => void;
}) {
  const push = usePushState(client);
  const [picking, setPicking] = useState<boolean>();
  const [asking, setAsking] = useState(false);
  const [answeredHere, setAnsweredHere] = useState(false);
  const { state, busy } = push;
  const count = state?.roles.length ?? 0;
  // Someone who already chose roles lands on the picker.
  const pick = picking ?? count > 0;
  const off = state !== undefined && !state.enabled;
  const visibility = state?.visibility ?? { result: "unknown" as const };
  const needsGuidance =
    !asking &&
    (visibility.result === "not_seen" || state?.permission === "denied");
  const status = off
    ? "알림 꺼짐"
    : state
      ? "알림 켜짐"
      : push.failed
        ? "알림 상태 확인 실패"
        : "알림 상태 확인 중";
  const summary = !pick
    ? "지금 설정: 모든 공고를 받아요."
    : count === 0
      ? "고른 직무가 없어요. 이대로 두면 모든 공고를 받아요."
      : `고른 ${count}개 직무의 공고만 받아요. 모두 해제하면 모든 공고를 받아요.`;
  const receiveAll = async () => {
    setPicking(false);
    if (count === 0) return;
    if (await push.setRoles([]))
      track("push_roles_saved", { surface, role_count: 0 });
  };
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
  const setEnabled = async (enabled: boolean) => {
    await push.setEnabled(enabled);
    track(
      enabled ? "push_subscription_enabled" : "push_subscription_disabled",
      { surface },
    );
  };
  return (
    <div className={styles.stage}>
      <section className={styles.card}>
        <div className={styles.hg}>
          <p className={styles.eye}>새 공고 알림</p>
          <h1 ref={heading} tabIndex={-1}>
            어떤 공고를 받을까요?
          </h1>
          <p
            className={off ? `${styles.pill} ${styles.off}` : styles.pill}
            role="status"
          >
            {status}
          </p>
          <p className={styles.lead}>
            설치할 때 새 공고 알림이 켜졌어요. 새 공고가 등록되면 Chrome
            알림으로 알려드려요.
          </p>
        </div>
        <div className={styles.opts}>
          <button
            type="button"
            className={pick ? styles.opt : `${styles.opt} ${styles.on}`}
            aria-pressed={!pick}
            onClick={() => void receiveAll()}
          >
            <span>
              <b>모든 직무의 공고 받기</b>
              <small>
                기본값이에요. 직무를 고르지 않으면 모든 공고를 받아요.
              </small>
            </span>
          </button>
          <button
            type="button"
            className={pick ? `${styles.opt} ${styles.on}` : styles.opt}
            aria-pressed={pick}
            onClick={() => setPicking(true)}
          >
            <span>
              <b>직무를 골라 받기</b>
              <small>고른 직무의 공고만 받아요.</small>
            </span>
          </button>
        </div>
        {pick && <RolePicker client={client} push={push} track={track} />}
        <p className={styles.note} role="status" data-testid="role-summary">
          {summary}
        </p>
        {!off && asking && (
          <div className={styles.ask} role="group" aria-label="알림 표시 확인">
            <span>방금 화면 구석에 알림이 보였나요?</span>
            <div className={styles.acts}>
              <button
                type="button"
                className={`${styles.btn} ${styles.soft} ${styles.small}`}
                disabled={busy}
                onClick={() => void answer("seen")}
              >
                보였어요
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.soft} ${styles.small}`}
                disabled={busy}
                onClick={() => void answer("not_seen")}
              >
                안 보였어요
              </button>
            </div>
          </div>
        )}
        {!off && needsGuidance && (
          <div className={styles.col}>
            <h2>알림이 보이지 않을 때</h2>
            {state?.permission === "denied" && (
              <p className={styles.sm}>Chrome의 알림 권한이 차단되어 있어요.</p>
            )}
            <ul className={styles.dots}>
              {osGuidance(navigator.userAgent).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {answeredHere && visibility.result === "seen" && (
          <p className={styles.saved} role="status">
            알림 표시가 확인됐어요.
          </p>
        )}
        <div className={styles.foot}>
          {/* Alert controls on the left, step navigation on the right. */}
          <div className={`${styles.acts} ${styles.start}`}>
            {off ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.soft}`}
                disabled={busy}
                onClick={() => void setEnabled(true)}
              >
                알림 켜기
              </button>
            ) : (
              <>
                {!asking && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.soft}`}
                    disabled={busy || !state}
                    onClick={() => void test()}
                  >
                    {needsGuidance ? "다시 테스트" : "테스트 알림 보내기"}
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  disabled={busy || !state}
                  onClick={() => void setEnabled(false)}
                >
                  알림 끄기
                </button>
              </>
            )}
          </div>
          <div className={styles.acts}>
            <button
              type="button"
              className={`${styles.btn} ${styles.ghost}`}
              onClick={onBack}
            >
              이전
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.pri}`}
              onClick={onNext}
            >
              다음
            </button>
          </div>
        </div>
      </section>
      <Coach art={bellArt}>
        <b>알아 두세요</b>
        <ul className={styles.dots}>
          <li>테스트 알림은 이 컴퓨터 화면 구석에 Chrome 알림으로 떠요.</li>
          <li>Chrome이 완전히 꺼져 있으면 알림이 오지 않아요.</li>
          <li>절전이나 방해 금지 모드에서는 늦거나 막힐 수 있어요.</li>
          <li>
            알림이 안 보여도 확장 아이콘의 숫자와 관리 페이지 ‘지원 공고’의 새
            공고 목록에서 볼 수 있어요.
          </li>
        </ul>
      </Coach>
    </div>
  );
}

// Keeps the sites' login sessions alive while QA work is going on. Logging in
// is a human task, so an expired session stops the whole QA.
// - Hplace MRS2 shows a countdown (#countTime) and its own 연장 button, whose
//   handler only GETs /app/applicant/keepLogin. It is clicked when little time
//   is left and the site still considers the session alive.
// - Other sites get a credentialed GET of the current page (no navigation),
//   which refreshes sliding server sessions.
// Nothing here saves, submits or moves the form.
import { setTimeout as delay } from "node:timers/promises";

const EVALUATE_MS = 8000;
const bounded = (promise, ms, fallback = null) =>
  Promise.race([promise, delay(ms).then(() => fallback)]).catch(() => fallback);

// Page function: the site's countdown and login state. Never reads the form.
export function sessionStatus() {
  const text = document.querySelector("#countTime")?.textContent ?? "";
  const minutes = /([0-9]{1,3})\s*분/.exec(text);
  const seconds = /([0-9]{1,2})\s*초/.exec(text);
  const timer = window.WriteResumeTimer;
  return {
    hplaceTimer:
      document.querySelectorAll('button[data-button="keepLogin"]').length > 0,
    minutes: minutes
      ? Number(minutes[1]) + (seconds ? Number(seconds[1]) / 60 : 0)
      : null,
    loggedIn:
      typeof timer?.isLogin === "function" ? timer.isLogin() === true : null,
  };
}

// Page function: the site's own 연장 button. When the site thinks the session
// already ended it would open a logout popup instead, so it is not clicked.
export function clickKeepLogin() {
  if (window.WriteResumeTimer?.isLogin?.() !== true)
    return { ok: false, code: "session-ended" };
  const buttons = document.querySelectorAll('button[data-button="keepLogin"]');
  if (buttons.length !== 1) return { ok: false, code: "button-not-unique" };
  buttons[0].click();
  return { ok: true };
}

// Page function: credentialed GET of the current page, without navigating.
export async function pingSession() {
  const url = new URL(location.href);
  url.hash = "";
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function keepAliveDue({ minutes, thresholdMinutes, force = false }) {
  if (force) return true;
  if (minutes === null || minutes === undefined) return false;
  return minutes < thresholdMinutes;
}

// A site dialog that only asks to keep the login (accepting it saves nothing).
// It must mention the login or session, ask to extend or keep it, and not ask
// to log out, log in again, go somewhere, apply or save.
export function isSessionPrompt(message) {
  const text = String(message ?? "");
  if (
    /저장|제출|나가|이동|삭제|로그아웃\s*하|로그인\s*하시겠|다시\s*로그인|페이지로|가시겠|지원하|신청|등록|확정|완료|종료|submit|save/i.test(
      text,
    )
  )
    return false;
  return /로그인|세션|로그아웃/.test(text) && /(연장|유지)\s*하시겠/.test(text);
}

export async function keepAlivePage(
  page,
  { thresholdMinutes = 20, force = false, settleMs = 2000 } = {},
) {
  // Bounded: an open dialog blocks evaluate until someone answers it.
  const status = await bounded(page.evaluate(sessionStatus), EVALUATE_MS);
  if (!status) return { action: "unreadable" };
  if (status.hplaceTimer) {
    if (status.loggedIn === false)
      return { action: "none", code: "session-ended", minutes: status.minutes };
    if (status.minutes === null && !force)
      return { action: "none", code: "timer-unreadable" };
    if (!keepAliveDue({ minutes: status.minutes, thresholdMinutes, force }))
      return { action: "not-due", minutes: status.minutes };
    const clicked = await bounded(page.evaluate(clickKeepLogin), EVALUATE_MS);
    if (!clicked?.ok)
      return { action: "none", code: clicked?.code ?? "click-failed" };
    await delay(settleMs);
    const after = await bounded(page.evaluate(sessionStatus), EVALUATE_MS);
    const minutes = after?.minutes ?? null;
    // Extended only when the site's countdown went up after the click.
    return {
      action:
        minutes !== null && status.minutes !== null && minutes > status.minutes
          ? "extended"
          : "not-extended",
      before: status.minutes,
      after: minutes,
    };
  }
  const ping = await bounded(page.evaluate(pingSession), EVALUATE_MS);
  return { action: "pinged", status: ping?.status ?? 0 };
}

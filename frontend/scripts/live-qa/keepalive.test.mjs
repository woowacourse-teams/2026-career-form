// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clickKeepLogin,
  isSessionPrompt,
  keepAliveDue,
  keepAlivePage,
  sessionStatus,
} from "./keepalive.mjs";

afterEach(() => {
  delete window.WriteResumeTimer;
  document.body.innerHTML = "";
});

describe("sessionStatus", () => {
  it("reads the Hplace countdown and login state without reading the form", () => {
    document.body.innerHTML = `
      <span id="countTime">9분 30초</span>
      <button type="button" data-button="keepLogin">연장</button>
      <form><input name="name" value="실제이름"></form>`;
    window.WriteResumeTimer = { isLogin: () => true };
    const status = sessionStatus();
    expect(status).toEqual({ hplaceTimer: true, minutes: 9.5, loggedIn: true });
    expect(JSON.stringify(status)).not.toContain("실제이름");
  });

  it("reports pages without a site timer", () => {
    expect(sessionStatus()).toEqual({
      hplaceTimer: false,
      minutes: null,
      loggedIn: null,
    });
  });
});

describe("clickKeepLogin", () => {
  it("clicks the site's own 연장 button only while the site considers the session alive", () => {
    let clicks = 0;
    document.body.innerHTML = `<button type="button" data-button="keepLogin">연장</button>`;
    document.querySelector("button").addEventListener("click", () => clicks++);
    window.WriteResumeTimer = { isLogin: () => true };
    expect(clickKeepLogin()).toEqual({ ok: true });
    window.WriteResumeTimer = { isLogin: () => false };
    expect(clickKeepLogin()).toEqual({ ok: false, code: "session-ended" });
    expect(clicks).toBe(1);
  });

  it("refuses when the button is not unique", () => {
    document.body.innerHTML = `<button data-button="keepLogin"></button><button data-button="keepLogin"></button>`;
    window.WriteResumeTimer = { isLogin: () => true };
    expect(clickKeepLogin()).toEqual({ ok: false, code: "button-not-unique" });
  });
});

describe("keepAliveDue", () => {
  it("extends when little time is left or when forced", () => {
    expect(keepAliveDue({ minutes: 9.5, thresholdMinutes: 20 })).toBe(true);
    expect(keepAliveDue({ minutes: 45, thresholdMinutes: 20 })).toBe(false);
    expect(
      keepAliveDue({ minutes: 45, thresholdMinutes: 20, force: true }),
    ).toBe(true);
    expect(keepAliveDue({ minutes: null, thresholdMinutes: 20 })).toBe(false);
    expect(
      keepAliveDue({ minutes: null, thresholdMinutes: 20, force: true }),
    ).toBe(true);
  });

  it("reports an unreadable Hplace countdown instead of staying quiet", async () => {
    document.body.innerHTML = `<span id="countTime">09:30</span><button data-button="keepLogin">연장</button>`;
    window.WriteResumeTimer = { isLogin: () => true };
    const page = { evaluate: async (fn) => fn() };
    await expect(keepAlivePage(page)).resolves.toEqual({
      action: "none",
      code: "timer-unreadable",
    });
  });
});

describe("keepAlivePage", () => {
  const mount = (onClick) => {
    document.body.innerHTML = `<span id="countTime">9분 30초</span><button data-button="keepLogin">연장</button>`;
    document.querySelector("button").addEventListener("click", onClick);
    window.WriteResumeTimer = { isLogin: () => true };
    return { evaluate: async (fn) => fn() };
  };

  it("reports extended only when the countdown went up", async () => {
    const page = mount(() => {
      document.getElementById("countTime").textContent = "119분 59초";
    });
    await expect(keepAlivePage(page, { settleMs: 0 })).resolves.toMatchObject({
      action: "extended",
      before: 9.5,
    });
  });

  it("reports not-extended when the click left the countdown as it was", async () => {
    const page = mount(() => {});
    await expect(keepAlivePage(page, { settleMs: 0 })).resolves.toMatchObject({
      action: "not-extended",
      before: 9.5,
      after: 9.5,
    });
  });
});

describe("isSessionPrompt", () => {
  it.each([
    "로그인 시간을 연장하시겠습니까?",
    "세션이 곧 만료됩니다. 로그인 상태를 유지하시겠습니까?",
    "자동 로그아웃 전입니다. 연장하시겠습니까?",
  ])("accepts %s", (message) => expect(isSessionPrompt(message)).toBe(true));

  it.each([
    "작성 중인 내용을 저장하시겠습니까?",
    "제출하시겠습니까?",
    "페이지를 나가시겠습니까?",
    "지원서를 임시저장하고 연장하시겠습니까?",
    "로그아웃 하시겠습니까? 로그인을 유지하려면 취소를 누르세요.",
    "세션 유지 시간이 만료되었습니다. 다시 로그인하시겠습니까?",
    "로그인 유지 시간이 초과되었습니다. 로그인 페이지로 가시겠습니까?",
    "접수 기간이 연장되었습니다. 지원하시겠습니까?",
  ])("does not accept %s", (message) =>
    expect(isSessionPrompt(message)).toBe(false),
  );
});

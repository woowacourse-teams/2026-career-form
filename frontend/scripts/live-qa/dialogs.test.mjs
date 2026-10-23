// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { claimDialogs, installDialogPolicy } from "./dialogs.mjs";

const SESSION = "로그인 시간을 연장하시겠습니까?";
function fakeDialog(page, type, message) {
  const dialog = {
    answer: null,
    page: () => page,
    type: () => type,
    message: () => message,
    accept: async () => {
      dialog.answer = "accept";
    },
    dismiss: async () => {
      dialog.answer = "dismiss";
    },
  };
  return dialog;
}
// What Playwright does: emit to the context and the page, and answer by
// itself only when nobody listens.
function open(context, page, type, message) {
  const dialog = fakeDialog(page, type, message);
  const heard =
    context.emit("dialog", dialog) | (page?.emit("dialog", dialog) ?? false);
  if (!heard)
    dialog.answer = type === "beforeunload" ? "auto-accept" : "auto-dismiss";
  return dialog;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installDialogPolicy", () => {
  it("accepts session prompts and leaves every other dialog to the person", async () => {
    const context = new EventEmitter();
    const page = new EventEmitter();
    const release = installDialogPolicy(context);
    const session = open(context, page, "confirm", SESSION);
    const save = open(context, page, "confirm", "저장하시겠습니까?");
    const leave = open(context, page, "beforeunload", "");
    await flush();
    expect([session.answer, save.answer, leave.answer]).toEqual([
      "accept",
      null,
      null,
    ]);
    release();
    expect(open(context, page, "confirm", "x").answer).toBe("auto-dismiss");
  });

  it("does not answer dialogs on a tab a round has claimed", async () => {
    const context = new EventEmitter();
    const page = new EventEmitter();
    installDialogPolicy(context);
    const claim = claimDialogs(page);
    const session = open(context, page, "confirm", SESSION);
    await flush();
    expect(session.answer).toBe("accept");
    claim.release();
  });
});

describe("installDialogPolicy on test-account tabs", () => {
  it("accepts the leave-page prompt only on allowlisted hosts", async () => {
    const context = new EventEmitter();
    const testTab = Object.assign(new EventEmitter(), {
      url: () => "https://www.skcareers.com/Application/Index/R1",
    });
    const otherTab = Object.assign(new EventEmitter(), {
      url: () => "https://example.test/apply",
    });
    const release = installDialogPolicy(context, {
      leaveHosts: ["www.skcareers.com"],
    });
    const leaveTest = open(context, testTab, "beforeunload", "");
    const leaveOther = open(context, otherTab, "beforeunload", "");
    const confirmTest = open(context, testTab, "confirm", "저장하시겠습니까?");
    await flush();
    expect([leaveTest.answer, leaveOther.answer, confirmTest.answer]).toEqual([
      "accept",
      null,
      null,
    ]);
    release();
  });
});

describe("claimDialogs", () => {
  it("dismisses site dialogs, keeps the login, and records no message text", async () => {
    const context = new EventEmitter();
    const page = new EventEmitter();
    const claim = claimDialogs(page);
    const answers = [
      open(context, page, "confirm", "삭제하시겠습니까? 홍길동"),
      open(context, page, "alert", "학교를 선택하세요"),
      open(context, page, "confirm", SESSION),
    ];
    await flush();
    expect(answers.map((d) => d.answer)).toEqual([
      "dismiss",
      "dismiss",
      "accept",
    ]);
    expect(claim.log).toEqual([
      "confirm: dismissed",
      "alert: dismissed",
      "confirm: accepted-session-prompt",
    ]);
    expect(JSON.stringify(claim.log)).not.toMatch(/홍길동|학교/);
    claim.release();
  });

  it("leaves the leave-page prompt open unless a discard is under way", async () => {
    const context = new EventEmitter();
    const page = new EventEmitter();
    const claim = claimDialogs(page);
    const early = open(context, page, "beforeunload", "");
    claim.allowLeave(true);
    const during = open(context, page, "beforeunload", "");
    const other = open(context, page, "confirm", "저장하시겠습니까?");
    claim.allowLeave(false);
    await flush();
    expect([early.answer, during.answer, other.answer]).toEqual([
      null,
      "accept",
      "dismiss",
    ]);
    expect(claim.log).toEqual([
      "beforeunload: left-open",
      "beforeunload: accepted-for-discard",
      "confirm: dismissed",
    ]);
    claim.release();
  });

  it("confirms site prompts only while a test-account reset allows it", async () => {
    const context = new EventEmitter();
    const page = new EventEmitter();
    const claim = claimDialogs(page);
    claim.allowConfirm(true);
    const ask = open(context, page, "confirm", "임시저장 하시겠습니까?");
    const done = open(context, page, "alert", "임시저장 되었습니다.");
    const leave = open(context, page, "beforeunload", "");
    claim.allowConfirm(false);
    const later = open(context, page, "confirm", "임시저장 하시겠습니까?");
    await flush();
    expect([ask.answer, done.answer, leave.answer, later.answer]).toEqual([
      "accept",
      "accept",
      null,
      "dismiss",
    ]);
    expect(claim.log).toEqual([
      "confirm: accepted-for-reset",
      "alert: accepted-for-reset",
      "beforeunload: left-open",
      "confirm: dismissed",
    ]);
    expect(JSON.stringify(claim.log)).not.toMatch(/임시저장/);
    claim.release();
  });
});

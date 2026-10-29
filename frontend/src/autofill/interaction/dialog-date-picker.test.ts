import { afterEach, describe, expect, it } from "vitest";
import {
  dialogDateButtonValue,
  executeDialogDateSelection,
  isDialogDateButton,
} from "./dialog-date-picker";
import { attachSteppedPicker } from "./dialog-date-picker.test-fixtures";

afterEach(() => document.body.replaceChildren());

const FAST = { stepWaitMs: 300, closeWaitMs: 300 };

function installPicker({
  text,
  ...options
}: { text: string } & Parameters<typeof attachSteppedPicker>[1]) {
  document.body.innerHTML = `<section><h3>합성 경력</h3><label>메모 <input id="memo" value="유지"></label>
    <button id="date" type="button" aria-haspopup="dialog">${text}</button></section>`;
  const button = document.querySelector<HTMLButtonElement>("#date")!;
  const dialog = attachSteppedPicker(button, options);
  return { button, dialog, memo: document.querySelector<HTMLInputElement>("#memo")! };
}

describe("isDialogDateButton", () => {
  it("accepts a dialog button with a date cue and rejects other dialog buttons", () => {
    document.body.innerHTML = `
      <button id="a" type="button" aria-haspopup="dialog">시작일</button>
      <button id="b" type="button" aria-haspopup="dialog">주소 검색</button>
      <button id="c" type="button" aria-haspopup="dialog">첨부파일</button>
      <button id="d" type="button">생년월일 선택</button>`;
    const result = ["a", "b", "c", "d"].map((id) =>
      isDialogDateButton(document.getElementById(id)!),
    );
    expect(result).toEqual([true, false, false, false]);
    expect(dialogDateButtonValue(document.querySelector("#a")!)).toBe("");
  });
});

describe("executeDialogDateSelection", () => {
  it("walks a decade start back to an earlier decade, then month and day", async () => {
    const { button, dialog, memo } = installPicker({
      text: "생년월일 선택",
      start: "years",
      precision: "day",
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "1995-02-28",
      timings: FAST,
    });

    expect(result).toEqual({ status: "completed" });
    expect(button.textContent).toBe("1995-02-28");
    expect(dialog.hidden).toBe(true);
    expect(memo.value).toBe("유지");
  });

  it("reports completion only after the closing dialog is hidden", async () => {
    const { button, dialog } = installPicker({
      text: "생년월일 선택",
      start: "years",
      precision: "day",
      hideDelayMs: 60,
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2024-02-29",
      timings: FAST,
    });

    expect(result).toEqual({ status: "completed" });
    expect(dialog.hidden).toBe(true);
  });

  it("scrolls an off-screen button into view before opening its dialog", async () => {
    const { button } = installPicker({
      text: "입학년월",
      start: "months",
      precision: "month",
    });
    let top = 5_000;
    button.getBoundingClientRect = () =>
      ({ top, bottom: top + 30, left: 10, right: 110, width: 100, height: 30 }) as DOMRect;
    const scrolled: number[] = [];
    button.scrollIntoView = () => {
      scrolled.push(top);
      top = 100;
    };

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2014-03-02",
      timings: FAST,
    });

    expect(scrolled).toEqual([5_000]);
    expect(result).toEqual({ status: "completed" });
  });

  it("completes a month picker that closes after the month", async () => {
    const { button } = installPicker({
      text: "입학년월",
      start: "months",
      precision: "month",
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2014-03-02",
      timings: FAST,
    });

    expect(result).toEqual({ status: "completed" });
    expect(button.textContent).toBe("2014.03");
  });

  it("goes up from a day start when the shown month is another month", async () => {
    const { button } = installPicker({
      text: "취득일",
      start: "days",
      precision: "day",
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2021-07-09",
      timings: FAST,
    });

    expect(result).toEqual({ status: "completed" });
    expect(button.textContent).toBe("2021-07-09");
  });

  it("closes the dialog and stops when a level cannot be read", async () => {
    const { button, dialog } = installPicker({
      text: "시작일",
      start: "years",
      precision: "day",
    });
    button.addEventListener("click", () => {
      dialog.querySelector("button")!.textContent = "?";
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2020-01-01",
      timings: FAST,
    });

    expect(result).toEqual({
      status: "needs-verification",
      reason: "level_unreadable",
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("never opens a button that already shows a date", async () => {
    const { button, dialog } = installPicker({
      text: "2020-01-01",
      start: "years",
      precision: "day",
    });

    const result = await executeDialogDateSelection({
      target: button,
      targetDate: "2020-01-02",
      timings: FAST,
    });

    expect(result).toEqual({
      status: "needs-verification",
      reason: "target_not_empty",
    });
    expect(dialog.hidden).toBe(true);
  });
});

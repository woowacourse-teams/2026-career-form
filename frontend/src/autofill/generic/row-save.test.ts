import { afterEach, describe, expect, it } from "vitest";

import { saveWrittenRows, type RowSaveField } from "./row-save";

afterEach(() => document.body.replaceChildren());

const FAST = { enableWaitMs: 50, confirmTimeoutMs: 200 } as const;

const control = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

function field(
  recordKey: string | undefined,
  name: string,
  state: Partial<Pick<RowSaveField, "written" | "settled">> = {},
): RowSaveField {
  return {
    recordKey,
    recordLabel: recordKey ? `줄 ${recordKey}` : "",
    elements: [control(name)],
    written: state.written ?? true,
    settled: state.settled ?? true,
  };
}

function clicks(selector: string): () => number {
  let count = 0;
  document
    .querySelectorAll(selector)
    .forEach((element) => element.addEventListener("click", () => (count += 1)));
  return () => count;
}

/** Two career rows, each with its own save, plus a personal section. */
function careerRows() {
  document.body.innerHTML = `
    <section><h3>기본 정보</h3><input name="name" value="합성이름"></section>
    <section><h3>경력</h3>
      <ul id="saved"></ul>
      <div id="row0"><input name="company0" value="합성회사"><input name="dept0" value="합성부서">
        <button type="button" id="save0">저장</button></div>
      <div id="row1"><input name="company1" value="합성회사2">
        <button type="button" id="save1">저장</button></div>
    </section>`;
}

/** The page turns a saved row into a list item, like a registered entry. */
function registersRow(row: string) {
  document.querySelector(`#${row} button`)!.addEventListener("click", () => {
    document.querySelector(`#${row}`)!.remove();
    document.querySelector("#saved")!.append(document.createElement("li"));
  });
}

const rowFields = () => [
  field(undefined, "name", { written: false }),
  field("careers.career#0", "company0"),
  field("careers.career#0", "dept0"),
  field("careers.career#1", "company1"),
];

describe("saveWrittenRows", () => {
  it("presses the save of each row the extension filled and confirms the registration", async () => {
    careerRows();
    registersRow("row0");
    registersRow("row1");
    const save0 = clicks("#save0");
    const save1 = clicks("#save1");
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields(),
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save0()).toBe(1);
    expect(save1()).toBe(1);
    expect(outcome).toEqual({
      saved: ["careers.career#0", "careers.career#1"],
      manual: [],
      stopped: false,
    });
  });

  it("confirms a row whose inputs the page empties for the next entry", async () => {
    careerRows();
    document.querySelector("#save0")!.addEventListener("click", () => {
      control("company0").value = "";
      control("dept0").value = "";
    });
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields().slice(0, 3),
      savedKeys: new Set(),
      ...FAST,
    });
    expect(outcome.saved).toEqual(["careers.career#0"]);
    expect(outcome.manual).toEqual([]);
  });

  it("does not press the save of a row the extension did not write in this run", async () => {
    careerRows();
    const save0 = clicks("#save0");
    const outcome = await saveWrittenRows({
      document,
      fields: [
        field("careers.career#0", "company0", { written: false }),
        field("careers.career#0", "dept0", { written: false }),
      ],
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save0()).toBe(0);
    expect(outcome).toEqual({ saved: [], manual: [], stopped: false });
  });

  it("does not press a row it already saved", async () => {
    careerRows();
    const save0 = clicks("#save0");
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields().slice(0, 3),
      savedKeys: new Set(["careers.career#0"]),
      ...FAST,
    });
    expect(save0()).toBe(0);
    expect(outcome.saved).toEqual([]);
  });

  it("does not press a save whose area holds another row's fields", async () => {
    document.body.innerHTML = `<section><h3>경력</h3>
      <input name="company0" value="합성회사"><input name="company1" value="합성회사2">
      <button type="button" id="save">저장</button></section>
      <section><input name="other"></section>`;
    const save = clicks("#save");
    const outcome = await saveWrittenRows({
      document,
      fields: [
        field("careers.career#0", "company0"),
        field("careers.career#1", "company1"),
      ],
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save()).toBe(0);
    expect(outcome.saved).toEqual([]);
  });

  it("does not press a save whose area holds every field of the page", async () => {
    document.body.innerHTML = `<div><h3>경력</h3>
      <input name="company0" value="합성회사"><input name="dept0" value="합성부서">
      <button type="button" id="save">저장</button></div>`;
    const save = clicks("#save");
    const outcome = await saveWrittenRows({
      document,
      fields: [
        field("careers.career#0", "company0"),
        field("careers.career#0", "dept0"),
      ],
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save()).toBe(0);
    expect(outcome.saved).toEqual([]);
  });
});

describe("controls a row save never presses", () => {
  it("never presses temporary save, submit, next, move, preview, whole-page save or consent", async () => {
    document.body.innerHTML = `
      <form id="page">
        <section><h3>경력</h3>
          <div id="row0"><input name="company0" value="합성회사">
            <button type="button" class="forbidden">임시저장</button>
            <button type="button" class="forbidden">제출</button>
            <button type="button" class="forbidden">다음</button>
            <button type="button" class="forbidden">이동</button>
            <button type="button" class="forbidden">미리보기</button>
            <button type="button" class="forbidden">저장 후 다음</button>
            <button type="button" class="forbidden">전체 저장</button>
            <a href="/next" class="forbidden">저장</a>
            <input type="submit" class="forbidden" value="저장">
            <button class="forbidden">저장</button>
            <button type="button" class="forbidden" formaction="/save">저장</button>
            <label><input type="checkbox" name="agree"> 동의</label>
          </div>
          <div id="row1"><input name="company1" value="합성회사2"></div>
        </section>
        <button type="button" class="forbidden" id="whole">저장</button>
      </form>`;
    const forbidden = clicks(".forbidden");
    const outcome = await saveWrittenRows({
      document,
      fields: [
        field("careers.career#0", "company0"),
        field("careers.career#1", "company1"),
      ],
      savedKeys: new Set(),
      ...FAST,
    });
    expect(forbidden()).toBe(0);
    expect(control("agree").checked).toBe(false);
    expect(outcome.saved).toEqual([]);
  });
});

describe("rows left for the user", () => {
  it("leaves a row with a failed or held field and names it", async () => {
    careerRows();
    const save0 = clicks("#save0");
    const outcome = await saveWrittenRows({
      document,
      fields: [
        field("careers.career#0", "company0"),
        field("careers.career#0", "dept0", { written: false, settled: false }),
      ],
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save0()).toBe(0);
    expect(outcome.manual).toEqual([
      {
        recordKey: "careers.career#0",
        recordLabel: "줄 careers.career#0",
        reason: "row-incomplete",
      },
    ]);
  });

  it("leaves a row whose save button stays disabled", async () => {
    careerRows();
    document.querySelector<HTMLButtonElement>("#save0")!.disabled = true;
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields().slice(0, 3),
      savedKeys: new Set(),
      ...FAST,
    });
    expect(outcome.manual.map((row) => row.reason)).toEqual(["button-disabled"]);
    expect(outcome.saved).toEqual([]);
  });

  it("stops later row saves when a registration cannot be confirmed", async () => {
    careerRows();
    // The first save changes nothing on the page.
    registersRow("row1");
    const save0 = clicks("#save0");
    const save1 = clicks("#save1");
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields(),
      savedKeys: new Set(),
      ...FAST,
    });
    expect(save0()).toBe(1);
    expect(save1()).toBe(0);
    expect(outcome).toEqual({
      saved: [],
      manual: [
        {
          recordKey: "careers.career#0",
          recordLabel: "줄 careers.career#0",
          reason: "unconfirmed",
        },
        {
          recordKey: "careers.career#1",
          recordLabel: "줄 careers.career#1",
          reason: "stopped",
        },
      ],
      stopped: true,
    });
  });

  it("presses nothing once an earlier run stopped the row saves", async () => {
    careerRows();
    const save0 = clicks("#save0");
    const outcome = await saveWrittenRows({
      document,
      fields: rowFields().slice(0, 3),
      savedKeys: new Set(),
      stopped: true,
      ...FAST,
    });
    expect(save0()).toBe(0);
    expect(outcome.manual.map((row) => row.reason)).toEqual(["stopped"]);
    expect(outcome.stopped).toBe(true);
  });
});

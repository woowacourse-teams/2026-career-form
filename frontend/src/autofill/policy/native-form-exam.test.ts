import { afterEach, beforeEach, expect, it } from "vitest";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  onSiteEnter,
  takeSiteEnters,
  mountSearch,
  searchItem,
  showResults,
  widget,
} from "./__fixtures__/hplace-mrs2-search.synthetic";
beforeEach(() => void takeSiteEnters());
afterEach(() => installExecutionPolicy(document));
const metadata = (grade: boolean, score: boolean) => ({
  "data-gradeflag": String(grade),
  "data-scoreflag": String(score),
  "data-setupcode": "",
  "data-setupvalue": "",
  "data-perfactgrade": "200",
});
function mount() {
  mountSearch("foreignExam", (s) => {
    s.fields[0].search.protectedVisibleSelector = ".ybmValidateDone";
    s.fields.push(
      {
        name: "synthetic.exam.gradeCode",
        rawName: "entry.gradeCode",
        type: "select",
        label: "등급",
        binding: {
          type: "DIRECT",
          profileFieldKey: "languages.languageTest.grade",
        },
        dynamicOptions: { codeFormat: "OBSERVED" },
        gate: { search: "synthetic.search.name", mode: "GRADE_ONLY" },
      },
      {
        name: "synthetic.exam.score",
        rawName: "entry.score",
        type: "number",
        label: "점수",
        min: 0,
        max: 9999,
        binding: {
          type: "DIRECT",
          profileFieldKey: "languages.languageTest.grade",
        },
        gate: { search: "synthetic.search.name", mode: "SCORE_ONLY" },
      },
    );
  });
}
function detail(grade: boolean, score: boolean) {
  document.querySelector('[data-template="detail"]')!.innerHTML =
    `${grade ? '<select name="entry.gradeCode"><option value=""></option><option value="G_AL">Advanced Low</option></select>' : ""}${score ? '<input name="entry.score" type="number" min="0" max="9999"><input name="entry.perfectScore" type="number">' : ""}<input name="entry.registNumber"><input name="entry.examDate"><input type="hidden" name="entry.languageExamSn">`;
}
function collected() {
  return collectFieldsSnapshot(document)
    .request.sections.flatMap((s) => s.fields)
    .map((f) => f.domName);
}
it.each([
  { grade: true, score: false },
  { grade: false, score: true },
  { grade: true, score: true },
  { grade: false, score: false },
])(
  "settles fresh detail and maps only unambiguous grade/score $grade/$score",
  async ({ grade, score }) => {
    mount();
    const { handle, item } = searchItem("가상 어학시험");
    expect(collected()).toEqual(["synthetic.search.name"]);
    handle.elements[0].addEventListener(
      "keypress",
      onSiteEnter(() =>
        showResults(
          handle.elements[0],
          ["가상 어학시험"],
          () => setTimeout(() => detail(grade, score), 30),
          "234",
          metadata(grade, score),
        ),
      ),
    );
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(true);
    expect(collected()).toEqual([
      "synthetic.search.name",
      ...(grade && !score
        ? ["synthetic.exam.gradeCode"]
        : score && !grade
          ? ["synthetic.exam.score"]
          : []),
    ]);
    if (grade !== score) {
      const field = searchItem(
        grade ? "Advanced Low" : "120",
        grade ? "gradeCode" : "score",
      );
      expect(
        getWriteAdapter(document).tryWrite(field.handle, field.item),
      ).toEqual({ handled: true, written: true });
      const old = field.handle.elements[0];
      old.replaceWith(old.cloneNode(true));
      expect(field.handle.isCurrentContext?.()).toBe(false);
    }
  },
);
it.each(["ybm", "unknown", "missing", "special-code"])(
  "rejects %s metadata BEFORE click",
  async (mode) => {
    mount();
    const { handle, item } = searchItem("가상 어학시험");
    let clicks = 0;
    const meta = metadata(true, false);
    if (mode === "ybm") meta["data-setupcode"] = "EXAM_CODE";
    if (mode === "missing")
      delete (meta as Record<string, string>)["data-gradeflag"];
    if (mode === "unknown")
      (meta as Record<string, string>)["data-authorization"] = "required";
    handle.elements[0].addEventListener(
      "keypress",
      onSiteEnter(() =>
        showResults(
          handle.elements[0],
          ["가상 어학시험"],
          () => clicks++,
          mode === "special-code" ? "00091" : "234",
          meta,
        ),
      ),
    );
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(takeSiteEnters()).toBe(1);
    expect(clicks).toBe(0);
    expect(widget().code.value).toBe("");
  },
);
it.each(["visible-auth", "hidden-auth-without-hide", "readonly"])(
  "excludes the entire %s row",
  (mode) => {
    mount();
    const row = document.querySelector("#synthetic-row")!;
    if (mode === "visible-auth")
      row.insertAdjacentHTML(
        "beforeend",
        '<span class="ybmValidateDone hide">인증</span>',
      );
    if (mode === "hidden-auth-without-hide")
      row.insertAdjacentHTML(
        "beforeend",
        '<span class="ybmValidateDone" hidden>인증</span>',
      );
    if (mode === "readonly")
      row.insertAdjacentHTML(
        "beforeend",
        '<input name="entry.examDate" readonly>',
      );
    expect(collected()).toEqual([]);
  },
);
it("allows only a truly hidden empty default marker and refuses populated details before click", async () => {
  mount();
  document
    .querySelector("#synthetic-row")!
    .insertAdjacentHTML(
      "beforeend",
      '<span class="ybmValidateDone hide" style="display:none"></span>',
    );
  const { handle, item } = searchItem("가상 어학시험");
  detail(true, false);
  document.querySelector<HTMLSelectElement>("select")!.value = "G_AL";
  let keys = 0;
  handle.elements[0].addEventListener("keypress", () => keys++);
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(keys).toBe(0);
});
it("does not accept tuple alone when exam detail was never replaced", async () => {
  mount();
  const { handle, item } = searchItem("가상 어학시험");
  handle.elements[0].addEventListener(
    "keypress",
    onSiteEnter(() =>
      showResults(
        handle.elements[0],
        ["가상 어학시험"],
        undefined,
        "234",
        metadata(false, false),
      ),
    ),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(collected()).toEqual(["synthetic.search.name"]);
});
it("guards the click when a user populates detail while results are pending", async () => {
  mount();
  const { handle, item } = searchItem("가상 어학시험");
  let clicks = 0;
  handle.elements[0].addEventListener(
    "keypress",
    onSiteEnter(() => {
      const input = document.createElement("input");
      input.value = "사용자 입력";
      document.querySelector('[data-template="detail"]')!.append(input);
      showResults(
        handle.elements[0],
        ["가상 어학시험"],
        () => clicks++,
        "234",
        metadata(true, false),
      );
    }),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(clicks).toBe(0);
});
it("retains an inert structural placeholder for an authenticated row without reading its values", () => {
  mountSearch("foreignExam", (s) => {
    s.excludedRow = {
      name: "synthetic.search.name",
      reason: "입력 불가(인증 시험 — 사용자 처리)",
    };
  });
  document
    .querySelector("#synthetic-row")!
    .insertAdjacentHTML(
      "beforeend",
      '<span class="ybmValidateDone">인증</span>',
    );
  const snapshot = collectFieldsSnapshot(document),
    field = snapshot.request.sections[0]?.fields[0];
  expect(field).toMatchObject({
    domName: "synthetic.search.name",
    inert: true,
    displayName: "입력 불가(인증 시험 — 사용자 처리)",
  });
  const lookup = snapshot.registry.lookupField(field!.candidateId);
  expect(lookup.status).not.toBe("ready");
  if ("handle" in lookup) {
    const review = {
      candidateId: field!.candidateId,
      selected: true,
      disabled: false,
      profileValue: "다른 시험",
    } as never;
    expect(getWriteAdapter(document).tryWrite(lookup.handle, review)).toEqual({
      handled: true,
      written: false,
    });
  }
  expect(JSON.stringify(snapshot.request)).not.toContain("다른 시험");
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aggregatePage, recountVerdict, renderReport } from "./aggregate.mjs";

const row = (i, category = "AUTOFILLABLE") => ({ i, category });
// 8 AUTOFILLABLE controls (0-7), two others (8, 9).
const joined = {
  rows: [
    ...Array.from({ length: 8 }, (_, i) => row(i)),
    row(8, "NO_PROFILE_KEY"),
    row(9, "FORBIDDEN"),
  ],
  addedOrUnmatchedAfterControls: [{}, {}],
  rowExpansion: [
    { section: "A", extraRowsExpected: 1, autofillablePerRow: 2 },
    { section: "B", extraRowsExpected: 2, autofillablePerRow: 1 },
  ],
};
const items = [
  { ref: "i=1 a", kind: "WRONG", written: "x" },
  { ref: "i=2 b", kind: "MISSED" },
  { ref: "i=3 c", kind: "UNVERIFIABLE" },
  { ref: "i=4 d", kind: "EXPECTATION_ERROR" },
  { ref: "new e[1]", kind: "EXTRA_CORRECT" },
  { ref: "new e[1].f", kind: "EXTRA_WRONG" },
  { ref: "new g[2]", kind: "MISSED" },
];
// Every total is deliberately wrong.
const liar = {
  label: "sk-x",
  autofillable: 99,
  correct: 99,
  wrong: 0,
  missed: 0,
  expectationErrors: 9,
  unverifiable: 9,
  extraWritten: 0,
  extraCorrect: 9,
  extraWrong: 9,
  createdRowsExpected: 9,
  createdRowsObserved: 2,
  items,
};

describe("recountVerdict", () => {
  it("counts every field from the items and the joined rows, not from the model", () => {
    const r = recountVerdict(liar, joined);
    expect(r).toMatchObject({
      autofillable: 8,
      correct: 4,
      wrong: 1,
      missed: 2,
      expectationErrors: 1,
      unverifiable: 1,
      extraCorrect: 1,
      extraWrong: 1,
      extraWritten: 2,
      createdRowsExpected: 3,
      createdRowsObserved: 2,
    });
    expect(r.mismatches).toEqual([
      "verdict-mismatch:autofillable model=99 recount=8",
      "verdict-mismatch:correct model=99 recount=4",
      "verdict-mismatch:wrong model=0 recount=1",
      "verdict-mismatch:missed model=0 recount=2",
      "verdict-mismatch:expectationErrors model=9 recount=1",
      "verdict-mismatch:unverifiable model=9 recount=1",
      "verdict-mismatch:extraWritten model=0 recount=2",
      "verdict-mismatch:extraCorrect model=9 recount=1",
      "verdict-mismatch:extraWrong model=9 recount=1",
      "verdict-mismatch:createdRowsExpected model=9 recount=3",
    ]);
  });

  it("reports no mismatch when the model counted correctly", () => {
    const honest = {
      ...liar,
      autofillable: 8,
      correct: 4,
      wrong: 1,
      missed: 2,
      expectationErrors: 1,
      unverifiable: 1,
      extraWritten: 2,
      extraCorrect: 1,
      extraWrong: 1,
      createdRowsExpected: 3,
    };
    expect(recountVerdict(honest, joined).mismatches).toEqual([]);
  });

  it("subtracts a control from correct once even when it appears in two items", () => {
    const twice = {
      ...liar,
      items: [
        { ref: "i=1 a", kind: "WRONG" },
        { ref: "i=1 a", kind: "MISSED" },
      ],
    };
    expect(recountVerdict(twice, joined)).toMatchObject({
      correct: 7,
      wrong: 1,
      missed: 1,
    });
  });

  it("keeps MISSED items of non-AUTOFILLABLE and new controls in missed without touching correct", () => {
    const outside = {
      ...liar,
      items: [
        { ref: "i=8 h", kind: "MISSED" },
        { ref: "new k[1]", kind: "MISSED" },
        { ref: "i=42 nope", kind: "MISSED" },
      ],
    };
    expect(recountVerdict(outside, joined)).toMatchObject({
      correct: 8,
      missed: 3,
    });
  });

  it("keeps the model's createdRowsExpected when the join has no rowExpansion", () => {
    const withoutExpansion = { ...joined };
    delete withoutExpansion.rowExpansion;
    expect(recountVerdict(liar, withoutExpansion).createdRowsExpected).toBe(9);
  });
});

describe("aggregatePage with recount", () => {
  it("puts the recounted numbers in the report and flags the model's totals", () => {
    const page = aggregatePage({
      label: "sk-x",
      joined,
      verdict: liar,
      run: { panel: { stage: "result", counts: {} } },
    });
    // correct 4 + extraCorrect 1, wrong 1 + extraWrong 1, missed 2 + estimated
    // cells of the 1 row short (4 cells / 3 rows ≈ 1).
    expect(page).toMatchObject({
      correct: 5,
      wrong: 2,
      missed: 3,
      denominator: 10,
      unverifiable: 1,
      expectationErrors: 1,
      rowsExpected: 3,
      rowsObserved: 2,
      estimatedUncreated: 1,
    });
    expect(page.warnings).toContain("rows-not-created:3>2 (추정 1칸)");
    expect(page.warnings).toContain(
      "verdict-mismatch:correct model=99 recount=4",
    );
    const md = renderReport({
      title: "QA",
      meta: { apiOrigin: "x", date: "d" },
      pages: [page],
    });
    expect(md).toMatch(/\| sk-x \|[^\n]*\| 10 \| 7 \| 5 \| 2 \| 3 \|/);
    expect(md).toContain("⚠ verdict-mismatch:correct model=99 recount=4");
  });
});

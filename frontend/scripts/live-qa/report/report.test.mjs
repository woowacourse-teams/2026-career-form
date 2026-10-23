// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildGradeInput } from "./grade-input.mjs";
import { joinResults } from "./join.mjs";
import {
  HPLACE_POLICY_EXCLUSIONS,
  aggregatePage,
  renderReport,
} from "./aggregate.mjs";

const control = (i, name, extra = {}) => ({
  i,
  tag: "input",
  type: "text",
  name,
  id: "",
  label: name,
  section: "S",
  hasValue: false,
  fp: "",
  key: `input|text|${name}|||S#1`,
  ...extra,
});
const frames = (controls) => [
  {
    frame: "https://x.example/f",
    main: true,
    url: "https://x.example/f",
    controls,
  },
];

describe("buildGradeInput", () => {
  it("keeps index 0 and drops fingerprints, keys and values", () => {
    const input = buildGradeInput(
      "hp-gsenc-s2",
      frames([
        control(0, "a", { fp: "zz", shown: "v" }),
        control(1, "b", { required: true }),
      ]),
      ["대학 학력 정보 추가"],
    );
    expect(input).toMatchObject({
      label: "hp-gsenc-s2",
      platform: "hp",
      site: "gsenc",
      step: "s2",
      stepName: "학력/연구/경력/NCS",
      controlCount: 2,
      addButtons: ["대학 학력 정보 추가"],
    });
    expect(input.controls[0].i).toBe(0);
    expect(input.controls[1]).toMatchObject({ i: 1, required: true });
    expect(JSON.stringify(input)).not.toMatch(/"fp"|"key"|"shown"|"hasValue"/);
  });
});

describe("joinResults", () => {
  it("pairs graded controls with post-run controls by identity and lists new ones", () => {
    const final = {
      controls: [
        {
          i: 0,
          category: "AUTOFILLABLE",
          profileKey: "p.a",
          expected: "A",
          note: "",
        },
        {
          i: 1,
          category: "NO_PROFILE_KEY",
          profileKey: "",
          expected: "",
          note: "",
        },
      ],
      rowExpansion: [
        { section: "S", extraRowsExpected: 1, autofillablePerRow: 2 },
      ],
    };
    const pre = frames([control(0, "a"), control(1, "b")]);
    const run = {
      panel: { stage: "result", counts: { completed: 2, needsReview: 0 } },
      after: frames([
        control(0, "a", { hasValue: true, changed: true, shown: "A" }),
        control(1, "b"),
        control(2, "c[1]", {
          hasValue: true,
          changed: true,
          added: true,
          shown: "C",
        }),
      ]),
    };
    const joined = joinResults({ label: "x", final, census: pre, run });
    expect(joined.rows).toEqual([
      expect.objectContaining({
        i: 0,
        category: "AUTOFILLABLE",
        expected: "A",
        written: "A",
        changed: true,
      }),
      expect.objectContaining({
        i: 1,
        category: "NO_PROFILE_KEY",
        changed: false,
      }),
    ]);
    expect(joined.addedOrUnmatchedAfterControls).toEqual([
      expect.objectContaining({ name: "c[1]", written: "C", hasValue: true }),
    ]);
    expect(joined.rowExpansion).toEqual(final.rowExpansion);
  });

  it("keeps controls of different frames apart and numbers them across the page", () => {
    const two = [
      {
        frame: "https://x.example/f",
        key: "main",
        main: true,
        controls: [control(0, "name")],
      },
      {
        frame: "https://x.example/q",
        key: "https://x.example/q#1",
        main: false,
        controls: [control(0, "name")],
      },
    ];
    const input = buildGradeInput("gr-x", two);
    expect(input.controls.map((c) => c.i)).toEqual([0, 1]);
    const final = {
      controls: [
        {
          i: 0,
          category: "AUTOFILLABLE",
          profileKey: "p",
          expected: "A",
          note: "",
        },
        {
          i: 1,
          category: "NOT_A_FIELD",
          profileKey: "",
          expected: "",
          note: "",
        },
      ],
    };
    const run = {
      after: [
        {
          ...two[0],
          controls: [
            control(0, "name", { hasValue: true, changed: true, shown: "A" }),
          ],
        },
        { ...two[1], controls: [control(1, "name")] },
      ],
    };
    const { rows, addedOrUnmatchedAfterControls } = joinResults({
      label: "gr-x",
      final,
      census: two,
      run,
    });
    expect(rows.map((r) => [r.i, r.category, r.written])).toEqual([
      [0, "AUTOFILLABLE", "A"],
      [1, "NOT_A_FIELD", null],
    ]);
    expect(addedOrUnmatchedAfterControls).toEqual([]);
  });

  it("flags values that were already on the page before the run", () => {
    const final = {
      controls: [
        {
          i: 0,
          category: "AUTOFILLABLE",
          profileKey: "p",
          expected: "A",
          note: "",
        },
      ],
    };
    const run = {
      after: frames([
        control(0, "a", { hasValue: true, changed: false, preexisting: true }),
      ]),
    };
    const [row] = joinResults({
      label: "x",
      final,
      census: frames([control(0, "a")]),
      run,
    }).rows;
    expect(row).toMatchObject({
      afterHasValue: true,
      changed: false,
      preexistingValue: true,
      written: null,
    });
  });

  it("passes siteDefault and companionOf through from the post-run census", () => {
    const final = {
      controls: [
        { i: 0, category: "AUTOFILLABLE", profileKey: "p", expected: "A" },
      ],
    };
    const run = {
      testAccount: true,
      after: frames([
        control(0, "langCd", { hasValue: true, siteDefault: true }),
        control(1, "langNm", {
          type: "hidden",
          hidden: true,
          hasValue: true,
          companionOf: 0,
          added: true,
        }),
      ]),
    };
    const joined = joinResults({
      label: "x",
      final,
      census: frames([control(0, "langCd")]),
      run,
    });
    expect(joined.rows[0]).toMatchObject({ siteDefault: true });
    expect(joined.rows[0].companionOf).toBeUndefined();
    expect(joined.addedOrUnmatchedAfterControls[0]).toMatchObject({
      name: "langNm",
      siteDefault: false,
      companionOf: 0,
    });
  });
});

const verdict = {
  autofillable: 10,
  correct: 7,
  wrong: 1,
  missed: 2,
  expectationErrors: 0,
  extraCorrect: 4,
  extraWrong: 0,
  createdRowsExpected: 3,
  createdRowsObserved: 2,
  items: [
    { ref: "i=3 college[0].collegeCategoryCode", kind: "MISSED" },
    { ref: "i=4 jobNm", kind: "MISSED" },
    { ref: "i=5 x", kind: "WRONG", written: "bad" },
  ],
};
const joined = {
  rows: Array.from({ length: 12 }, (_, i) => ({ i })),
  addedOrUnmatchedAfterControls: [{}, {}, {}],
};
const run = {
  panel: { stage: "result", counts: { completed: 9, needsReview: 1 } },
};

describe("HPLACE_POLICY_EXCLUSIONS", () => {
  it("matches the documented exclusions and no other address cell", () => {
    for (const ref of [
      "i=3 college[0].collegeCategoryCode",
      "i=9 college[0].collegeMajor[1].dayOrNight",
      "new college[1].collegeMajor[2].dayOrNight",
      "i=20 languageTest[0].examDate",
      "i=16 residentAddress.zipCode",
      "i=18 residentAddress.detailAddress",
    ])
      expect(HPLACE_POLICY_EXCLUSIONS.test(ref), ref).toBe(true);
    for (const ref of [
      "i=13 currentAddress.zipCode",
      "i=8 college[0].collegeMajor[0].dayOrNight",
      "i=21 languageTest[0].acquisitionDate",
    ])
      expect(HPLACE_POLICY_EXCLUSIONS.test(ref), ref).toBe(false);
  });
});

describe("aggregatePage", () => {
  it("counts correct + wrong + missed, including cells of rows that were never created", () => {
    const page = aggregatePage({
      label: "sk-x",
      joined,
      verdict,
      run,
      uncreatedCells: 4,
      policyPattern: /collegeCategoryCode/,
    });
    expect(page).toMatchObject({
      pageControls: 12,
      addedControls: 3,
      written: 12,
      correct: 11,
      wrong: 1,
      missed: 6,
      denominator: 18,
      policyMissed: 1,
      panelCompleted: 9,
      panelReview: 1,
    });
    expect(page.rate).toBeCloseTo((11 / 18) * 100);
    expect(page.policyRate).toBeCloseTo((11 / 17) * 100);
  });

  it("keeps run errors and invalidates a run whose guard blocked a site action", () => {
    const timedOut = aggregatePage({
      label: "gr-x",
      joined,
      verdict,
      run: {
        panel: { stage: "review" },
        error: { code: "run-timeout" },
        guard: { passed: true },
      },
    });
    expect(timedOut).toMatchObject({
      measured: true,
      error: "run-timeout",
      stage: "review",
    });
    const blocked = aggregatePage({
      label: "gr-x",
      joined,
      verdict,
      run: { panel: { stage: "result", counts: {} }, guard: { passed: false } },
    });
    expect(blocked).toMatchObject({ measured: false, error: "guard-failed" });
  });

  it("warns when rows were not created and no uncreated cells were given", () => {
    expect(
      aggregatePage({ label: "sk-x", joined, verdict, run }).warnings,
    ).toEqual(["rows-not-created:3>2"]);
    expect(
      aggregatePage({ label: "sk-x", joined, verdict, run, uncreatedCells: 4 })
        .warnings,
    ).toEqual([]);
  });

  it("estimates cells of rows that were not created from the expected row sizes", () => {
    const withRows = {
      ...joined,
      rowExpansion: [{ extraRowsExpected: 3, autofillablePerRow: 2 }],
    };
    const page = aggregatePage({
      label: "sk-x",
      joined: withRows,
      verdict,
      run,
    });
    expect(page).toMatchObject({
      estimatedUncreated: 2,
      missed: 4,
      denominator: 16,
    });
    expect(page.warnings).toEqual(["rows-not-created:3>2 (추정 2칸)"]);
  });

  it("takes uncreated cells with their policy-excluded part", () => {
    const page = aggregatePage({
      label: "hp-x-s2",
      joined,
      verdict,
      run,
      uncreatedCells: { cells: 4, policyCells: 2 },
      policyPattern: /collegeCategoryCode/,
    });
    expect(page).toMatchObject({ missed: 6, denominator: 18, policyMissed: 3 });
  });

  it("notes custom widgets the clear step could not empty", () => {
    const page = aggregatePage({
      label: "hy-x",
      joined,
      verdict,
      run: { ...run, cleared: [{ widgetsLeft: 2 }, { widgetsLeft: 1 }] },
    });
    expect(page.widgetsLeft).toBe(3);
    const md = renderReport({
      title: "QA",
      meta: { apiOrigin: "x", date: "d" },
      pages: [page],
    });
    expect(md).toContain("비우지 못한 위젯 3");
  });

  it("leaves unverifiable controls out of the denominator but reports them", () => {
    const page = aggregatePage({
      label: "gr-x",
      joined,
      verdict: { ...verdict, unverifiable: 2 },
      run,
    });
    expect(page).toMatchObject({ denominator: 14, unverifiable: 2 });
  });

  it("reports a page without a verdict as not measured", () => {
    expect(
      aggregatePage({
        label: "hp-x-s4",
        joined,
        run: { error: { code: "extension-exception" } },
      }),
    ).toMatchObject({
      measured: false,
      error: "extension-exception",
    });
  });
});

describe("renderReport", () => {
  it("renders a markdown summary table without applicant values", () => {
    const pages = [
      aggregatePage({
        label: "gr-kurly",
        joined,
        verdict: { ...verdict, items: [] },
        run: {
          panel: { stage: "result", counts: { completed: 9, needsReview: 1 } },
          build: { revision: "a".repeat(40) },
        },
      }),
    ];
    const md = renderReport({
      title: "QA",
      meta: {
        revision: "a".repeat(40),
        apiOrigin: "http://localhost:8080",
        date: "2026-10-21",
      },
      pages,
      names: { "gr-kurly": "Greeting · 컬리" },
    });
    expect(md).toContain("# QA");
    expect(md).toContain("| Greeting · 컬리 |");
    expect(md).toContain("| 페이지 | 화면 전체 칸");
    expect(md).toContain("aaaaaaa");
    expect(md).not.toContain("bad");
  });

  it("adds the policy-adjusted rate for Hplace pages, run revisions and errors", () => {
    const pages = [
      aggregatePage({
        label: "hp-a-s2",
        joined,
        verdict,
        run: { ...run, build: { revision: "b".repeat(40) } },
        uncreatedCells: 4,
        policyPattern: /collegeCategoryCode/,
      }),
      aggregatePage({
        label: "gr-b",
        joined,
        verdict,
        run: {
          panel: { stage: "review" },
          error: { code: "run-timeout" },
          build: { revision: "c".repeat(40) },
        },
      }),
    ];
    const md = renderReport({
      title: "QA",
      meta: { apiOrigin: "x", date: "d" },
      pages,
    });
    expect(md).toContain("| 정책 반영 |");
    expect(md).toMatch(/\| hp-a-s2 \|.*\| 64\.7% \|/);
    expect(md).toContain("`bbbbbbb`");
    expect(md).toContain("`ccccccc`");
    expect(md).toContain("⚠ run-timeout");
  });

  it("prints a dash instead of NaN when nothing could be measured", () => {
    const empty = {
      ...verdict,
      correct: 0,
      wrong: 0,
      missed: 0,
      extraCorrect: 0,
      extraWrong: 0,
      createdRowsExpected: 0,
      createdRowsObserved: 0,
      items: [],
    };
    const md = renderReport({
      title: "QA",
      meta: { apiOrigin: "x", date: "d" },
      pages: [aggregatePage({ label: "hp-x-s4", joined, verdict: empty, run })],
    });
    expect(md).not.toContain("NaN");
  });
});

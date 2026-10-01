import { describe, expect, it } from "vitest";
import {
  resolveDateTargetFormat,
  validateDateTargetValue,
  revalidateDateTarget,
} from "./date-target-format";
import type { FieldCandidateHandle } from "../dom/types";
function handle(
  el: HTMLInputElement,
  placeholder?: string,
): FieldCandidateHandle {
  if (placeholder !== undefined) el.setAttribute("placeholder", placeholder);
  return {
    kind: "field",
    candidateId: "x",
    sectionId: "s",
    signature: "sig",
    candidate: {
      candidateId: "x",
      visibility: "visible",
      element: "input",
      control: "text",
      placeholder,
    },
    elements: [el],
    optionElements: new Map(),
  };
}
describe("date target approval", () => {
  it("rejects ambiguous, mixed, unsupported, and boundary tokens", () => {
    const el = document.createElement("input");
    el.type = "text";
    for (const p of [
      "",
      "date",
      "YYYY.MM YYYY.MM",
      "YYYY.MM and YYYY.MM.DD",
      "YYYY.MM-DD",
      "YYYY.MM-DD",
      "xYYYY.MM",
      "YYYY.MMx",
      "YYYY-MM-DD/YYYY.MM",
    ])
      expect(resolveDateTargetFormat(handle(el, p)).status, p).toBe(
        "unavailable",
      );
  });
  it("accepts labeled dotted formats with safe surrounding text", () => {
    const el = document.createElement("input");
    el.type = "text";
    for (const p of ["Date: YYYY.MM", "(YYYY.MM.DD)"])
      expect(resolveDateTargetFormat(handle(el, p)).status).toBe("resolved");
  });
  it("rejects text length conflicts during resolution and malformed constraints", () => {
    const el = document.createElement("input");
    el.type = "text";
    el.setAttribute("maxlength", "6");
    expect(resolveDateTargetFormat(handle(el, "YYYY.MM")).status).toBe(
      "unavailable",
    );
    el.removeAttribute("maxlength");
    el.setAttribute("minlength", "oops");
    expect(el.getAttribute("minlength")).toBe("oops");
    expect(resolveDateTargetFormat(handle(el, "YYYY.MM")).status).toBe(
      "unavailable",
    );
  });
  it("honors pattern, min/max, step, and value step base constraints", () => {
    const el = document.createElement("input");
    el.type = "text";
    el.pattern = "[0-9]{4}\\.[0-9]{2}";
    const got = resolveDateTargetFormat(handle(el, "YYYY.MM"));
    expect(got.status).toBe("resolved");
    if (got.status !== "resolved") return;
    expect(validateDateTargetValue(got.approval, "2024.12").status).toBe(
      "valid",
    );
    el.pattern = ".*";
    expect(validateDateTargetValue(got.approval, "2024.12").status).toBe(
      "valid",
    );
    const d = document.createElement("input");
    d.type = "date";
    d.setAttribute("value", "2024-01-01");
    d.min = "2024-01-01";
    d.max = "2024-12-31";
    d.step = "2";
    const dg = resolveDateTargetFormat(handle(d));
    expect(dg.status).toBe("resolved");
    if (dg.status === "resolved") {
      expect(validateDateTargetValue(dg.approval, "2024-01-03").status).toBe(
        "valid",
      );
      expect(validateDateTargetValue(dg.approval, "2024-01-02").status).toBe(
        "invalid",
      );
    }
  });
  it("rejects invalid leap days including years below 100 without mutating or dispatching", () => {
    const el = document.createElement("input");
    el.type = "date";
    const got = resolveDateTargetFormat(handle(el));
    if (got.status !== "resolved") throw new Error("expected approval");
    let events = 0;
    el.addEventListener("input", () => events++);
    el.addEventListener("change", () => events++);
    expect(validateDateTargetValue(got.approval, "0004-02-29").status).toBe(
      "valid",
    );
    expect(validateDateTargetValue(got.approval, "0001-02-29").status).toBe(
      "invalid",
    );
    expect(el.value).toBe("");
    expect(events).toBe(0);
  });
  it("rejects a detached approved element and same-id replacement", () => {
    const el = document.createElement("input");
    el.type = "date";
    document.body.append(el);
    const h = handle(el);
    const got = resolveDateTargetFormat(h);
    if (got.status !== "resolved") throw new Error("expected approval");
    el.remove();
    expect(revalidateDateTarget(h, got.approval, "2024-01-01").status).toBe(
      "invalid",
    );
    const replacement = document.createElement("input");
    replacement.type = "date";
    document.body.append(replacement);
    expect(
      revalidateDateTarget(handle(replacement), got.approval, "2024-01-01")
        .status,
    ).toBe("invalid");
    replacement.remove();
  });
  it("rejects multiple controls and non-date input types", () => {
    const a = document.createElement("input");
    a.type = "text";
    const h = handle(a, "YYYY.MM");
    h.elements.push(document.createElement("input"));
    expect(resolveDateTargetFormat(h).status).toBe("unavailable");
    for (const type of ["email", "number", "time"]) {
      a.type = type;
      expect(resolveDateTargetFormat(handle(a, "YYYY.MM")).status).toBe(
        "unavailable",
      );
    }
  });
  it("invalidates approvals after every snapshotted target attribute changes", () => {
    for (const [name, value] of [
      ["type", "text"],
      ["placeholder", "YYYY.MM"],
      ["min", "2024-01-01"],
      ["max", "2025-01-01"],
      ["step", "2"],
      ["minlength", "8"],
      ["maxlength", "12"],
      ["pattern", ".*"],
      ["value", "2024-01-01"],
    ] as const) {
      const e = document.createElement("input");
      e.type = "date";
      document.body.append(e);
      const h = handle(e);
      const a = resolveDateTargetFormat(h);
      if (a.status !== "resolved") throw Error("approval missing");
      e.setAttribute(name, value);
      expect(
        revalidateDateTarget(h, a.approval, "2024-01-01").status,
        name,
      ).toBe("invalid");
      e.remove();
    }
  });
  it("rejects malformed applicable pattern and inconsistent lengths", () => {
    const e = document.createElement("input");
    e.type = "text";
    e.setAttribute("pattern", "[");
    expect(resolveDateTargetFormat(handle(e, "YYYY.MM")).status).toBe(
      "unavailable",
    );
    e.removeAttribute("pattern");
    e.setAttribute("minlength", "8");
    e.setAttribute("maxlength", "6");
    expect(resolveDateTargetFormat(handle(e, "YYYY.MM")).status).toBe(
      "unavailable",
    );
  });
  it("uses minimum before value attribute as the native date step base", () => {
    const e = document.createElement("input");
    e.type = "date";
    e.min = "2024-01-01";
    e.setAttribute("value", "2024-01-02");
    e.step = "2";
    const r = resolveDateTargetFormat(handle(e));
    if (r.status !== "resolved") throw Error(r.reason);
    expect(validateDateTargetValue(r.approval, "2024-01-03").status).toBe(
      "valid",
    );
  });
  it("uses the 1970 epoch as an unbased native date step base", () => {
    const e = document.createElement("input");
    e.type = "date";
    e.step = "2";
    const r = resolveDateTargetFormat(handle(e));
    if (r.status !== "resolved") throw Error(r.reason);
    expect(validateDateTargetValue(r.approval, "1970-01-01").status).toBe(
      "valid",
    );
  });
  it("uses the 1970 epoch as an unbased native month step base", () => {
    const e = document.createElement("input");
    e.type = "month";
    e.step = "7";
    const r = resolveDateTargetFormat(handle(e));
    if (r.status !== "resolved") throw Error(r.reason);
    expect(validateDateTargetValue(r.approval, "1970-01").status).toBe("valid");
  });
  it("accepts fractional positive native step values according to browser validity", () => {
    for (const [step, value] of [
      ["0.5", "2024-01-02"],
      ["1.5", "2024-01-03"],
    ]) {
      const e = document.createElement("input");
      e.type = "date";
      e.step = step;
      const r = resolveDateTargetFormat(handle(e));
      if (r.status !== "resolved") throw Error(r.reason);
      expect(validateDateTargetValue(r.approval, value).status).toBe("valid");
    }
  });
  it("rejects year zero month and exact-length date strings", () => {
    const m = document.createElement("input");
    m.type = "month";
    const mr = resolveDateTargetFormat(handle(m));
    if (mr.status !== "resolved") throw Error(mr.reason);
    expect(validateDateTargetValue(mr.approval, "0000-01").status).toBe(
      "invalid",
    );
    const d = document.createElement("input");
    d.type = "date";
    d.setAttribute("min", "2024-01-01\n");
    expect(resolveDateTargetFormat(handle(d)).status).toBe("unavailable");
  });
  it("rejects alternate date notation alongside a supported token", () => {
    const e = document.createElement("input");
    e.type = "text";
    for (const p of [
      "YYYY.MM or MM/DD/YYYY",
      "YYYY.MM or YYYY/MM/DD",
      "YYYY.MM 또는 MM/DD/YYYY",
    ])
      expect(resolveDateTargetFormat(handle(e, p)).status).toBe("unavailable");
  });
  it("reports distinct reasons for missing, repeated, mixed, and boundary clues", () => {
    const e = document.createElement("input");
    e.type = "text";
    const reasons = [
      "",
      "YYYY.MM YYYY.MM",
      "YYYY.MM or MM/DD/YYYY",
      "xYYYY.MM",
    ].map((p) => {
      const r = resolveDateTargetFormat(handle(e, p));
      return r.status === "unavailable" ? r.reason : "resolved";
    });
    expect(new Set(reasons).size).toBe(4);
  });
  it("recognizes live native date and month controls", () => {
    for (const [type, format] of [
      ["date", "YYYY-MM-DD"],
      ["month", "YYYY-MM"],
    ] as const) {
      const el = document.createElement("input");
      el.type = type;
      const got = resolveDateTargetFormat(handle(el));
      expect(got.status).toBe("resolved");
      if (got.status === "resolved") expect(got.format).toBe(format);
    }
  });
  it("accepts exactly one standalone uppercase dotted token", () => {
    const el = document.createElement("input");
    el.type = "text";
    const got = resolveDateTargetFormat(handle(el, "YYYY.MM.DD"));
    expect(got.status).toBe("resolved");
    if (got.status === "resolved") expect(got.format).toBe("YYYY.MM.DD");
    expect(
      resolveDateTargetFormat(handle(el, "YYYY.MM or YYYY.MM.DD")).status,
    ).toBe("unavailable");
    expect(resolveDateTargetFormat(handle(el, "xYYYY.MM")).status).toBe(
      "unavailable",
    );
  });
  it("validates applicable text constraints before approval is used", () => {
    const el = document.createElement("input");
    el.type = "text";
    el.maxLength = 7;
    const got = resolveDateTargetFormat(handle(el, "YYYY.MM"));
    expect(got.status).toBe("resolved");
    if (got.status === "resolved")
      expect(validateDateTargetValue(got.approval, "2024.12").status).toBe(
        "valid",
      );
  });
  it("rejects stale identity or changed snapshot without writing", () => {
    const el = document.createElement("input");
    el.type = "date";
    document.body.append(el);
    const h = handle(el);
    const got = resolveDateTargetFormat(h);
    expect(got.status).toBe("resolved");
    if (got.status !== "resolved") return;
    expect(revalidateDateTarget(h, got.approval, "2024-01-31").status).toBe(
      "valid",
    );
    el.setAttribute("step", "2");
    expect(revalidateDateTarget(h, got.approval, "2024-01-31").status).toBe(
      "invalid",
    );
    expect(el.value).toBe("");
  });
  it("rejects compact alternate date formats alongside dotted tokens", () => {
    const el = document.createElement("input");
    el.type = "text";
    for (const clue of [
      "YYYY.MM 또는 YYYYMMDD",
      "YYYY.MM or yyyyMMdd",
      "YYYY.MM / YYYYMM",
      "YYYY.MM 또는 YYMMDD",
      "YYYY.MM or YYMMDD",
    ]) {
      const result = resolveDateTargetFormat(handle(el, clue));
      expect(result.status, clue).toBe("unavailable");
      if (result.status === "unavailable")
        expect(result.reason, clue).toMatch(/mixed/i);
    }
  });
  it("does not mistake ordinary prose labels for compact date clues", () => {
    const el = document.createElement("input");
    el.type = "text";
    for (const clue of [
      "Graduation date: YYYY.MM",
      "입학 YYYY.MM (expected)",
      "Date YYYY.MM format",
    ])
      expect(resolveDateTargetFormat(handle(el, clue)).status).toBe("resolved");
  });
  it("rejects mixed compact token orders and underscore-separated dates", () => {
    const el = document.createElement("input");
    el.type = "text";
    const clues = [
      "YYYY.MM or MMDDYYYY",
      "YYYY.MM or DDMMYYYY",
      "YYYY.MM or MMYYYY",
      "YYYY.MM or YYYY_MM_DD",
      "YYYY.MM.DD or MMDDYYYY",
      "YYYY.MM.DD or DDMMYYYY",
      "YYYY.MM.DD or MMYYYY",
      "YYYY.MM.DD or YYYY_MM_DD",
    ];
    for (const clue of clues) {
      const result = resolveDateTargetFormat(handle(el, clue));
      expect(result.status, clue).toBe("unavailable");
      if (result.status === "unavailable")
        expect(result.reason, clue).toMatch(/mixed/i);
    }
  });
});

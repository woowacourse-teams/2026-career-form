import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { resolveDocumentCompany } from "../adapters/company";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeReadonlySearch } from "../interaction";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";

vi.mock("../interaction", async (original) => ({
  ...(await original<typeof import("../interaction")>()),
  executeReadonlySearch: vi.fn(),
}));

const html = readFileSync(
  join(process.cwd(), "fixtures/dom-snapshots/naver-step2-form/sanitized.html"),
  "utf8",
);

// The snapshot is a form-structure baseline, not a recording of the live search
// popup or server. Only that search boundary and approved profile mappings are
// synthetic; collection, ordinary writes, hold decisions and readback are real.
function setup(addCareerRow = false) {
  document.body.innerHTML = html;
  if (addCareerRow) {
    const row = document.querySelector("#corpNm0")!.closest(".rcform_copy")!;
    const copy = row.cloneNode(true) as HTMLElement;
    for (const element of copy.querySelectorAll<HTMLElement>("[id]"))
      element.id = `second-${element.id}`;
    for (const label of copy.querySelectorAll("label[for]"))
      label.htmlFor = `second-${label.htmlFor}`;
    row.after(copy);
  }
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const specs = [
    ["corpNm0", "careers.career.companyName", "합성회사", "career-0"],
    ["deptNm0", "careers.career.department", "합성부서", "career-0"],
    ["jikwiNm0", "careers.career.position", "합성직책", "career-0"],
    ["enterYmd0", "careers.career.startDate", "2020-01-01", "career-0"],
    ["retireYmd0", "careers.career.endDate", "2021-01-01", "career-0"],
    ...(addCareerRow
      ? [["second-deptNm0", "careers.career.department", "다른부서", "career-1"]]
      : []),
    ["score", "languages.languageTest.score", "900", "language-0"],
  ];
  const items: ReviewPlanItem[] = specs.map(([id, key, value, entry]) => {
    const input = document.getElementById(id!) as HTMLInputElement | null;
    if (!input) throw new Error(`fixture control missing: ${id}`);
    const field = fields.find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return "handle" in lookup && lookup.handle.elements[0] === input;
    });
    if (!field) throw new Error(`fixture candidate missing: ${id}`);
    const lookup = snapshot.registry.lookupField(field.candidateId);
    if (!("handle" in lookup)) throw new Error("fixture handle missing");
    return {
      candidateId: field.candidateId,
      fieldLabel: field.displayName ?? id!,
      profileFieldKey: key!,
      profileEntryId: entry!,
      itemIndex: lookup.handle.itemIndex,
      currentValue: "",
      profileValue: value!,
      previewValue: value!,
      status: "needs-review",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "",
      analysis: {
        candidateId: field.candidateId,
        matchType: "MATCH",
        valueBinding: { type: "DIRECT", profileFieldKey: key! },
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "CONDITIONAL",
        interactionStatus: "READY",
        writePlan: {
          command:
            id === "corpNm0"
              ? "SEARCH_SELECTION"
              : input.readOnly
                ? "SELECT_DATE"
                : "SET_TEXT",
        },
      },
    };
  });
  const popup = document.createElement("div");
  popup.setAttribute("role", "dialog");
  popup.hidden = true;
  document.body.append(popup);
  vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
    popup.hidden = false;
    return {
      targetCandidateId: args.targetCandidateId,
      status: "failed",
      reason: "search_results_not_found",
      effect: "interaction-started",
    };
  });
  return {
    snapshot,
    fields,
    items,
    popup,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
  };
}

afterEach(() => {
  vi.mocked(executeReadonlySearch).mockReset();
  document.body.replaceChildren();
});

describe("reviewed form baseline and empty-search failure boundary", () => {
  it("collects all four repeated groups and preserves career/language ownership", () => {
    const { snapshot, fields, items } = setup();
    expect(resolveDocumentCompany(document)).toBe("generic");
    expect(snapshot.request.sections).toHaveLength(4);
    expect(
      snapshot.request.sections.reduce(
        (count, section) => count + (section.items?.length ?? 0),
        0,
      ),
    ).toBeGreaterThanOrEqual(4);
    expect(fields).toHaveLength(46);
    const handles = items.map((item) => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      if (!("handle" in lookup)) throw new Error("missing handle");
      return lookup.handle;
    });
    expect(handles.slice(0, 5).map((handle) => handle.itemIndex)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(handles.slice(1, 5).every(
      (handle) => handle.itemId === handles[0]!.itemId,
    )).toBe(true);
    expect(handles.at(-1)!.sectionId).not.toBe(handles[0]!.sectionId);
  });

  it("detects a memory-only loss of the collected company control", () => {
    setup();
    document.querySelector("#corpNm0")!.remove();
    const changed = collectFieldsSnapshot(document);
    const fields = changed.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    expect(fields).toHaveLength(45);
    expect(fields.some((field) => field.domId === "corpNm0")).toBe(false);
  });

  it("takes the effectful-failure branch and holds the entire remaining batch by default", async () => {
    const test = setup(true);
    const results = await executeApprovedWritesAfterPageSettles({
      items: test.items,
      registry: test.snapshot.registry,
      approvedCandidateIds: test.approvedCandidateIds,
      document,
    });
    expect(results[0]).toMatchObject({ failureCode: "SEARCH_NO_EXACT_MATCH" });
    expect(results.slice(1).map((result) => result.failureCode)).toEqual(
      Array(6).fill("SEARCH_FOLLOWUP_HALTED"),
    );
    expect(document.querySelector<HTMLInputElement>("#corpNm0")!.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#second-deptNm0")!.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#score")!.value).toBe("");
    expect(test.popup.hidden).toBe(false);
  });
});

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { useReviewDiagnostics } from "./use-review-diagnostics";
import type { Stage } from "./workflow-model";

const attribute = "data-careerform-diagnostic-field";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function enable() {
  vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
  return vi.spyOn(console, "info").mockImplementation(() => {});
}

function fixture() {
  document.body.innerHTML =
    '<section><h3>PRIVATE_SECTION</h3><label>PRIVATE_FIRST<input id="private-first" name="PRIVATE_NAME" value="PRIVATE_VALUE" /></label><label>PRIVATE_SECOND<input id="private-second" /></label></section>';
  const controls = Array.from(document.querySelectorAll("input"));
  const snapshot = collectFieldsSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((row) => row.fields),
  ]);
  const items: ReviewPlanItem[] = candidates.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    fieldLabel: "PRIVATE_LABEL",
    profileFieldKey: "careers.career.companyName",
    profileEntryId: "PRIVATE_BOUND_ENTRY",
    itemIndex: 7,
    currentValue: "PRIVATE_CURRENT",
    previewValue: "PRIVATE_PREVIEW",
    status: index === 0 ? "unavailable" : "available",
    selected: index !== 0,
    disabled: index === 0,
    revealed: false,
    reason: "PRIVATE_REASON",
    genericGrade: index === 0 ? "BLOCKED" : "AUTO",
  }));
  const profile = createEmptyProfile();
  profile.careers = [
    { id: "PRIVATE_OTHER_ENTRY", sectionId: "career", values: {} },
    { id: "PRIVATE_BOUND_ENTRY", sectionId: "career", values: {} },
  ];
  return { controls, snapshot, items, profile };
}

function diagnostic(info: ReturnType<typeof enable>) {
  const [line] = info.mock.calls.at(-1)!;
  return JSON.parse(String(line).slice("[CareerForm] 진단 요약: ".length));
}

describe("local review identity markers", () => {
  it("joins sorted review fields to the same controls only after analysis, without changing form state", () => {
    const info = enable();
    const { controls, snapshot, items, profile } = fixture();
    const original = controls.map((element) => ({
      value: element.value,
      name: element.name,
      id: element.id,
      checked: element.checked,
    }));
    const { rerender, unmount } = renderHook(
      ({ stage, reviewItems }) =>
        useReviewDiagnostics(
          stage,
          "generic",
          reviewItems,
          snapshot,
          document,
          profile,
        ),
      { initialProps: { stage: "analyzing" as Stage, reviewItems: items } },
    );
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      null,
      null,
    ]);
    rerender({ stage: "review", reviewItems: items });
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      "0",
      "1",
    ]);
    expect(diagnostic(info).fields).toMatchObject([
      {
        fieldOrdinal: 1,
        pageSectionOrdinal: 0,
        profileFieldKey: "careers.career.companyName",
        profileSectionId: "career",
        profileRowOrdinal: 1,
      },
      {
        fieldOrdinal: 0,
        pageSectionOrdinal: 0,
        profileFieldKey: "careers.career.companyName",
        profileSectionId: "career",
        profileRowOrdinal: 1,
      },
    ]);
    expect(
      controls.map((element) => ({
        value: element.value,
        name: element.name,
        id: element.id,
        checked: element.checked,
      })),
    ).toEqual(original);
    expect(String(info.mock.calls[0]![0])).not.toMatch(
      /PRIVATE|candidateId|profileEntryId/,
    );
    rerender({ stage: "review", reviewItems: [...items] });
    expect(info).toHaveBeenCalledTimes(1);
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      "0",
      "1",
    ]);
    unmount();
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      null,
      null,
    ]);
  });

  it.each(["flag-off", "remote-api", "static"])(
    "does no annotation or emission for %s",
    (mode) => {
      const info = enable();
      if (mode === "flag-off")
        vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "0");
      if (mode === "remote-api")
        vi.stubEnv("VITE_API_BASE_URL", "https://example.invalid");
      const { controls, snapshot, items, profile } = fixture();
      renderHook(() =>
        useReviewDiagnostics(
          "review",
          mode === "static" ? "static" : "generic",
          items,
          snapshot,
          document,
          profile,
        ),
      );
      expect(
        controls.map((element) => element.getAttribute(attribute)),
      ).toEqual([null, null]);
      expect(info).not.toHaveBeenCalled();
    },
  );

  it("cleans up on gate-off and resets the run on the next review entry", () => {
    const info = enable();
    const { controls, snapshot, items, profile } = fixture();
    const { rerender } = renderHook(
      ({ stage }) =>
        useReviewDiagnostics(
          stage,
          "generic",
          items,
          snapshot,
          document,
          profile,
        ),
      { initialProps: { stage: "review" as Stage } },
    );
    expect(controls[0]).toHaveAttribute(attribute, "0");
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "0");
    rerender({ stage: "review" });
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      null,
      null,
    ]);
    expect(info).toHaveBeenCalledTimes(1);
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
    rerender({ stage: "analyzing" });
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      null,
      null,
    ]);
    rerender({ stage: "review" });
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      "0",
      "1",
    ]);
    expect(info).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite page-owned markers or remove markers changed by the page", () => {
    const info = enable();
    const { controls, snapshot, items, profile } = fixture();
    controls[0]!.setAttribute(attribute, "PRIVATE_PAGE_MARKER");
    const { unmount } = renderHook(() =>
      useReviewDiagnostics(
        "review",
        "generic",
        items,
        snapshot,
        document,
        profile,
      ),
    );
    expect(controls[0]).toHaveAttribute(attribute, "PRIVATE_PAGE_MARKER");
    expect(diagnostic(info).fields).toMatchObject([
      { fieldOrdinal: 1 },
      { fieldOrdinal: null },
    ]);
    controls[1]!.setAttribute(attribute, "PRIVATE_CHANGED_MARKER");
    unmount();
    expect(controls[0]).toHaveAttribute(attribute, "PRIVATE_PAGE_MARKER");
    expect(controls[1]).toHaveAttribute(attribute, "PRIVATE_CHANGED_MARKER");
    expect(String(info.mock.calls[0]![0])).not.toContain("PRIVATE");
  });

  it("gives every element of a radio candidate one shared anonymous ordinal", () => {
    const info = enable();
    document.body.innerHTML =
      '<fieldset><legend>PRIVATE_GROUP</legend><label><input type="radio" name="PRIVATE_RADIO" value="PRIVATE_A" checked />PRIVATE_FIRST</label><label><input type="radio" name="PRIVATE_RADIO" value="PRIVATE_B" />PRIVATE_SECOND</label></fieldset>';
    const controls = Array.from(document.querySelectorAll("input"));
    const snapshot = collectFieldsSnapshot(document);
    const candidates = snapshot.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((row) => row.fields),
    ]);
    expect(candidates).toHaveLength(1);
    const items: ReviewPlanItem[] = candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      fieldLabel: "PRIVATE_LABEL",
      currentValue: "",
      previewValue: "",
      status: "available",
      selected: true,
      disabled: false,
      revealed: false,
      reason: "",
    }));
    const { unmount } = renderHook(() =>
      useReviewDiagnostics("review", "generic", items, snapshot, document),
    );
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      "0",
      "0",
    ]);
    expect(controls.map((element) => element.checked)).toEqual([true, false]);
    expect(diagnostic(info).fields).toMatchObject([
      { fieldOrdinal: 0, controlKind: "radio" },
    ]);
    unmount();
    expect(controls.map((element) => element.getAttribute(attribute))).toEqual([
      null,
      null,
    ]);
  });
});

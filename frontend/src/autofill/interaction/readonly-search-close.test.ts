/**
 * Characterization of how a failed read-only search closes the popup it opened
 * and why it reports surfaceLeftOpenReason (no_safe_close_control /
 * close_not_confirmed). Synthetic DOM only: nothing is submitted or saved.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { collectFieldsSnapshot } from "../dom/collect";
import {
  createMixedEducationLayerFixture,
  type MixedEducationLayerFixture,
} from "../workflow/test-utils/mixed-education-layer.fixture";
import { executeReadonlySearch } from "./readonly-search-executor";

const SCHOOL = "<대학교명>";

let fixture: MixedEducationLayerFixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  vi.useRealTimers();
});

/** Add save/submit style controls to the open layer and spy on every click. */
function addForbiddenControls(layer: HTMLElement): Map<string, number> {
  const clicks = new Map<string, number>();
  for (const label of ["저장", "제출", "임시저장", "검색 초기화"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () =>
      clicks.set(label, (clicks.get(label) ?? 0) + 1),
    );
    layer.append(button);
  }
  return clicks;
}

/** A search that finds no matching result, so the executor fails and closes. */
async function failedSearch() {
  fixture = createMixedEducationLayerFixture({
    rows: [{ kind: "대학교" }],
    results: [{ name: "<다른학교>", code: "<다른코드>" }],
  });
  const branch = fixture.row(0).branch("college");
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" &&
        lookup.handle.elements[0] === branch.schoolName
      );
    });
  expect(candidate).toBeDefined();
  return {
    branch,
    run: async () => {
      vi.useFakeTimers();
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate!.candidateId,
        canonicalFieldKey: "education.university.schoolName",
        expectedValue: SCHOOL,
        expectedCurrentValue: "",
      });
      await vi.runAllTimersAsync();
      return pending;
    },
  };
}

describe("readonly search popup close reasons", () => {
  it("closes the popup with its bare close control and reports nothing left open", async () => {
    const { branch, run } = await failedSearch();
    const clicks = addForbiddenControls(branch.layer);
    const result = await run();

    expect(result).toMatchObject({
      status: "failed",
      reason: "search_results_not_found",
    });
    expect(result).not.toHaveProperty("surfaceLeftOpen");
    expect(result).not.toHaveProperty("surfaceLeftOpenReason");
    expect(
      fixture!.events.filter((event) => event.type === "close"),
    ).toHaveLength(1);
    expect(Object.fromEntries(clicks)).toEqual({});
  }, 30_000);

  it("reports close_not_confirmed when the close click leaves the popup open", async () => {
    const { branch, run } = await failedSearch();
    // The control is safe to click, but clicking it no longer hides the layer.
    branch.closeButton.removeAttribute("onclick");
    const closeClicks = vi.fn();
    branch.closeButton.addEventListener("click", closeClicks);
    const clicks = addForbiddenControls(branch.layer);
    const result = await run();

    expect(result).toMatchObject({
      status: "failed",
      reason: "search_results_not_found",
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "close_not_confirmed",
    });
    expect(closeClicks).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(clicks)).toEqual({});
  }, 30_000);

  it("reports no_safe_close_control and clicks no save or submit control", async () => {
    const { branch, run } = await failedSearch();
    branch.closeButton.remove();
    const clicks = addForbiddenControls(branch.layer);
    const result = await run();

    expect(result).toMatchObject({
      status: "failed",
      reason: "search_results_not_found",
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "no_safe_close_control",
    });
    expect(
      fixture!.events.filter((event) => event.type === "close"),
    ).toHaveLength(0);
    expect(Object.fromEntries(clicks)).toEqual({});
  }, 30_000);

  it("does not treat a close control mixed with a forbidden label as safe", async () => {
    const { branch, run } = await failedSearch();
    branch.closeButton.textContent = "저장 후 닫기";
    const clicks = addForbiddenControls(branch.layer);
    const result = await run();

    expect(result).toMatchObject({
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "no_safe_close_control",
    });
    expect(
      fixture!.events.filter((event) => event.type === "close"),
    ).toHaveLength(0);
    expect(Object.fromEntries(clicks)).toEqual({});
  }, 30_000);
});

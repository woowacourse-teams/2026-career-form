import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  reviewDiagnosticContexts,
  useReviewDiagnostics,
} from "./use-review-diagnostics";
import type { Stage } from "./workflow-model";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fixture() {
  document.body.innerHTML =
    '<section><h3>PRIVATE_SECTION</h3><div data-repeater-item><label>PRIVATE_LABEL<input name="private0" /></label></div><div data-repeater-item><label>PRIVATE_LABEL<input name="private1" /></label></div></section>';
  const snapshot = collectFieldsSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((row) => row.fields),
  ]);
  const items: ReviewPlanItem[] = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    fieldLabel: "PRIVATE_LABEL",
    currentValue: "PRIVATE_CURRENT",
    previewValue: "PRIVATE_PREVIEW",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: false,
    reason: "PRIVATE_REASON",
    genericGrade: "BLOCKED",
    genericReasonCode: "UNLINKED",
  }));
  const sections = [
    { sectionId: "gs1", category: "careers" },
    { sectionId: "gs2", category: "education" },
  ];
  return { snapshot, items, sections };
}

describe("useReviewDiagnostics", () => {
  it("preserves classified category for unmapped fields and row indices", () => {
    const { snapshot, items, sections } = fixture();
    expect(items).toHaveLength(2);
    const contexts = reviewDiagnosticContexts(snapshot, document, sections);
    expect(
      items.map((item) => contexts.get(item.candidateId)?.sectionCategory),
    ).toEqual(["careers", "education"]);
    expect(
      items.map((item) => contexts.get(item.candidateId)?.repeatRowIndex),
    ).toEqual([0, 1]);
  });

  it("logs once per review entry, not on item rerender or StrictMode replay", () => {
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { snapshot, items, sections } = fixture();
    const { result, rerender } = renderHook(
      ({ stage, reviewItems }) =>
        useReviewDiagnostics(stage, "generic", reviewItems, snapshot, document),
      {
        initialProps: { stage: "analyzing" as Stage, reviewItems: items },
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      },
    );
    act(() => result.current(new Map(), sections));
    expect(info).not.toHaveBeenCalled();
    rerender({ stage: "review", reviewItems: items });
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]![0])).not.toContain("PRIVATE");
    rerender({ stage: "review", reviewItems: [...items] });
    expect(info).toHaveBeenCalledTimes(1);
    rerender({ stage: "analyzing", reviewItems: items });
    rerender({ stage: "review", reviewItems: items });
    expect(info).toHaveBeenCalledTimes(2);
  });

  it.each(["off", "non-generic"])("does not log for %s workflow", (mode) => {
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", mode === "off" ? "0" : "1");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { snapshot, items } = fixture();
    renderHook(() =>
      useReviewDiagnostics(
        "review",
        mode === "off" ? "generic" : "static",
        items,
        snapshot,
        document,
      ),
    );
    expect(info).not.toHaveBeenCalled();
  });
});

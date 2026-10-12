import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runGenericCatalogQa,
  type GenericCatalogQaMode,
} from "./catalog-qa.test-fixtures";

describe("generic catalog execution", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
  async function run(mode: GenericCatalogQaMode) {
    const pending = runGenericCatalogQa(document, mode);
    // Time itself is tested: production requires 500ms of retained effects.
    await vi.runAllTimersAsync();
    return pending;
  }
  it.each(["school", "certificate", "exam"] as const)(
    "selects %s by one canonical query and retains only the observed label/code",
    async (mode) => {
      const qa = await run(mode);
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
        selectedValue: "Site QA",
        catalogSelection: { evidence: { label: "Site QA" } },
      });
      expect(qa.actions).toEqual({ open: 1, search: 1, select: 1 });
      expect(qa.target.value).toBe("Site QA");
      expect(qa.code.value).toBe("QA-1");
      expect(qa.peer.value).toBe("protected");
      expect(JSON.stringify(qa.requests)).not.toMatch(
        /Canonical QA|Site QA|Another alias|Campus QA|catalogMatch|searchIdentity/,
      );
      if (qa.result.status !== "selected") throw new Error("selection absent");
      expect(qa.result.catalogSelection!.verify()).toBe(true);
      qa.target.value = "Another alias";
      expect(qa.result.catalogSelection!.verify()).toBe(false);
      qa.target.value = "Site QA";
      qa.code.value = "different-code";
      expect(qa.result.catalogSelection!.verify()).toBe(false);
    },
  );
  it.each([
    "duplicate",
    "missing-detail",
    "malformed",
    "wrong-kind",
    "stale",
    "cancel",
    "user-edit",
  ] as const)("fails closed for %s", async (mode) => {
    const qa = await run(mode);
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.select).toBe(0);
    if (mode === "malformed" || mode === "wrong-kind")
      expect(qa.actions.open).toBe(0);
    if (mode === "user-edit") expect(qa.target.value).toBe("User edit");
  });
  it("rechecks the exact code after the final asynchronous profile approval", async () => {
    const qa = await run("post-edit");
    expect(qa.result).toMatchObject({
      status: "failed",
      reason: "selection_postcondition_failed",
    });
    expect(qa.code.value).toBe("POST-EDIT");
  });
  it("reports protected sibling mutation rather than accepting the selection", async () => {
    const qa = await run("protected-peer");
    expect(qa.result).toMatchObject({
      status: "failed",
      reason: "selection_postcondition_failed",
    });
    expect(qa.actions.select).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeApprovedWrites } from "../write/native-executor";
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
  it("retains the selected label and code after a later approved sibling write", async () => {
    const qa = await run("approved-follow-up");
    expect(qa.result.status).toBe("selected");
    if (qa.result.status !== "selected" || !qa.result.catalogSelection)
      throw new Error("selection absent");
    const fields = qa.snapshot.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ]);
    const candidate = fields.find((field) => {
      const lookup = qa.snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "ready" && lookup.handle.elements.includes(qa.peer)
      );
    });
    if (!candidate) throw new Error("follow-up field absent");

    const [result] = executeApprovedWrites({
      registry: qa.snapshot.registry,
      approvedCandidateIds: new Set([candidate.candidateId]),
      items: [
        {
          candidateId: candidate.candidateId,
          fieldLabel: "후속 합성 항목",
          currentValue: "",
          profileValue: "SYN-APPROVED",
          previewValue: "SYN-APPROVED",
          status: "available",
          selected: true,
          disabled: false,
          revealed: true,
          reason: "",
          analysis: {
            candidateId: candidate.candidateId,
            matchType: "MATCH",
            mappingStatus: "LLM_SUGGESTED",
            autofillPolicy: "CONDITIONAL",
            interactionStatus: "READY",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "languages.languageTest.registrationNo",
            },
            writePlan: { command: "SET_TEXT" },
          },
        },
      ],
    });

    expect(result?.status).toBe("written");
    expect(qa.peer.value).toBe("SYN-APPROVED");
    expect(qa.result.catalogSelection.verify()).toBe(true);
  });
  it("rejects a later edit of a code observed only after selection", async () => {
    const qa = await run("undeclared-code");
    if (qa.result.status !== "selected" || !qa.result.catalogSelection)
      throw new Error("selection absent");

    qa.code.value = "LATER-CODE";

    expect(qa.result.catalogSelection.verify()).toBe(false);
  });
  it("waits for the unique registration control before committing a catalog selection", async () => {
    const qa = await run("confirm-selection");

    expect(
      qa.result,
      JSON.stringify({
        result: qa.result,
        actions: qa.actions,
        confirm: qa.confirmActions,
      }),
    ).toMatchObject({
      status: "selected",
      selectedValue: "Site QA",
    });
    expect(qa.actions.select).toBe(1);
    expect(qa.confirmActions.confirm).toBe(1);
    expect(qa.target.value).toBe("Site QA");
    expect(qa.code.value).toBe("QA-1");
    expect(qa.peer.value).toBe("protected");
  });
  it.each([
    "legacy-confirm-selection",
    "ambiguous-confirm-selection",
    "submit-confirm-selection",
  ] as const)(
    "does not confirm an unsafe selection flow for %s",
    async (mode) => {
      const qa = await run(mode);

      expect(qa.result.status).not.toBe("selected");
      expect(qa.confirmActions.confirm).toBe(0);
      expect(qa.target.value).toBe("");
      expect(qa.code.value).toBe("");
      expect(qa.peer.value).toBe("protected");
      if (mode === "submit-confirm-selection")
        expect(qa.confirmActions.submit).toBe(0);
    },
  );
  it("retains a name-only selection and detects a later target edit", async () => {
    const qa = await run("name-only-selection");

    expect(qa.result).toMatchObject({
      status: "selected",
      selectedValue: "Site QA",
    });
    expect(qa.code.isConnected).toBe(false);
    if (qa.result.status !== "selected" || !qa.result.catalogSelection)
      throw new Error("selection absent");
    expect(qa.result.catalogSelection.verify()).toBe(true);

    qa.target.value = "Changed after selection";

    expect(qa.result.catalogSelection.verify()).toBe(false);
  });
  it("confirms a name-only javascript result link through the unique registration button", async () => {
    const qa = await run("generic-confirm-link");

    expect(qa.result.status).toBe("selected");
    expect(qa.actions.select).toBe(1);
    expect(qa.confirmActions.confirm).toBe(1);
    expect(qa.target.value).toBe("Site QA");
    expect(qa.code.isConnected).toBe(false);
    expect(qa.peer.value).toBe("protected");
  });
  it("confirms a filtered result while retaining the original matching link and list nodes", async () => {
    const qa = await run("generic-confirm-link-filtered");

    expect(
      qa.result.status,
      JSON.stringify({
        result: qa.result,
        actions: qa.actions,
        confirm: qa.confirmActions,
      }),
    ).toBe("selected");
    expect(qa.actions).toEqual({ open: 1, search: 1, select: 1 });
    expect(qa.confirmActions.confirm).toBe(1);
    expect(qa.target.value).toBe("Site QA");
    expect(qa.code.isConnected).toBe(false);
    expect(qa.peer.value).toBe("protected");
  });
  it("keeps filtered result replacement unsupported without generic recovery", async () => {
    const qa = await run("legacy-confirm-link-filtered");

    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.select).toBe(0);
    expect(qa.confirmActions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
    expect(qa.peer.value).toBe("protected");
  });
  it.each(["legacy-confirm-link", "unsafe-confirm-link"] as const)(
    "does not activate a result link for %s",
    async (mode) => {
      const qa = await run(mode);

      expect(qa.result.status).not.toBe("selected");
      expect(qa.actions.select).toBe(0);
      expect(qa.confirmActions.confirm).toBe(0);
      expect(qa.target.value).toBe("");
      expect(qa.peer.value).toBe("protected");
    },
  );
  it("uses the owned direct-entry form after every approved query returns zero", async () => {
    const qa = await run("empty-direct");

    expect(qa.result).toMatchObject({
      status: "selected",
      selectedValue: "Canonical QA",
    });
    expect(qa.directActions).toEqual({ open: 1, confirm: 1 });
    expect(qa.target.value).toBe("Canonical QA");
    expect(qa.code.value).toBe("MANUAL-1");
    expect(qa.peer.value).toBe("protected");
  });
  it.each(["legacy-direct", "nonempty-direct", "duplicate-direct"] as const)(
    "does not activate direct entry for %s",
    async (mode) => {
      const qa = await run(mode);

      expect(qa.result.status).not.toBe("selected");
      expect(qa.directActions).toEqual({ open: 0, confirm: 0 });
      expect(qa.target.value).toBe("");
    },
  );
  it("never forces a write into a readonly direct-entry input", async () => {
    const qa = await run("readonly-direct");

    expect(qa.result.status).not.toBe("selected");
    expect(qa.directActions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
    expect(qa.peer.value).toBe("protected");
  });
});

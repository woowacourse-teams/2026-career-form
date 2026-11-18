import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeApprovedWrites } from "../write/native-executor";
import {
  runGenericCatalogQa,
  type GenericCatalogQaMode,
} from "./catalog-qa.test-fixtures";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ApprovedCatalogMatch } from "../profile/catalog-match";
import { executeReadonlySearch } from "./readonly-search-executor";

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

describe("generic school search whose results expose only the name", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
  const catalogMatch: ApprovedCatalogMatch = {
    kind: "university",
    query: "Canonical QA",
    labels: ["Site QA", "Another alias"],
    requiredDetail: "Campus QA",
  };
  /**
   * A same-document layer: one select unlocks the disabled query, an icon
   * search button unlocks on typing, the query becomes a chip after submit,
   * plain result links render later, and a disabled confirm button follows.
   */
  async function nameOnlyLayer(
    resultMarkup: string,
    genericPopupRecovery = true,
  ) {
    document.body.innerHTML = `
      <section><h3>학력</h3><div data-repeater-item>
        <label>학교명<input placeholder="학교명" readonly data-target></label>
        <button type="button" aria-label="검색" data-open></button>
      </div></section>
      <div data-app><div id="layer" style="display:none; position:fixed">
        <div><div>학교 검색</div></div>
        <select data-region><option value="">지역 선택</option>
          <option value="11">서울특별시</option><option value="41">경기도</option></select>
        <div data-query-box><input type="text" placeholder="학교명을 검색하세요" disabled data-query>
        <button type="button" aria-label="검색" disabled data-search><svg></svg></button></div>
        <ul></ul>
        <div><button type="button" data-direct>직접입력</button></div>
        <button type="button" disabled data-confirm>확인</button>
      </div></div>`;
    const layer = document.querySelector<HTMLElement>("#layer")!;
    const target = document.querySelector<HTMLInputElement>("[data-target]")!;
    const region = layer.querySelector<HTMLSelectElement>("[data-region]")!;
    const query = layer.querySelector<HTMLInputElement>("[data-query]")!;
    const search = layer.querySelector<HTMLButtonElement>("[data-search]")!;
    const results = layer.querySelector<HTMLElement>("ul")!;
    const confirm = layer.querySelector<HTMLButtonElement>("[data-confirm]")!;
    const actions = { select: 0, confirm: 0, direct: 0 };
    let chosen = "";
    layer
      .querySelector("[data-direct]")!
      .addEventListener("click", () => actions.direct++);
    document.querySelector("[data-open]")!.addEventListener("click", () => {
      layer.style.display = "block";
    });
    region.addEventListener("change", () => {
      query.disabled = region.value === "";
    });
    query.addEventListener("input", () => {
      search.disabled = query.value === "";
    });
    search.addEventListener("click", () => {
      const chip = document.createElement("span");
      chip.textContent = query.value;
      query.replaceWith(chip);
      setTimeout(() => {
        results.innerHTML = resultMarkup;
        results.querySelectorAll("a").forEach((link) =>
          link.addEventListener("click", (event) => {
            event.preventDefault();
            actions.select++;
            chosen = link.textContent ?? "";
            confirm.disabled = false;
          }),
        );
      }, 150);
    });
    confirm.addEventListener("click", () => {
      actions.confirm++;
      target.value = chosen;
      layer.style.display = "none";
    });
    const snapshot = collectFieldsSnapshot(document);
    const targetId = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ])
      .find((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return (
          (lookup.status === "ready" || lookup.status === "blocked") &&
          lookup.handle.elements[0] === target
        );
      })!.candidateId;
    const pending = executeReadonlySearch({
      document,
      registry: snapshot.registry,
      targetCandidateId: targetId,
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: catalogMatch.query,
      expectedCurrentValue: "",
      catalogMatch,
      decisionProvider: async (request) => ({
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: request.decisions.map((decision) => ({
          decisionId: decision.decisionId,
          role: decision.role,
          selection: "SELECTED",
          candidateId: decision.candidates[0]!.candidateId,
        })),
      }),
      contextValues: [
        { key: "education.university.schoolRegion", value: "region:seoul" },
      ],
      ...(genericPopupRecovery ? { genericPopupRecovery: true } : {}),
    });
    // Time itself is tested: results render late and production requires
    // 500ms of retained effects.
    await vi.runAllTimersAsync();
    return { result: await pending, target, actions };
  }
  const link = (name: string, extra = "") =>
    `<li><a href="javascript:;" ${extra}>${name}</a></li>`;

  it("selects the one result named as an approved label and confirms it", async () => {
    const qa = await nameOnlyLayer(link("Other school") + link("Site QA"));
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
      selectedValue: "Site QA",
      catalogSelection: { evidence: { label: "Site QA" }, labelOnly: true },
    });
    expect(qa.actions).toEqual({ select: 1, confirm: 1, direct: 0 });
    expect(qa.target.value).toBe("Site QA");
    if (qa.result.status !== "selected") throw new Error("selection absent");
    expect(qa.result.catalogSelection!.evidence.detail).toBeUndefined();
    expect(qa.result.catalogSelection!.verify()).toBe(true);
    qa.target.value = "Other school";
    expect(qa.result.catalogSelection!.verify()).toBe(false);
  });

  it("does not select between two results with the approved label", async () => {
    const qa = await nameOnlyLayer(link("Site QA") + link("Site QA"));
    expect(qa.result).toMatchObject({
      status: "failed",
      reason: "multiple_matching_results",
    });
    expect(qa.actions.select).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("keeps requiring the campus once a result in the list exposes one", async () => {
    const qa = await nameOnlyLayer(
      link("Site QA") +
        link("Other school", 'aria-describedby="other-campus"') +
        '<li><span id="other-campus">Campus QA</span></li>',
    );
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.select).toBe(0);
    expect(qa.target.value).toBe("");
  });
});

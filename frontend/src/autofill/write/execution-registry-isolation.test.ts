import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setup(
  fields: {
    id: string;
    mapping: "LLM_SUGGESTED" | "ADAPTER_VERIFIED";
    owner?: "native" | "legacy";
  }[],
) {
  const registry = new CandidateRegistry();
  const items = fields.map(({ id, mapping, owner }): ReviewPlanItem => {
    const label = document.createElement("label");
    label.textContent = `Synthetic ${id}`;
    const input = document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = "text";
    label.append(input);
    document.body.append(label);
    registry.registerField({
      kind: "field",
      candidateId: id,
      ...(owner ? { owner } : {}),
      sectionId: "notes",
      elements: [input],
      optionElements: new Map(),
      signature: createStructuralSignature([input]),
      candidate: {
        candidateId: id,
        element: "input",
        control: "text",
        visibility: "visible",
      },
    });
    const profileFieldKey = `synthetic.notes.${id}`;
    return {
      candidateId: id,
      fieldLabel: `Synthetic ${id}`,
      currentValue: "",
      profileValue: `synthetic-${id}`,
      previewValue: `synthetic-${id}`,
      profileFieldKey,
      selected: true,
      disabled: false,
      status: "available",
      revealed: false,
      reason: "",
      analysis: {
        candidateId: id,
        mappingStatus: mapping,
        matchType: "MATCH",
        autofillPolicy: "ALLOWED",
        interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey },
        writePlan: { command: "SET_TEXT" },
      },
    };
  });
  return { registry, items, approvedCandidateIds: new Set(fields.map(({ id }) => id)) };
}

describe("in-place recovery ownership", () => {
  it.each([
    { mapping: "ADAPTER_VERIFIED" as const, owner: "native" as const },
    { mapping: "ADAPTER_VERIFIED" as const, owner: "legacy" as const },
    { mapping: "LLM_SUGGESTED" as const, owner: "legacy" as const },
  ])("does not rebind a replaced $mapping / $owner entry", async (field) => {
    const fixture = setup([{ id: "static-note", ...field }]);
    const rebind = vi.spyOn(fixture.registry, "revalidateField");
    const reported: CandidateRegistry[] = [];
    const original = document.querySelector<HTMLInputElement>("#static-note")!;
    const replacement = original.cloneNode(true) as HTMLInputElement;
    const results = await executeApprovedWritesAfterPageSettles({
      ...fixture,
      document,
      beforeWrite: async () => { original.replaceWith(replacement); },
      onResult: (_item, _result, registry) => { reported.push(registry); },
    });
    expect(results[0].status).toBe("skipped");
    expect(rebind).not.toHaveBeenCalled();
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.every((registry) => registry === fixture.registry)).toBe(true);
    expect(fixture.registry.lookupField("static-note").status).toBe("stale");
    expect(replacement.value).toBe("");
  });

  it("writes an unchanged adapter control using exactly its original registry", async () => {
    const fixture = setup([{ id: "adapter-note", mapping: "ADAPTER_VERIFIED" }]);
    const rebind = vi.spyOn(fixture.registry, "revalidateField");
    const reported: CandidateRegistry[] = [];
    const results = await executeApprovedWritesAfterPageSettles({
      ...fixture,
      document,
      onResult: (_item, _result, registry) => { reported.push(registry); },
    });
    expect(results[0]).toMatchObject({ status: "written" });
    expect(document.querySelector<HTMLInputElement>("#adapter-note")!.value)
      .toBe("synthetic-adapter-note");
    expect(reported.every((registry) => registry === fixture.registry)).toBe(true);
    expect(rebind).not.toHaveBeenCalled();
  });

  it("recovers generic entries in place without changing adapter routing in a mixed batch", async () => {
    const fixture = setup([
      { id: "first", mapping: "LLM_SUGGESTED" },
      { id: "later", mapping: "LLM_SUGGESTED" },
      { id: "adapter", mapping: "ADAPTER_VERIFIED" },
    ]);
    const originalLater = document.querySelector<HTMLInputElement>("#later")!;
    document.querySelector("#first")!.addEventListener("input", () => {
      originalLater.replaceWith(originalLater.cloneNode(true));
    });
    const sourceRebind = vi.spyOn(fixture.registry, "revalidateField");
    const reported = new Map<string, CandidateRegistry>();
    const results = await executeApprovedWritesAfterPageSettles({
      ...fixture,
      document,
      onResult: (item, _result, registry) => { reported.set(item.candidateId, registry); },
    });
    expect(results).toEqual([
      expect.objectContaining({ status: "written" }),
      expect.objectContaining({ status: "written" }),
      expect.objectContaining({ status: "written" }),
    ]);
    expect(sourceRebind.mock.calls.map(([id]) => id)).toEqual(["first", "later"]);
    expect(reported.get("adapter")).toBe(fixture.registry);
    expect(reported.get("later")).toBe(fixture.registry);
    expect(fixture.registry.lookupField("later").status).toBe("ready");
    const current = reported.get("later")!.lookupField("later");
    expect(current.status).toBe("ready");
    expect("handle" in current && current.handle.elements[0])
      .toBe(document.querySelector("#later"));
    expect(document.querySelector<HTMLInputElement>("#later")!.value).toBe("synthetic-later");
    expect(document.querySelector<HTMLInputElement>("#adapter")!.value).toBe("synthetic-adapter");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { CandidateRegistry, createStructuralSignature } from "./candidate-registry";

afterEach(() => document.body.replaceChildren());

function setup(legacy = false) {
  document.body.innerHTML = `<section><div class="rows">
    <div><label>Note<input name="note" type="text"></label>
      <label>Kind<select name="kind"><option value="a">A</option><option value="b">B</option></select></label></div>
    <div><label>Note<input name="note" type="text"></label>
      <label>Kind<select name="kind"><option value="a">A</option><option value="b">B</option></select></label></div>
  </div></section>`;
  const rows = Array.from(document.querySelector(".rows")!.children);
  const controls = rows.map((row) => row.querySelector("input")!);
  const original = new CandidateRegistry();
  controls.forEach((input, itemIndex) => {
    const candidateId = `field-${itemIndex}`;
    original.registerField({
      kind: "field",
      ...(legacy ? { owner: "legacy" as const } : {}),
      candidateId,
      sectionId: "notes",
      itemId: `row-${itemIndex}`,
      itemGroupId: "notes-group",
      itemIndex,
      isCurrentContext: () => rows[itemIndex].contains(input),
      elements: [input],
      optionElements: new Map(),
      signature: createStructuralSignature([input]),
      candidate: {
        candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
      },
    });
  });
  original.setFieldItemCount("notes", rows.length, "notes-group");
  original.setFieldItemElements("notes", rows, "notes-group");
  const execution = original;
  execution.captureReplacementState();
  const replacement = controls[0].cloneNode(true) as HTMLInputElement;
  return { original, execution, rows, controls, replacement };
}

describe("strict native replacement identity", () => {
  it("rebinds only the original repeat row in the same registry", () => {
    const { original, execution, controls, replacement } = setup();
    controls[0].replaceWith(replacement);
    expect(execution.revalidateField("field-0", true)).toBe(true);
    const current = execution.lookupField("field-0");
    expect(current.status).toBe("ready");
    expect("handle" in current && current.handle.elements[0]).toBe(replacement);
    expect(original).toBe(execution);
    expect(original.lookupField("field-0").status).toBe("ready");
    expect(controls[0].isConnected).toBe(false);
    expect(controls[1].value).toBe("");
  });

  it.each([
    "row-order", "row-count", "row-replaced", "label", "kind",
    "name", "value", "ambiguous", "group", "row-kind",
  ] as const)(
    "blocks %s changes without retargeting an approved row",
    (change) => {
      const { execution, rows, controls, replacement } = setup();
      controls[0].replaceWith(replacement);
      if (change === "row-order") rows[1].after(rows[0]);
      if (change === "row-count") rows[1].after(rows[1].cloneNode(true));
      if (change === "row-replaced") rows[0].replaceWith(rows[0].cloneNode(true));
      if (change === "label") replacement.parentElement!.prepend("Different ");
      if (change === "kind") replacement.type = "number";
      if (change === "name") replacement.name = "different";
      if (change === "value") replacement.value = "foreign";
      if (change === "ambiguous") replacement.after(replacement.cloneNode(true));
      if (change === "group") rows[0].setAttribute("data-item-group-id", "different");
      if (change === "row-kind") rows[0].querySelector("select")!.value = "b";
      expect(execution.revalidateField("field-0", true)).toBe(false);
      expect(execution.lookupField("field-0").status).toBe("stale");
      expect(controls[1].value).toBe("");
    },
  );

  it("does not replace a target without explicit replacement permission", () => {
    const { execution, controls, replacement } = setup();
    controls[0].replaceWith(replacement);
    expect(execution.revalidateField("field-0", false)).toBe(false);
  });

  it("never rebinds a legacy-owned entry even when its replacement is unique", () => {
    const { original, execution, controls, replacement } = setup(true);
    const sibling = execution.lookupField("field-1");
    controls[0].replaceWith(replacement);
    expect(execution.revalidateField("field-0", true)).toBe(false);
    expect(original.lookupField("field-0").status).toBe("stale");
    expect(execution.lookupField("field-1")).toEqual(sibling);
    expect(replacement.value).toBe("");
  });

  it("keeps row identity checks active after a successful recovery", () => {
    const { execution, rows, controls, replacement } = setup();
    controls[0].replaceWith(replacement);
    expect(execution.revalidateField("field-0", true)).toBe(true);
    rows[1].after(rows[0]);
    expect(execution.lookupField("field-0").status).toBe("stale");
  });
});

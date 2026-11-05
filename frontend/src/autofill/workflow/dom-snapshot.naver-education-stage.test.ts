import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDocumentCompany } from "../adapters/company";
import { collectFieldsSnapshot } from "../dom/collect";

const fixturePath = join(
  process.cwd(),
  "fixtures/dom-snapshots/naver-education-stage/sanitized.html",
);

function collectEducationRow() {
  const snapshot = collectFieldsSnapshot(document);
  const rows = snapshot.request.sections.flatMap(
    (section) => section.items ?? [],
  );
  expect(resolveDocumentCompany(document)).toBe("generic");
  expect(rows).toHaveLength(1);
  const fields = rows[0]!.fields;
  const fieldFor = (element: Element) =>
    fields.find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        "handle" in lookup &&
        lookup.handle.elements.some((candidate) => candidate === element)
      );
    });
  const row = document.querySelector(".rcform_copy")!;
  const stage = row.querySelector(".type01 select.sch_switch")!;
  const highSchool = row.querySelector(".type01 input")!;
  // Native control order is preserved after excluding type=hidden metadata.
  // Original sibling paths change when those metadata nodes are removed.
  const minor = row.querySelectorAll("input,select,textarea")[16]!;
  expect(stage).not.toBeNull();
  expect(highSchool).not.toBeNull();
  expect(minor).not.toBeNull();
  expect(minor.closest(".type02")).not.toBeNull();
  expect(fieldFor(stage)?.visibility).toBe("visible");
  expect(fieldFor(highSchool)?.visibility).toBe("visible");
  expect(fieldFor(minor)?.visibility).toBe("hidden");
  expect(
    fields.filter((field) => field.visibility === "visible").length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    fields.filter((field) => field.visibility === "hidden").length,
  ).toBeGreaterThanOrEqual(1);
  return { snapshot, fields };
}

afterEach(() => document.body.replaceChildren());

describe("NAVER education-stage sanitized row", () => {
  it("groups visible high-school and hidden other-stage controls in one row", () => {
    document.body.innerHTML = readFileSync(fixturePath, "utf8");
    const { snapshot, fields } = collectEducationRow();
    expect(snapshot.request.sections).toHaveLength(1);
    expect(snapshot.request.sections[0]!.fields).toHaveLength(0);
    expect(fields).toHaveLength(23);
    expect(
      fields.filter((field) => field.visibility === "visible"),
    ).toHaveLength(5);
    expect(
      fields.filter((field) => field.visibility === "hidden"),
    ).toHaveLength(18);
  });

  it("rejects the same load contract when hidden state is removed in memory", () => {
    document.body.innerHTML = readFileSync(fixturePath, "utf8");
    for (const element of document.querySelectorAll("[hidden]"))
      element.removeAttribute("hidden");
    expect(collectEducationRow).toThrow();
  });
});

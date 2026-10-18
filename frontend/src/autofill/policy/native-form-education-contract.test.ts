import { expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { validNativeForm } from "./native-form-contract";
it.each([
  "depth",
  "cross-code",
  "cross-peer",
  "capability",
  "unknown-operation",
])("rejects an unsafe nested/GPA policy: %s", (mutation) => {
  const form = structuredClone(
    seed.executionPolicy.browserPolicy.nativeForm,
  ) as any;
  const s = form.sections.find((s: any) => s.id === "hplace-mrs2-college");
  const major = s.fields.find((f: any) => f.name.endsWith(".major0.majorName"));
  if (mutation === "depth")
    major.rawName = "college[{index}].collegeMajor[0].child[0].majorName";
  if (mutation === "cross-code")
    major.search.codeName = "graduateSchool[{index}].collegeMajor[0].majorCode";
  if (mutation === "cross-peer")
    s.fields.find((f: any) => f.name.endsWith(".score")).gpa.peer =
      "hplace.mrs2.graduateSchool.perfectScore";
  if (mutation === "capability")
    form.capabilities = form.capabilities.filter(
      (c: string) => c !== "NESTED_MAJOR_ROWS",
    );
  if (mutation === "unknown-operation") s.nested.action.operation = "REMOVE";
  expect(validNativeForm(form)).toBe(false);
});
it("validates the extended schema without a DOM in the service worker", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document")!;
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });
    expect(validNativeForm(seed.executionPolicy.browserPolicy.nativeForm)).toBe(
      true,
    );
  } finally {
    Object.defineProperty(globalThis, "document", descriptor);
  }
});

it("rejects depth three even when a matching search code is forged with it", () => {
  const form = structuredClone(
    seed.executionPolicy.browserPolicy.nativeForm,
  ) as any;
  const section = form.sections.find(
    (s: any) => s.id === "hplace-mrs2-college",
  );
  const field = section.fields.find((f: any) =>
    f.name.endsWith(".major0.majorName"),
  );
  field.rawName = "college[{index}].collegeMajor[0].child[0].majorName";
  field.search.codeName = "college[{index}].collegeMajor[0].child[0].majorCode";
  expect(validNativeForm(form)).toBe(false);
});

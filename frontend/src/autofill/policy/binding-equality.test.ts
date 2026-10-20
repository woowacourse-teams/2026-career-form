import { describe, expect, it } from "vitest";
import { sameValueBinding } from "./binding-equality";

describe("sameValueBinding", () => {
  it("ignores object key order at every depth", () => {
    expect(
      sameValueBinding(
        { type: "LOOKUP", profileFieldKey: "k", optionMap: { a: "1", b: "2" } },
        { optionMap: { b: "2", a: "1" }, profileFieldKey: "k", type: "LOOKUP" },
      ),
    ).toBe(true);
  });
  it.each([
    ["a changed value", { a: "1", b: "3" }],
    ["a missing key", { a: "1" }],
    ["an extra key", { a: "1", b: "2", c: "3" }],
    ["an undefined extra key", { a: "1", b: "2", c: undefined }],
    ["a null value", { a: "1", b: null }],
    ["a number for a string", { a: "1", b: 2 }],
  ])("rejects %s", (_name, optionMap) => {
    expect(
      sameValueBinding(
        { type: "LOOKUP", optionMap: { a: "1", b: "2" } },
        { type: "LOOKUP", optionMap },
      ),
    ).toBe(false);
  });
  it("compares arrays in order and never equates arrays with objects", () => {
    expect(sameValueBinding({ v: [1, 2] }, { v: [1, 2] })).toBe(true);
    expect(sameValueBinding({ v: [1, 2] }, { v: [2, 1] })).toBe(false);
    expect(sameValueBinding({ v: [1] }, { v: { 0: 1 } })).toBe(false);
  });
  it("treats an absent binding as equal only to another absent binding", () => {
    expect(sameValueBinding(undefined, undefined)).toBe(true);
    expect(sameValueBinding(undefined, { type: "DIRECT" })).toBe(false);
    expect(sameValueBinding(null, undefined)).toBe(false);
  });
});

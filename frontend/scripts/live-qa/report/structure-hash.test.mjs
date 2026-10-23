// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildGradeInput } from "./grade-input.mjs";
import { canonicalJson, structureHash } from "./structure-hash.mjs";

const control = (i, name, extra = {}) => ({
  i,
  tag: "input",
  type: "text",
  name,
  id: "",
  label: name,
  section: "S",
  hasValue: false,
  fp: "",
  key: `input|text|${name}|||S#1`,
  ...extra,
});
const frames = (url, controls) => [{ frame: url, main: true, url, controls }];
const input = (label, url, controls, add = []) =>
  buildGradeInput(label, frames(url, controls), add);

describe("canonicalJson", () => {
  it("sorts object keys and keeps array order", () => {
    expect(canonicalJson({ b: [2, { z: 1, a: null }], a: "x" })).toBe(
      '{"a":"x","b":[2,{"a":null,"z":1}]}',
    );
  });
});

describe("structureHash", () => {
  it("is a sha256 hex that ignores label, url and the control index", () => {
    const one = structureHash(
      input("hp-a-s1", "https://x.example/a", [
        control(0, "a"),
        control(1, "b"),
      ]),
    );
    const other = structureHash(
      input("hp-b-s1", "https://x.example/b", [
        control(5, "a"),
        control(9, "b"),
      ]),
    );
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(other).toBe(one);
  });

  it("changes with control order, attributes and add buttons", () => {
    const base = input("gr-a", "u", [control(0, "a"), control(1, "b")]);
    const reordered = input("gr-a", "u", [control(0, "b"), control(1, "a")]);
    const required = input("gr-a", "u", [
      control(0, "a", { required: true }),
      control(1, "b"),
    ]);
    const buttons = input(
      "gr-a",
      "u",
      [control(0, "a"), control(1, "b")],
      ["추가"],
    );
    const hashes = [base, reordered, required, buttons].map(structureHash);
    expect(new Set(hashes).size).toBe(4);
  });

  it("ignores hidden companion controls so older gradings still match", () => {
    const base = {
      controls: [{ i: 0, type: "text", name: "licenseCd", label: "자격" }],
      addButtons: [],
    };
    const withCompanion = {
      controls: [
        ...base.controls,
        {
          i: 1,
          type: "hidden",
          name: "licenseName",
          hidden: true,
          companionOf: 0,
        },
      ],
      addButtons: [],
    };
    expect(structureHash(withCompanion)).toBe(structureHash(base));
  });

  it("does not depend on key order inside a control", () => {
    const a = structureHash({
      controls: [{ i: 0, type: "text", name: "a" }],
      addButtons: [],
    });
    const b = structureHash({
      controls: [{ name: "a", type: "text", i: 3 }],
    });
    expect(a).toBe(b);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  extensionIdFor,
  statePaths,
  validateProfileEnvelope,
} from "./browser.mjs";

describe("browser helpers", () => {
  it("compares stored profiles regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ y: 1, x: 2 }], c: 0 } })).toBe(
      canonicalJson({ a: { c: 0, d: [{ x: 2, y: 1 }] }, b: 1 }),
    );
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("accepts only a schemaVersion 1 export envelope", () => {
    expect(() =>
      validateProfileEnvelope({ schemaVersion: 1, profile: {} }),
    ).not.toThrow();
    for (const bad of [
      null,
      {},
      { schemaVersion: 2, profile: {} },
      { schemaVersion: 1, profile: null },
    ])
      expect(() => validateProfileEnvelope(bad)).toThrow(/schemaVersion 1/);
  });

  it("derives the unpacked extension id like Chrome", () => {
    expect(extensionIdFor("/x")).toMatch(/^[a-p]{32}$/);
    expect(extensionIdFor("/x")).toBe(extensionIdFor("/x"));
  });

  it("uses LIVE_QA_STATE_DIR when set and keeps reports beside the profile", () => {
    const p = statePaths({ LIVE_QA_STATE_DIR: "/tmp/qa-state" });
    expect(p).toMatchObject({
      root: "/tmp/qa-state",
      isolated: true,
      profile: "/tmp/qa-state/profile",
      extension: "/tmp/qa-state/extension",
      reports: "/tmp/qa-state/live-qa",
    });
  });
});

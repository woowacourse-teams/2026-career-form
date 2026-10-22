// @vitest-environment node
import { describe, expect, it } from "vitest";
import { callInPage, discardPage, framesCensus, savedData } from "./driver.mjs";

describe("callInPage", () => {
  it("passes several JSON arguments to a self-contained function", async () => {
    const target = { evaluate: async (expression) => (0, eval)(expression) };
    const fn = (prior, options) => ({
      prior,
      salt: options.salt,
      none: options.known,
    });
    await expect(
      callInPage(target, fn, { a: 1 }, { salt: "s" }),
    ).resolves.toEqual({
      prior: { a: 1 },
      salt: "s",
      none: undefined,
    });
    await expect(callInPage(target, (x) => x, undefined)).resolves.toBeNull();
  });
});

describe("framesCensus", () => {
  const frame = (url, calls) => ({
    url: () => url,
    evaluate: async (expression) => {
      calls.push(expression);
      return { url, title: "", controls: [{ i: 0, key: "k", fp: "f" }] };
    },
  });
  it("numbers controls across frames and gives same-URL frames no known values", async () => {
    const calls = [];
    const main = frame("https://x.example/a", calls);
    const page = {
      mainFrame: () => main,
      frames: () => [
        main,
        frame("https://x.example/q", calls),
        frame("https://x.example/q", calls),
      ],
    };
    const known = {
      main: ["f"],
      "https://x.example/q#1": ["f"],
      "https://x.example/q#2": ["f"],
    };
    const frames = await framesCensus(page, { known, salt: "s" });
    expect(frames.map((f) => [f.key, f.controls[0].i])).toEqual([
      ["main", 0],
      ["https://x.example/q#1", 1],
      ["https://x.example/q#2", 2],
    ]);
    expect(calls[0]).toContain('"known":["f"]');
    expect(calls[1]).toContain('"known":null');
    expect(calls[2]).toContain('"known":null');
  });
});

describe("discardPage", () => {
  it("fails closed when the new-document marker cannot be planted", async () => {
    let navigated = false;
    const page = {
      url: () => "https://x.example/ko/o/1/apply",
      on: () => {},
      off: () => {},
      evaluate: async () => {
        throw new Error("Execution context was destroyed");
      },
      goto: async () => {
        navigated = true;
      },
    };
    await expect(discardPage(page)).resolves.toEqual({
      how: "navigate",
      ok: false,
      code: "page-unresponsive",
    });
    expect(navigated).toBe(false);
  });
});

describe("savedData", () => {
  it("reports a non-Hplace page from one dry run without moving it", async () => {
    const dry = {
      text: 2,
      select: 0,
      radioGroups: 1,
      fields: ["email", "tel"],
    };
    const frame = {
      url: () => "https://x.example/ko/o/1/apply",
      evaluate: async (x) =>
        typeof x === "string"
          ? dry
          : x.toString().includes("serviceWorker")
            ? false
            : { formPresent: false },
    };
    const page = {
      ...frame,
      mainFrame: () => frame,
      frames: () => [frame],
      on: () => {},
      off: () => {},
      route: async () => {},
      unroute: async () => {},
      goto: async () => {
        throw new Error("must not navigate");
      },
    };
    await expect(savedData(page)).resolves.toMatchObject({
      how: "page",
      saved: true,
      text: 2,
      fields: ["email", "tel"],
    });
  });
});

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
  it("offsets companionOf along with the control numbers of later frames", async () => {
    const make = (url) => ({
      url: () => url,
      evaluate: async () => ({
        url,
        title: "",
        controls: [
          { i: 0, key: "a", fp: "" },
          { i: 1, key: "b", fp: "", hidden: true, companionOf: 0 },
        ],
      }),
    });
    const main = make("https://x.example/a");
    const page = {
      mainFrame: () => main,
      frames: () => [main, make("https://x.example/q")],
    };
    const frames = await framesCensus(page, { salt: "s" });
    expect(frames[1].controls.map((c) => [c.i, c.companionOf])).toEqual([
      [2, undefined],
      [3, 2],
    ]);
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
    // Login identity fields come back after any reset: they are reported
    // apart and do not make the form "saved".
    await expect(savedData(page)).resolves.toMatchObject({
      how: "page",
      saved: false,
      savedAny: true,
      text: 2,
      fields: ["email", "tel"],
      accountFields: ["email", "tel"],
      defaultFields: [],
    });
  });

  it("does not count fields that only hold the site's default as saved", async () => {
    const dry = {
      text: 1,
      select: 1,
      radioGroups: 1,
      fields: ["email", "nation", "mil"],
      defaultFields: ["nation", "mil"],
    };
    const frame = {
      url: () => "https://x.example/Application/Index/R1",
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
    };
    await expect(savedData(page)).resolves.toMatchObject({
      saved: false,
      savedAny: true,
      defaultFields: ["nation", "mil"],
    });
    dry.fields.push("school");
    await expect(savedData(page)).resolves.toMatchObject({ saved: true });
  });
});

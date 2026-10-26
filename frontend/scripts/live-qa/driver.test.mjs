// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callInPage,
  discardPage,
  framesCensus,
  planCaptures,
  runPage,
  savedData,
  lonelyRowIds,
  withKeepalive,
} from "./driver.mjs";

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

describe("lonelyRowIds", () => {
  it("treats a hidden row id with no sibling value as the site's own state", () => {
    expect(
      lonelyRowIds([
        "experienceBuilder.resumeBuilderSn",
        "college[0].academyActivitySn",
        "college[0].academyName",
        "career[1].careerCriteriaCodeSn",
      ]),
    ).toEqual([
      "experienceBuilder.resumeBuilderSn",
      "career[1].careerCriteriaCodeSn",
    ]);
  });
});

describe("withKeepalive", () => {
  const APPLY = "https://x.example/ko/o/1/apply";
  const pageOf = (url, calls) => ({
    url: () => url,
    evaluate: async (fn) => {
      calls.push([url, fn.name]);
      if (fn.name === "sessionStatus")
        return { hplaceTimer: false, minutes: null, loggedIn: null };
      if (fn.name === "pingSession") return { ok: true, status: 200 };
      return null;
    },
  });

  afterEach(() => vi.useRealTimers());

  it("pings every other application tab on each interval while fn runs", async () => {
    vi.useFakeTimers();
    const calls = [];
    const current = pageOf(APPLY, calls);
    const other = pageOf("https://y.example/Application/Index/R1", calls);
    const list = pageOf("https://y.example/jobs", calls);
    const context = { pages: () => [current, other, list] };
    let finish;
    const fn = () => new Promise((r) => (finish = r));
    const pending = withKeepalive(context, current, fn, { everyMinutes: 1 });
    await vi.advanceTimersByTimeAsync(60000);
    await vi.advanceTimersByTimeAsync(60000);
    finish({ ok: true });
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.keepalive).toEqual([
      {
        at: expect.any(String),
        tab: "https://y.example/Application/Index/R1",
        action: "pinged",
      },
      {
        at: expect.any(String),
        tab: "https://y.example/Application/Index/R1",
        action: "pinged",
      },
    ]);
    expect(calls.some(([url]) => url !== other.url())).toBe(false);
    await vi.advanceTimersByTimeAsync(120000);
    expect(result.keepalive).toHaveLength(2);
  });

  it("records unreadable tabs and does nothing when switched off", async () => {
    vi.useFakeTimers();
    const broken = {
      url: () => APPLY,
      evaluate: async () => {
        throw Object.assign(new Error("x"), { code: "boom" });
      },
    };
    const current = {
      url: () => "https://z.example/apply",
      evaluate: async () => null,
    };
    const context = { pages: () => [current, broken] };
    let finish;
    const pending = withKeepalive(
      context,
      current,
      () => new Promise((r) => (finish = r)),
      { everyMinutes: 1 },
    );
    await vi.advanceTimersByTimeAsync(60000);
    finish({});
    expect((await pending).keepalive).toEqual([
      { at: expect.any(String), tab: APPLY, action: "unreadable" },
    ]);
    const plain = await withKeepalive(
      context,
      current,
      async () => ({ a: 1 }),
      {
        everyMinutes: 0,
      },
    );
    expect(plain).toEqual({ a: 1 });
  });
});

describe("planCaptures", () => {
  const doc = { width: 1000, height: 3000 };
  it("clips one capture per section and chunks loose controls by 1,200px", () => {
    const plan = planCaptures({
      document: doc,
      sections: [
        {
          name: "학력",
          rect: { top: 100, left: 0, width: 1000, height: 400 },
          controls: [0, 1],
        },
        {
          name: "",
          rect: { top: 600, left: 10, width: 980, height: 0 },
          controls: [2],
        },
        {
          name: "경력",
          rect: { top: 2800, left: -5, width: 1010, height: 500 },
          controls: [3],
        },
      ],
      unsectioned: [{ i: 4, top: 1300, height: 20 }],
    });
    expect(plan).toEqual([
      {
        name: "학력",
        clip: { x: 0, y: 100, width: 1000, height: 400 },
        controls: [0, 1],
      },
      {
        name: "경력",
        clip: { x: 0, y: 2800, width: 1000, height: 200 },
        controls: [3],
      },
      {
        name: "step 2",
        clip: { x: 0, y: 1200, width: 1000, height: 1200 },
        controls: [4],
      },
    ]);
  });

  it("falls back to document chunks when no section was found", () => {
    const plan = planCaptures({
      document: { width: 800, height: 2500 },
      sections: [],
      unsectioned: [
        { i: 0, top: 10, height: 20 },
        { i: 1, top: 2400, height: 20 },
      ],
    });
    expect(plan).toEqual([
      {
        name: "step 1",
        clip: { x: 0, y: 0, width: 800, height: 1200 },
        controls: [0],
      },
      {
        name: "step 2",
        clip: { x: 0, y: 1200, width: 800, height: 1200 },
        controls: [],
      },
      {
        name: "step 3",
        clip: { x: 0, y: 2400, width: 800, height: 100 },
        controls: [1],
      },
    ]);
    expect(planCaptures(null)).toEqual([]);
  });

  it("splits a very tall section", () => {
    const plan = planCaptures(
      {
        document: { width: 500, height: 9000 },
        sections: [
          {
            name: "자기소개",
            rect: { top: 0, left: 0, width: 500, height: 9000 },
            controls: [0],
          },
        ],
        unsectioned: [],
      },
      { maxHeight: 4000 },
    );
    expect(plan.map((c) => [c.name, c.clip.y, c.clip.height])).toEqual([
      ["자기소개 (1)", 0, 4000],
      ["자기소개 (2)", 4000, 4000],
      ["자기소개 (3)", 8000, 1000],
    ]);
  });
});

// A fake tab: no extension panel (the round fails with launcher-missing),
// an empty form, one blocked save request fired while writes are blocked.
describe("runPage captures and save bodies", () => {
  const URL_ = "https://www.skcareers.com/Application/Index/R1";
  const makePage = () => {
    const shots = [];
    const frame = {
      url: () => URL_,
      evaluate: async (x) => {
        const src = typeof x === "string" ? x : x.toString();
        if (src.includes("serviceWorker")) return false;
        if (typeof x === "string") {
          if (src.startsWith("(function census("))
            return {
              url: URL_,
              title: "",
              controls: [
                { i: 0, key: "k", fp: "", name: "a", hasValue: false },
              ],
              ...(src.includes('"regions":true')
                ? {
                    regions: {
                      document: { width: 400, height: 300 },
                      sections: [
                        {
                          name: "학력",
                          rect: { top: 0, left: 0, width: 400, height: 300 },
                          controls: [0],
                        },
                      ],
                      unsectioned: [],
                    },
                  }
                : {}),
            };
          return null;
        }
        if (x.name === "readStep") return { formPresent: false, step: null };
        if (x.name === "panelState") return { stage: "unknown" };
        return true;
      },
    };
    const locator = {
      isVisible: async () => false,
      locator: () => locator,
      getByRole: () => locator,
      click: async () => {
        throw new Error("no panel");
      },
    };
    const page = {
      ...frame,
      mainFrame: () => frame,
      frames: () => [frame],
      on: () => {},
      off: () => {},
      goto: async () => {},
      locator: () => locator,
      route: async (_, handler) => {
        await handler({
          request: () => ({
            method: () => "POST",
            url: () => `${URL_.replace("Index/R1", "ApplicationSave")}`,
            headers: () => ({
              "content-type": "application/x-www-form-urlencoded",
            }),
            postData: () => "prsEmail=login%40example.test&schoolName=가상대",
          }),
          abort: async () => {},
          continue: async () => {},
        });
      },
      unroute: async () => {},
      screenshot: async (options) => {
        shots.push(options);
        return Buffer.from("png");
      },
    };
    return { page, shots };
  };

  it("records masked save bodies and section captures on a test-account tab only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "live-qa-"));
    const captureDir = join(dir, "sk-r1.captures");
    const { page, shots } = makePage();
    const result = await runPage(page, {
      label: "sk-r1",
      clear: false,
      recordValues: true,
      captureDir,
    });
    expect(result.error.code).toBe("launcher-missing");
    expect(result.savePayloads).toEqual([
      {
        path: "https://www.skcareers.com/Application/ApplicationSave",
        fieldCount: 2,
        fields: { prsEmail: "[account]", schoolName: "가상대" },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("login@example");
    expect(result.captures).toEqual([
      {
        file: "sk-r1.captures/01.png",
        name: "학력",
        frame: "main",
        controls: [0],
      },
    ]);
    expect(shots).toEqual([
      {
        clip: { x: 0, y: 0, width: 400, height: 300 },
        fullPage: true,
        timeout: 20000,
      },
    ]);
    expect(await readdir(captureDir)).toEqual(["01.png"]);
    expect((await stat(captureDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(captureDir, "01.png"))).mode & 0o777).toBe(0o600);
    expect(result.after.some((f) => f.regions)).toBe(false);
  }, 20000);

  it("keeps the non-test-account behaviour: no save bodies, no captures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "live-qa-"));
    const { page, shots } = makePage();
    const result = await runPage(page, {
      label: "sk-r1",
      clear: false,
      recordValues: false,
      captureDir: join(dir, "sk-r1.captures"),
    });
    expect(result.testAccount).toBe(false);
    expect("savePayloads" in result).toBe(false);
    expect("captures" in result).toBe(false);
    expect("captureError" in result).toBe(false);
    expect(shots).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  }, 20000);
});

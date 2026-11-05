// @vitest-environment node
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TAB_ALIASES_FILE,
  aliasesForUrl,
  hasContentScript,
  readTabAliases,
  waitForContentScript,
  recoverContentScripts,
  reentryKind,
  resolveTabSpec,
  writeTabAliases,
} from "./tabs.mjs";

const HPLACE = "https://acme.recruiter.co.kr/mrs2/applicant/resume/writeResume";
const HYUNDAI = "https://talent.hyundai.com/apply/applyWrite.hc";
const GREETING = "https://acme.greetinghr.com/apply/123";
const SK = "https://www.skcareers.com/Application/Write?id=1#sec";

describe("tab aliases", () => {
  it("round-trips <out>/tabs.json with mode 0600 and drops invalid entries", async () => {
    const out = await mkdtemp(join(tmpdir(), "live-qa-tabs-"));
    expect(await readTabAliases(out)).toEqual({});
    await writeTabAliases(out, {
      hy_back: "applyWrite|백엔드",
      sk1: "skcareers",
    });
    expect((await stat(join(out, TAB_ALIASES_FILE))).mode & 0o777).toBe(0o600);
    expect(await readTabAliases(out)).toEqual({
      hy_back: "applyWrite|백엔드",
      sk1: "skcareers",
    });
    // Hand-edited garbage is ignored rather than trusted.
    await writeTabAliases(out, {});
    const path = join(out, TAB_ALIASES_FILE);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, JSON.stringify({ "bad name": "x", ok: "y", n: 1 }));
    expect(await readTabAliases(out)).toEqual({ ok: "y" });
    await writeFile(path, "{not json");
    expect(await readTabAliases(out)).toEqual({});
    expect(await readFile(path, "utf8")).toBe("{not json");
  });

  it("rejects alias names outside [A-Za-z0-9_-] and empty specs", async () => {
    const out = await mkdtemp(join(tmpdir(), "live-qa-tabs-"));
    await expect(writeTabAliases(out, { "a b": "x" })).rejects.toMatchObject({
      code: "alias-invalid",
    });
    await expect(writeTabAliases(out, { ok: "|text" })).rejects.toMatchObject({
      code: "alias-invalid",
    });
  });

  it("resolves an alias to its spec and leaves other specs alone", () => {
    const aliases = { hy_back: "applyWrite|백엔드" };
    expect(resolveTabSpec("hy_back", aliases)).toBe("applyWrite|백엔드");
    expect(resolveTabSpec("skcareers", aliases)).toBe("skcareers");
    expect(resolveTabSpec("applyWrite|프론트", aliases)).toBe(
      "applyWrite|프론트",
    );
    expect(resolveTabSpec("toString", aliases)).toBe("toString");
    expect(resolveTabSpec("x", undefined)).toBe("x");
  });

  it("lists the aliases whose url part matches a tab", () => {
    const aliases = {
      hy_back: "applyWrite|백엔드",
      hy_front: "applyWrite|프론트",
      sk: "skcareers",
    };
    expect(aliasesForUrl(HYUNDAI, aliases)).toEqual([
      { name: "hy_back", spec: "applyWrite|백엔드", hasText: true },
      { name: "hy_front", spec: "applyWrite|프론트", hasText: true },
    ]);
    expect(aliasesForUrl(SK, aliases)).toEqual([
      { name: "sk", spec: "skcareers", hasText: false },
    ]);
  });
});

describe("reentryKind", () => {
  it("re-opens Hplace by step, hands Hyundai applyWrite to a person, navigates the rest", () => {
    expect(reentryKind(HPLACE)).toBe("hplace-step");
    expect(reentryKind(HYUNDAI)).toBe("person");
    expect(reentryKind(GREETING)).toBe("goto");
    expect(reentryKind(SK)).toBe("goto");
  });
});

// A fake Playwright page: the launcher count flips to 1 after a goto, and a
// goto may land somewhere else (expired login).
function fakePage(
  url,
  { launcher = false, redirectTo = null, slow = false } = {},
) {
  const page = {
    gotos: [],
    launcher,
    url: () => url,
    locator: () => ({
      count: () =>
        slow ? new Promise(() => {}) : Promise.resolve(page.launcher ? 1 : 0),
    }),
    on() {},
    off() {},
    async goto(target) {
      page.gotos.push(target);
      url = redirectTo ?? target;
      page.launcher = true;
    },
  };
  return page;
}
const context = (...pages) => ({ pages: () => pages });

describe("hasContentScript", () => {
  it("treats a tab that never answers as missing", async () => {
    expect(await hasContentScript(fakePage(SK, { launcher: true }))).toBe(true);
    expect(await hasContentScript(fakePage(SK, { slow: true }), 20)).toBe(
      false,
    );
  });
});

describe("waitForContentScript", () => {
  it("polls until the launcher shows and gives up at the deadline", async () => {
    let t = 0;
    const clock = {
      now: () => t,
      wait: async (ms) => {
        t += ms;
      },
    };
    const late = fakePage(SK);
    const original = late.locator;
    late.locator = (sel) =>
      t >= 1000 ? { count: async () => 1 } : original.call(late, sel);
    expect(
      await waitForContentScript(late, 3000, { pollMs: 500, ...clock }),
    ).toBe(true);
    expect(t).toBe(1000);
    t = 0;
    expect(
      await waitForContentScript(fakePage(SK), 1000, { pollMs: 500, ...clock }),
    ).toBe(false);
    expect(t).toBe(1000);
  });
});

describe("recoverContentScripts", () => {
  it("re-enters a tab that still shows a launcher when assumeStale is set", async () => {
    // After a reinstall the orphaned launcher element is still in the DOM.
    const page = fakePage(SK, { launcher: true });
    const result = await recoverContentScripts(context(page), {
      assumeStale: true,
    });
    expect(page.gotos).toEqual([
      "https://www.skcareers.com/Application/Write?id=1",
    ]);
    expect(result.recovered).toEqual([
      "https://www.skcareers.com/Application/Write",
    ]);
  });
  it("re-enters only application tabs that lost the script and reports briefed urls", async () => {
    const fine = fakePage(GREETING, { launcher: true });
    const sk = fakePage(SK);
    const hp = fakePage(HPLACE);
    const hy = fakePage(HYUNDAI);
    const posting = fakePage("https://acme.greetinghr.com/posting/1");
    const bounced = fakePage(`${GREETING}#x`, {
      redirectTo: "https://acme.greetinghr.com/login",
    });
    const stepCalls = [];
    const result = await recoverContentScripts(
      context(fine, sk, hp, hy, posting, bounced),
      {
        allowHosts: ["api.example"],
        reopenStep: async (page, { allowHosts }) => {
          stepCalls.push([page.url(), allowHosts]);
          page.launcher = true;
          return { ok: true, step: 2, navigated: true };
        },
      },
    );
    expect(result).toEqual({
      checked: 5,
      recovered: [
        "https://www.skcareers.com/Application/Write",
        "https://acme.recruiter.co.kr/mrs2/applicant/resume/writeResume",
      ],
      stillMissing: ["https://acme.greetinghr.com/apply/123"],
      needsPerson: ["https://talent.hyundai.com/apply/applyWrite.hc"],
    });
    // Same address without the hash; Hplace by step; Hyundai untouched.
    expect(sk.gotos).toEqual([
      "https://www.skcareers.com/Application/Write?id=1",
    ]);
    expect(bounced.gotos).toEqual([GREETING]);
    expect(stepCalls).toEqual([[HPLACE, ["api.example"]]]);
    expect(hy.gotos).toEqual([]);
    expect(fine.gotos).toEqual([]);
    expect(posting.gotos).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("id=1");
  });

  it("keeps a tab in stillMissing when the step move fails", async () => {
    const hp = fakePage(HPLACE);
    const result = await recoverContentScripts(context(hp), {
      reopenStep: async () => ({ ok: false, code: "navigation-keys-missing" }),
    });
    expect(result.stillMissing).toEqual([HPLACE]);
    expect(result.recovered).toEqual([]);
  });

  it("accepts the leave prompt only while navigating by default", async () => {
    const events = [];
    const page = fakePage(SK);
    page.on = (name) => events.push(`on:${name}`);
    page.off = (name) => events.push(`off:${name}`);
    const result = await recoverContentScripts(context(page));
    expect(result.recovered).toEqual([
      "https://www.skcareers.com/Application/Write",
    ]);
    expect(events).toEqual(["on:dialog", "off:dialog"]);
  });
});

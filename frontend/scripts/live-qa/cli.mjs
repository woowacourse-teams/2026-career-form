#!/usr/bin/env node
// Live-site static-mapping QA CLI. See README.md in this directory.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachBrowser,
  bounded,
  ensureDeveloperMode,
  extensionIdForDirectory,
  findBrowser,
  installedBuild,
  installExtension,
  installLockHeldByOther,
  launchDetachedBrowser,
  manifestApiHosts,
  readBuildInfo,
  readInstallLock,
  reloadExtension,
  seedProfile,
  statePaths,
  writeInstallLock,
} from "./browser.mjs";
import { claimDialogs, installDialogPolicy } from "./dialogs.mjs";
import { listPageTargets, probeTargets, replaceTarget } from "./health.mjs";
import {
  APPLICATION_PATH,
  brief,
  discardPage,
  framesCensus,
  gotoStep,
  httpPages,
  onGuardedTab,
  pageAt,
  resetPage,
  runPage,
  safeError,
  savedData,
} from "./driver.mjs";
import { keepAlivePage } from "./keepalive.mjs";
import {
  TEST_ACCOUNTS_FILE,
  isTestAccount,
  readTestAccounts,
  siteFor,
} from "./sites.mjs";
import { stripFingerprints } from "./page/census.mjs";
import { readStep } from "./page/hplace-step.mjs";
import {
  aliasesForUrl,
  readTabAliases,
  recoverContentScripts,
  resolveTabSpec,
  writeTabAliases,
} from "./tabs.mjs";
import {
  HPLACE_POLICY_EXCLUSIONS,
  aggregatePage,
  renderReport,
} from "./report/aggregate.mjs";
import { buildGradeInput } from "./report/grade-input.mjs";
import { buildCaptureInput } from "./report/capture-compare.mjs";
import { joinResults } from "./report/join.mjs";
import {
  formatPregradeLines,
  loadStructureIndex,
  reusePregrade,
  saveStructureIndex,
} from "./report/pregrade-reuse.mjs";
import { structureHash } from "./report/structure-hash.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "../..");
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const opt = (name, fallback) => {
  const k = rest.indexOf(`--${name}`);
  return k >= 0 ? rest[k + 1] : fallback;
};
const VALUE_OPTIONS = [
  "label",
  "build",
  "profile",
  "out",
  "timeout",
  "verdicts",
  "names",
  "uncreated",
  "title",
  "date",
  "max",
  "every",
  "threshold",
  "reuse-from",
];
const positional = rest.filter(
  (a, k) =>
    !a.startsWith("--") && !VALUE_OPTIONS.some((o) => rest[k - 1] === `--${o}`),
);
const paths = statePaths();
const outDir = resolve(opt("out", paths.reports));
const buildDir = resolve(opt("build", join(frontend, ".output/chrome-mv3")));
const print = (value) =>
  console.log(
    typeof value === "string" ? value : JSON.stringify(value, null, 1),
  );
// A <tab> spec may be an alias stored by `alias` (tabs.mjs). Commands still
// call pageAt directly; they switch to tabAt once tab addressing is merged.
// eslint-disable-next-line no-unused-vars
const tabAt = async (context, spec) =>
  pageAt(context, resolveTabSpec(spec, await readTabAliases(outDir)));

async function ensureOut() {
  await mkdir(join(outDir, "grade"), { recursive: true, mode: 0o700 });
  await chmod(outDir, 0o700);
}
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 1), { mode: 0o600 });

function defaultProfile() {
  const common = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      cwd: frontend,
      encoding: "utf8",
    },
  ).trim();
  return join(
    common,
    "cf-workflow/live-eval/profile-export.synthetic-full.json",
  );
}
// The profile seeded by `start` (state directory, independent of --out), so
// runs and grading use the same synthetic data.
const profileRecord = () => join(paths.root, "live-qa-profile.json");
async function seededProfile() {
  if (!existsSync(profileRecord())) return null;
  return readJson(profileRecord());
}
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function apiHosts() {
  try {
    const manifest = await readJson(join(paths.extension, "manifest.json"));
    return (manifest.host_permissions ?? []).map(
      (p) => new URL(p.replace("/*", "/")).host,
    );
  } catch {
    return [];
  }
}
// Every attached command installs the dialog policy first (dialogs.mjs):
// without a listener Playwright would answer every tab's dialogs itself.
async function connect() {
  const attached = await attachBrowser(paths);
  if (!attached)
    throw Object.assign(
      new Error("No evaluation browser is running (run: start)."),
      { code: "browser-not-running" },
    );
  installDialogPolicy(attached.context, {
    leaveHosts: await readTestAccounts(paths.root),
  });
  return attached;
}

function controlTable(frames, onlyChanged = false) {
  const lines = [];
  for (const f of frames) {
    lines.push(
      `## frame ${f.main ? "(main)" : f.frame} controls=${f.controls.length}`,
    );
    for (const c of f.controls) {
      if (onlyChanged && !c.changed) continue;
      const flags = [
        c.required && "req",
        c.disabled && "dis",
        c.readonly && "ro",
        c.hasValue && "val",
        c.added && "NEW",
        c.changed && "CHG",
      ]
        .filter(Boolean)
        .join(",");
      const opts = c.options
        ? `\topts=${c.options.join("/")}`
        : c.optionCount
          ? `\topts#${c.optionCount}`
          : "";
      lines.push(
        `${c.i}\t${c.type}\t${c.name || c.id || "-"}\t[${c.section}]\t${c.label}\t${flags}${opts}${c.shown !== undefined ? `\t=> ${c.shown}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

const commands = {
  // Installs the build into the tool-owned copy, launches the browser only when
  // none is running, reloads the extension when the running revision or the
  // manifest's API hosts differ, re-enters application tabs that lost the
  // content script, and seeds the synthetic profile. The copy is shared by
  // every session on the machine: another live session's install lock refuses
  // the reinstall unless --force is given.
  async start() {
    const build = await readBuildInfo(buildDir);
    if (!build?.revision)
      throw new Error(
        `No build-info.json in ${buildDir}; build the extension first.`,
      );
    const buildHosts = await manifestApiHosts(buildDir);
    const lockAllows = async () => {
      const lock = await readInstallLock(paths);
      if (!installLockHeldByOther(lock)) return true;
      const owner = lockOwner(lock);
      if (flag("force")) {
        console.error(
          JSON.stringify({
            warning: "install-locked",
            message:
              "Reinstalling over another live session's install lock (--force).",
            owner,
          }),
        );
        return true;
      }
      print({
        ok: false,
        code: "install-locked",
        owner,
        message:
          "Another live session installed the extension copy; a reinstall would invalidate its round. Re-run with --force to reinstall anyway.",
      });
      process.exitCode = 2;
      return false;
    };
    let found = await findBrowser(paths);
    let installed = false;
    if (!found) {
      if (!(await lockAllows())) return;
      await installExtension(buildDir, paths.extension);
      installed = true;
      found = await launchDetachedBrowser({ paths });
    }
    const { browser, context } = await connect();
    try {
      const id = await extensionIdForDirectory(paths.extension);
      await ensureDeveloperMode(context);
      let running = await installedBuild(context, id);
      const installedHosts = await manifestApiHosts(paths.extension);
      const reinstallReason =
        running?.revision !== build.revision
          ? "revision"
          : JSON.stringify(installedHosts) !== JSON.stringify(buildHosts)
            ? "api-hosts"
            : flag("reinstall")
              ? "flag"
              : null;
      let recovery = null;
      if (reinstallReason) {
        if (!installed && !(await lockAllows())) return;
        await installExtension(buildDir, paths.extension);
        installed = true;
        running = await reloadExtension(context, id, build.revision);
        // Tabs that were open keep the old content script, or none: re-enter
        // them at their own address (tabs.mjs).
        recovery = await recoverContentScripts(context, {
          allowHosts: await apiHosts(),
        });
      }
      let lock = await readInstallLock(paths);
      if (installed)
        lock = await writeInstallLock(paths, {
          revision: build.revision,
          apiHosts: buildHosts,
        });
      else if (lock && lock.revision !== running?.revision)
        console.error(
          JSON.stringify({
            warning: "install-lock-revision-mismatch",
            message:
              "The install lock names another revision than the running extension; another session may have changed the copy.",
            lock: lockOwner(lock),
            running: running?.revision ?? null,
          }),
        );
      const profilePath = opt("profile", defaultProfile());
      await seedProfile(context, id, profilePath);
      await writeJson(profileRecord(), {
        sha256: sha256(await readFile(profilePath)),
        path: resolve(profilePath),
      });
      print({
        ok: true,
        port: found.port,
        extensionId: id,
        running,
        apiHosts: await apiHosts(),
        reinstalled: reinstallReason,
        recovery,
        lock: lock ? lockOwner(lock) : null,
      });
    } finally {
      await browser.close();
    }
  },
  // One line per tab; aliases (tabs.mjs) whose spec matches follow as @name.
  async tabs(context) {
    const aliases = await readTabAliases(outDir);
    for (const [k, p] of httpPages(context).entries()) {
      const names = [];
      for (const a of aliasesForUrl(p.url(), aliases)) {
        const text = a.spec.split("|")[1];
        const hit =
          !a.hasText ||
          (await bounded(
            p
              .evaluate((t) => document.body.innerText.includes(t), text)
              .catch(() => false),
            3000,
            false,
          ));
        if (hit) names.push(a.name);
      }
      console.log(
        `${k}\t${brief(p.url())}${names.length ? `\t@${names.join(",")}` : ""}`,
      );
    }
  },
  async open(context) {
    const page = await context.newPage();
    await page
      .goto(positional[0], { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch(() => {});
    print(`opened ${brief(page.url())}`);
  },
  // Closes a tab. The site's leave-page prompt, if any, is accepted: the
  // harness never leaves values worth keeping on a tab it drove.
  async close(context) {
    const page = await pageAt(context, positional[0]);
    const url = brief(page.url());
    const claim = claimDialogs(page);
    claim.allowLeave(true);
    try {
      await page.close({ runBeforeUnload: true });
      await bounded(page.waitForEvent("close"), 10000);
    } finally {
      claim.release();
    }
    print(`closed ${url}`);
  },
  async goto(context) {
    const page = await pageAt(context, positional[0]);
    await page
      .goto(positional[1], { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch(() => {});
    print(`now ${brief(page.url())}`);
  },
  // Posting pages only: application forms show the applicant's own data.
  async text(context) {
    const page = await pageAt(context, positional[0]);
    if (APPLICATION_PATH.test(new URL(page.url()).pathname))
      throw new Error("text is refused on application forms; use census.");
    print(
      (await page.evaluate(() => document.body.innerText))
        .replace(/\n{2,}/g, "\n")
        .slice(0, Number(opt("max", 6000))),
    );
  },
  async stepinfo(context) {
    print(await (await pageAt(context, positional[0])).evaluate(readStep));
  },
  // Moves happen with writes blocked and the tab's dialogs claimed, as in a
  // round.
  async step(context) {
    const page = await pageAt(context, positional[0]);
    print(
      await onGuardedTab(page, { allowHosts: await apiHosts() }, () =>
        gotoStep(page, Number(positional[1]), { force: flag("force") }),
      ),
    );
  },
  // Lists what a clear would remove from each application form (counts and
  // control names, never values). Hplace MRS2 forms are checked on steps 1-3.
  // Forms that hold saved values are cleared by a person before a round.
  async saved(context) {
    const pages = positional[0]
      ? [await pageAt(context, positional[0])]
      : httpPages(context).filter((p) =>
          APPLICATION_PATH.test(new URL(p.url()).pathname),
        );
    const hosts = await apiHosts();
    const report = [];
    for (const page of pages) {
      const result = await savedData(page, { allowHosts: hosts }).catch(
        (error) => ({ ...safeError(error), saved: null }),
      );
      report.push({ tab: brief(page.url()), ...result });
    }
    print(report);
    const needs = report.filter((r) => r.saved === true);
    if (needs.length)
      console.error(
        `${needs.length} form(s) hold saved values; clear them with 'reset <tab> --yes' (test accounts) or by hand before a round: ${needs.map((r) => r.tab).join(", ")}`,
      );
  },
  // Test-account reset: clears the form in the page and temp-saves it empty,
  // so the server copy no longer holds values from earlier rounds. Only for
  // hosts listed in <state dir>/test-accounts.json, and only with --yes.
  async reset(context) {
    const page = await pageAt(context, positional[0]);
    const hosts = await readTestAccounts(paths.root);
    const allowlist = join(paths.root, TEST_ACCOUNTS_FILE);
    if (!isTestAccount(page.url(), hosts)) {
      print({
        ok: false,
        code: "account-not-allowlisted",
        message: `reset temp-saves an empty form on the site. List this tab's host in ${allowlist} ({"hosts": [...]}) only if the login is a test account.`,
      });
      process.exitCode = 2;
      return;
    }
    const allowHosts = await apiHosts();
    if (!flag("yes")) {
      print({
        ok: false,
        code: "confirmation-required",
        saved: await savedData(page, { allowHosts }),
        message:
          "Re-run with --yes to clear the form in the page and temp-save it empty.",
      });
      process.exitCode = 2;
      return;
    }
    const result = await resetPage(page, {
      site: siteFor(page.url()),
      allowHosts,
    });
    print(result);
    if (!result.ok) process.exitCode = 1;
  },
  async census(context) {
    const page = await pageAt(context, positional[0]);
    const label = opt("label", "census");
    await ensureOut();
    // The salt is thrown away: fingerprints are not needed in the file.
    const frames = stripFingerprints(
      await framesCensus(page, { salt: randomBytes(16).toString("hex") }),
    );
    const addButtons = await page.evaluate(() =>
      [].slice
        .call(document.querySelectorAll("button, a, input[type=button]"))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((e) =>
          (e.textContent || e.value || e.getAttribute("aria-label") || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(
          (t, k, a) => /추가/.test(t) && t.length < 40 && a.indexOf(t) === k,
        ),
    );
    await writeJson(join(outDir, `${label}.census.json`), frames);
    await writeJson(join(outDir, `${label}.addbuttons.json`), addButtons);
    print(
      `url=${brief(page.url())}\n${controlTable(frames)}\naddButtons=${JSON.stringify(addButtons)}`,
    );
  },
  async run(context) {
    const page = await pageAt(context, positional[0]);
    const label = opt("label", "run");
    await ensureOut();
    // Ctrl-C or a kill stops the round but still lets the cleanup (discard
    // while blocked and guarded, residue check, unblock) finish. Repeated
    // signals are ignored until then.
    const controller = new AbortController();
    const stop = () => {
      if (controller.signal.aborted)
        console.error("cleanup in progress; waiting for the discard to finish");
      controller.abort();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    const id = await extensionIdForDirectory(paths.extension);
    const result = await runPage(page, {
      label,
      clear: !flag("no-clear"),
      approveReview: !flag("no-approve"),
      timeoutMs: Number(opt("timeout", 300)) * 1000,
      allowHosts: await apiHosts(),
      build: await installedBuild(context, id),
      signal: controller.signal,
      // Test accounts: record values instead of hiding pre-run ones.
      recordValues: isTestAccount(
        page.url(),
        await readTestAccounts(paths.root),
      ),
      profile: await (async () => {
        const seeded = await seededProfile();
        if (!seeded) {
          console.error(
            "warning: no seeded profile record (run start); synthetic values that the page already held stay hidden.",
          );
          return null;
        }
        return readJson(seeded.path);
      })(),
    }).finally(() => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    });
    await writeJson(join(outDir, `${label}.run.json`), result);
    const { before, after, console: lines, ...summary } = result;
    print({
      ...summary,
      changed: after.flatMap((f) => f.controls).filter((c) => c.changed).length,
      beforeControls: before.flatMap((f) => f.controls).length,
      consoleLines: lines.length,
    });
    print(controlTable(after, true));
    // Synthetic values left on the page could be saved by a person later.
    if (result.discarded && !result.discarded.residue?.verified) {
      console.error(
        JSON.stringify({
          ok: false,
          code: "discard-residue",
          message: `The discard did not restore the pre-run values (${result.discarded.code ?? `${result.discarded.residue?.unexpected} unexpected values`}); re-open the tab before anyone saves.`,
        }),
      );
      process.exitCode = 1;
    }
  },
  async discard(context) {
    const page = await pageAt(context, positional[0]);
    print(
      await onGuardedTab(page, { allowHosts: await apiHosts() }, (dialogs) =>
        discardPage(page, { dialogs }),
      ),
    );
  },
  // Keeps login sessions alive on one tab or on every application tab.
  // --every <minutes> repeats until Ctrl-C; --force extends regardless of the
  // remaining time; --threshold <minutes> (default 20) for Hplace countdowns.
  async keepalive(context) {
    const every = Number(opt("every", 0));
    const thresholdMinutes = Number(opt("threshold", 20));
    let stopped = false;
    process.once("SIGINT", () => {
      stopped = true;
    });
    // Session prompts on any tab are accepted by the dialog policy (connect).
    for (;;) {
      let pages = [];
      try {
        pages = positional[0]
          ? [await pageAt(context, positional[0])]
          : httpPages(context).filter((p) =>
              APPLICATION_PATH.test(new URL(p.url()).pathname),
            );
      } catch (error) {
        // A tab that is briefly missing must not end the loop.
        print({
          tab: positional[0],
          at: new Date().toISOString(),
          action: "error",
          code: error.code ?? "tab-error",
        });
      }
      for (const page of pages) {
        const result = await keepAlivePage(page, {
          thresholdMinutes,
          force: flag("force"),
        }).catch((error) => ({
          action: "error",
          code: error.code ?? "keepalive-error",
        }));
        print({
          tab: brief(page.url()),
          at: new Date().toISOString(),
          ...result,
        });
      }
      if (!every || stopped) return;
      const until = Date.now() + every * 60000;
      while (!stopped && Date.now() < until)
        await new Promise((r) => setTimeout(r, 1000));
      if (stopped) return;
    }
  },
};

// What is printed about an install lock: never the cwd.
const lockOwner = (lock) => ({
  pid: lock?.pid ?? null,
  sessionPid: lock?.sessionPid ?? null,
  startedAt: lock?.startedAt ?? null,
  revision: lock?.revision ?? null,
});
const coded = (code, message) => Object.assign(new Error(message), { code });
const notRunning = () =>
  coded(
    "browser-not-running",
    "No evaluation browser is running (run: start).",
  );
const printProbes = (probes) => {
  for (const p of probes)
    console.log(`${String(p.ms).padStart(6)}ms\t${p.state}\t${p.url}`);
};

// Commands that never attach through Playwright. A hung tab blocks the
// Playwright attach itself (2026-10-22, 30s timeout), so health and replace
// talk raw CDP (health.mjs); lock and alias only touch files.
const standalone = {
  // Probes every page target; exit 1 lists the tabs that did not answer.
  async health() {
    const found = await findBrowser(paths);
    if (!found) throw notRunning();
    const probes = await probeTargets(found.endpoint, {
      timeoutMs: Number(opt("timeout", 5)) * 1000,
    });
    printProbes(probes);
    const hung = probes.filter((p) => !p.ok);
    if (hung.length) {
      print({
        ok: false,
        code: "tabs-hung",
        hung: hung.map(({ targetId, url, state, ms }) => ({
          targetId,
          url,
          state,
          ms,
        })),
        message:
          "Replace a hung tab with 'replace <url-substring>' or 'replace --all-hung'.",
      });
      process.exitCode = 1;
    }
  },
  // replace <url-substring> (exactly one target) | --all-hung: a new tab at
  // the same address is created before the old one is closed, then every
  // target is probed again. The browser keeps running.
  async replace() {
    const found = await findBrowser(paths);
    if (!found) throw notRunning();
    const timeoutMs = Number(opt("timeout", 5)) * 1000;
    let chosen;
    if (flag("all-hung")) {
      chosen = (await probeTargets(found.endpoint, { timeoutMs })).filter(
        (p) => !p.ok,
      );
      if (!chosen.length) {
        print({ ok: true, replaced: [], message: "No tab is hung." });
        return;
      }
    } else {
      const spec = positional[0];
      if (!spec)
        throw coded(
          "tab-required",
          "replace needs <url-substring> or --all-hung.",
        );
      const matches = (await listPageTargets(found.endpoint)).filter((t) =>
        t.url.includes(spec),
      );
      if (matches.length !== 1)
        throw coded(
          "tab-not-unique",
          `tab '${spec}' matched ${matches.length}: ${matches.map((t) => brief(t.url)).join(", ")}`,
        );
      chosen = matches;
    }
    const replaced = [];
    for (const t of chosen)
      replaced.push(await replaceTarget(found.endpoint, t.targetId));
    const after = await probeTargets(found.endpoint, { timeoutMs });
    const probeOf = (id) => after.find((p) => p.targetId === id) ?? null;
    print({
      ok: replaced.every((r) => r.ok),
      replaced: replaced.map((r) => ({
        ...r,
        after: r.newTargetId ? probeOf(r.newTargetId) : null,
      })),
    });
    printProbes(after);
    if (!replaced.every((r) => r.ok) || after.some((p) => !p.ok))
      process.exitCode = 1;
  },
  // Marks the installed copy as this session's, so another session's `start`
  // refuses to reinstall during a round. --show only prints the lock.
  async lock() {
    const current = await readInstallLock(paths);
    if (flag("show")) {
      print({
        lock: current ? lockOwner(current) : null,
        heldByOther: installLockHeldByOther(current),
      });
      return;
    }
    const previous = installLockHeldByOther(current)
      ? lockOwner(current)
      : null;
    const build = await readBuildInfo(paths.extension);
    const lock = await writeInstallLock(paths, {
      revision: build?.revision ?? null,
      apiHosts: await apiHosts(),
    });
    print({ ok: true, lock: lockOwner(lock), takenFrom: previous });
  },
  // alias <name> <url-substring|page text> | alias --list | alias <name> --remove
  async alias() {
    const aliases = await readTabAliases(outDir);
    const [name, spec] = positional;
    if (flag("list") || !name) {
      print(aliases);
      return;
    }
    if (flag("remove")) {
      delete aliases[name];
      await writeTabAliases(outDir, aliases);
      print({ ok: true, removed: name });
      return;
    }
    if (!spec)
      throw coded(
        "alias-invalid",
        "alias <name> <url-substring|page text> stores a tab spec under the name.",
      );
    await writeTabAliases(outDir, { ...aliases, [name]: spec });
    print({ ok: true, [name]: spec });
  },
};

// Offline commands work on files in --out and need no browser.
const offline = {
  async "grade-input"() {
    await ensureOut();
    const seeded = await seededProfile();
    const profile = opt("profile", seeded?.path ?? defaultProfile());
    if (!existsSync(profile))
      throw Object.assign(new Error(`Profile not found: ${profile}`), {
        code: "profile-missing",
      });
    const content = await readFile(profile);
    // Grading must use the profile the extension was seeded with.
    if (!seeded)
      throw Object.assign(
        new Error(
          "No seeded profile record: run `start` first so grading uses the same profile.",
        ),
        { code: "profile-not-seeded" },
      );
    if (seeded.sha256 !== sha256(content))
      throw Object.assign(
        new Error(
          "This profile differs from the one `start` seeded; pass the same --profile.",
        ),
        { code: "profile-mismatch" },
      );
    await writeFile(join(outDir, "grade/profile.synthetic.json"), content, {
      mode: 0o600,
    });
    // --reuse-from dir1,dir2: earlier result directories whose
    // grade/structure-index.json may hold a grading of the same structure.
    const reuseDirs = opt("reuse-from", "")
      .split(",")
      .filter(Boolean)
      .map((d) => resolve(d));
    const index = await loadStructureIndex(outDir);
    const results = [];
    for (const label of positional) {
      const frames = await readJson(join(outDir, `${label}.census.json`));
      const add = existsSync(join(outDir, `${label}.addbuttons.json`))
        ? await readJson(join(outDir, `${label}.addbuttons.json`))
        : [];
      const input = buildGradeInput(label, frames, add);
      const hash = structureHash(input);
      await writeJson(join(outDir, `grade/${label}.input.json`), {
        ...input,
        structureHash: hash,
      });
      const reuse = await reusePregrade({
        outDir,
        label,
        hash,
        index,
        reuseDirs,
      });
      results.push({ label, controls: input.controlCount, hash, ...reuse });
    }
    await saveStructureIndex(outDir, index);
    for (const line of formatPregradeLines(results)) print(line);
  },
  async join() {
    const captureLabels = [];
    for (const label of positional) {
      const run = await readJson(join(outDir, `${label}.run.json`));
      const joined = joinResults({
        label,
        final: await readJson(join(outDir, `grade/${label}.final.json`)),
        census: await readJson(join(outDir, `${label}.census.json`)),
        run,
      });
      await writeJson(join(outDir, `grade/${label}.joined.json`), joined);
      // Runs with captures (test-account tabs) also get the capture judge's
      // input: capture files and expected values only, no DOM result.
      const captures = Array.isArray(run.captures) ? run.captures : [];
      if (captures.length) {
        await writeJson(
          join(outDir, `grade/${label}.capture-input.json`),
          buildCaptureInput({ joined, captures, baseDir: outDir }),
        );
        captureLabels.push(label);
      }
      print(
        `${label} rows=${joined.rows.length} new=${joined.addedOrUnmatchedAfterControls.length} captures=${captures.length}`,
      );
    }
    print(`captureLabels: ${JSON.stringify(captureLabels)}`);
  },
  // --verdicts a.json,b.json: verify-workflow results (arrays of page verdicts).
  // --uncreated file.json: {label: cells} for rows the run never created.
  async report() {
    const verdicts = {};
    for (const file of opt("verdicts", "").split(",").filter(Boolean))
      for (const v of await readJson(file)) if (v) verdicts[v.label] = v;
    const uncreated = opt("uncreated") ? await readJson(opt("uncreated")) : {};
    const names = opt("names") ? await readJson(opt("names")) : {};
    const pages = [];
    for (const label of positional) {
      const run = await readJson(join(outDir, `${label}.run.json`));
      const joinedPath = join(outDir, `grade/${label}.joined.json`);
      // Not graded yet: control counts still come from the run itself.
      const joined = existsSync(joinedPath)
        ? await readJson(joinedPath)
        : {
            rows: (run.before ?? []).flatMap((f) => f.controls),
            addedOrUnmatchedAfterControls: (run.after ?? [])
              .flatMap((f) => f.controls)
              .filter((c) => c.added),
          };
      const capturePath = join(outDir, `grade/${label}.capture.json`);
      pages.push(
        aggregatePage({
          label,
          joined,
          verdict: verdicts[label],
          run,
          captureVerdict: existsSync(capturePath)
            ? await readJson(capturePath)
            : null,
          uncreatedCells: uncreated[label] ?? 0,
          policyPattern: label.startsWith("hp-")
            ? HPLACE_POLICY_EXCLUSIONS
            : null,
        }),
      );
    }
    const build = await readBuildInfo(paths.extension);
    const md = renderReport({
      title: opt("title", "실사이트 정적 맵핑 QA"),
      meta: {
        revision: build?.revision ?? "unknown",
        apiOrigin: (await apiHosts())[0] ?? "unknown",
        date: opt("date", new Date().toISOString().slice(0, 10)),
      },
      pages,
      names,
    });
    await writeFile(join(outDir, "report.md"), md, { mode: 0o600 });
    print(md);
  },
  // Writes the Workflow script from workflows/<name>.md to --out for the
  // Claude Code Workflow tool (scriptPath).
  async "workflow-script"() {
    const name = positional[0];
    const md = await readFile(join(here, "workflows", `${name}.md`), "utf8");
    const code = /```js\n([\s\S]*?)```/.exec(md)?.[1];
    if (!code) throw new Error(`No js block in workflows/${name}.md`);
    await ensureOut();
    const path = join(outDir, `${name}.workflow.js`);
    await writeFile(path, code, { mode: 0o600 });
    print(path);
  },
};

async function main() {
  if (cmd === "start") return commands.start();
  if (standalone[cmd]) return standalone[cmd]();
  if (offline[cmd]) return offline[cmd]();
  if (!commands[cmd]) {
    print(
      "commands: start [--build dir] [--profile file] [--reinstall] [--force] | health [--timeout s] | replace <url-substring>|--all-hung | lock [--show] | alias <name> <spec>|--list|<name> --remove | keepalive [<tab>] [--every min] [--threshold min] [--force] | tabs | open <url> | close <tab> | goto <tab> <url> | text <tab> | stepinfo <tab> | step <tab> <1-4> [--force] | saved [<tab>] | reset <tab> --yes | census <tab> --label L | run <tab> --label L [--no-clear] [--no-approve] [--timeout s] | discard <tab> | grade-input <labels> | join <labels> | report <labels> --verdicts a.json[,b.json] [--uncreated f] [--names f] | workflow-script <pregrade|verify>\n<tab> = url-substring, 'url-substring|page text' or an alias",
    );
    process.exitCode = cmd ? 1 : 0;
    return;
  }
  const { browser, context } = await connect();
  try {
    await commands[cmd](context);
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(JSON.stringify({ ok: false, ...safeError(error, "error") }));
  process.exitCode = 1;
});

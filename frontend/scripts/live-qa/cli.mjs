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
  ensureDeveloperMode,
  extensionIdForDirectory,
  findBrowser,
  installedBuild,
  installExtension,
  launchDetachedBrowser,
  readBuildInfo,
  reloadExtension,
  seedProfile,
  statePaths,
} from "./browser.mjs";
import { installDialogPolicy } from "./dialogs.mjs";
import {
  APPLICATION_PATH,
  brief,
  discardPage,
  framesCensus,
  gotoStep,
  httpPages,
  onGuardedTab,
  pageAt,
  runPage,
  safeError,
} from "./driver.mjs";
import { keepAlivePage } from "./keepalive.mjs";
import { stripFingerprints } from "./page/census.mjs";
import { readStep } from "./page/hplace-step.mjs";
import {
  HPLACE_POLICY_EXCLUSIONS,
  aggregatePage,
  renderReport,
} from "./report/aggregate.mjs";
import { buildGradeInput } from "./report/grade-input.mjs";
import { joinResults } from "./report/join.mjs";

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
  installDialogPolicy(attached.context);
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
  // none is running, reloads the extension when the running revision differs,
  // and seeds the synthetic profile.
  async start() {
    const build = await readBuildInfo(buildDir);
    if (!build?.revision)
      throw new Error(
        `No build-info.json in ${buildDir}; build the extension first.`,
      );
    let found = await findBrowser(paths);
    if (!found) {
      await installExtension(buildDir, paths.extension);
      found = await launchDetachedBrowser({ paths });
    }
    const { browser, context } = await connect();
    try {
      const id = await extensionIdForDirectory(paths.extension);
      await ensureDeveloperMode(context);
      let running = await installedBuild(context, id);
      if (running?.revision !== build.revision || flag("reinstall")) {
        await installExtension(buildDir, paths.extension);
        running = await reloadExtension(context, id, build.revision);
      }
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
      });
    } finally {
      await browser.close();
    }
  },
  async tabs(context) {
    httpPages(context).forEach((p, k) =>
      console.log(`${k}\t${brief(p.url())}`),
    );
  },
  async open(context) {
    const page = await context.newPage();
    await page
      .goto(positional[0], { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch(() => {});
    print(`opened ${brief(page.url())}`);
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
    for (const label of positional) {
      const frames = await readJson(join(outDir, `${label}.census.json`));
      const add = existsSync(join(outDir, `${label}.addbuttons.json`))
        ? await readJson(join(outDir, `${label}.addbuttons.json`))
        : [];
      const input = buildGradeInput(label, frames, add);
      await writeJson(join(outDir, `grade/${label}.input.json`), input);
      print(`${label} controls=${input.controlCount}`);
    }
  },
  async join() {
    for (const label of positional) {
      const joined = joinResults({
        label,
        final: await readJson(join(outDir, `grade/${label}.final.json`)),
        census: await readJson(join(outDir, `${label}.census.json`)),
        run: await readJson(join(outDir, `${label}.run.json`)),
      });
      await writeJson(join(outDir, `grade/${label}.joined.json`), joined);
      print(
        `${label} rows=${joined.rows.length} new=${joined.addedOrUnmatchedAfterControls.length}`,
      );
    }
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
      pages.push(
        aggregatePage({
          label,
          joined,
          verdict: verdicts[label],
          run,
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
  if (offline[cmd]) return offline[cmd]();
  if (!commands[cmd]) {
    print(
      "commands: start [--build dir] [--profile file] | keepalive [<tab>] [--every min] [--threshold min] [--force] | tabs | open <url> | goto <tab> <url> | text <tab> | stepinfo <tab> | step <tab> <1-4> [--force] | census <tab> --label L | run <tab> --label L [--no-clear] [--no-approve] [--timeout s] | discard <tab> | grade-input <labels> | join <labels> | report <labels> --verdicts a.json[,b.json] [--uncreated f] [--names f] | workflow-script <pregrade|verify>\n<tab> = url-substring or 'url-substring|page text'",
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

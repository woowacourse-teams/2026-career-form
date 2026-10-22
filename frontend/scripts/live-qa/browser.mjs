// The resident evaluation browser. It runs as its own detached process with a
// dedicated profile, so tool restarts and extension rebuilds never drop the
// sites' logins. Commands attach over a loopback DevTools port and only ever
// disconnect: nothing in this tool closes the browser or its context.
// Ported from the CF-177 live-eval tool; the state directory is shared with it.
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

export const DEFAULT_STATE_DIRECTORY = join(
  homedir(),
  ".career-form-live-eval",
);

export const bounded = (promise, ms, fallback = null) =>
  Promise.race([promise, delay(ms).then(() => fallback)]).catch(() => fallback);

// Resolved on every call so tests can point LIVE_QA_STATE_DIR elsewhere.
export function statePaths(env = process.env) {
  const custom = env.LIVE_QA_STATE_DIR ?? env.LIVE_EVAL_STATE_DIR;
  const root = custom ? resolve(custom) : DEFAULT_STATE_DIRECTORY;
  return {
    root,
    isolated: root !== DEFAULT_STATE_DIRECTORY,
    profile: join(root, "profile"),
    // Tool-owned copy of the built extension: rebuilding the repo never
    // changes what the running browser loads until an explicit reload.
    extension: join(root, "extension"),
    browser: join(root, "browser.json"),
    reports: join(root, "live-qa"),
  };
}

// Mirrors Playwright's chromium switches (minus --disable-extensions) so the
// existing profile and its cookies keep working.
const disabledFeatures = [
  "AvoidUnnecessaryBeforeUnloadCheckSync",
  "DestroyProfileOnBrowserClose",
  "DialMediaRouteProvider",
  "GlobalMediaControls",
  "HttpsUpgrades",
  "LensOverlay",
  "MediaRouter",
  "PaintHolding",
  "ThirdPartyStoragePartitioning",
  "Translate",
  "AutoDeElevate",
  "OptimizationHints",
  "NetworkTimeServiceQuerying",
  "AimEnabled",
];
export const browserSwitches = [
  "--disable-field-trial-config",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-back-forward-cache",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-extensions-with-background-pages",
  "--disable-component-update",
  "--no-default-browser-check",
  "--disable-default-apps",
  "--disable-dev-shm-usage",
  `--disable-features=${disabledFeatures.join(",")}`,
  "--allow-pre-commit-input",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-popup-blocking",
  "--disable-prompt-on-repost",
  "--disable-renderer-backgrounding",
  "--force-color-profile=srgb",
  "--metrics-recording-only",
  "--no-first-run",
  "--password-store=basic",
  "--use-mock-keychain",
  "--no-service-autorun",
  "--disable-search-engine-choice-screen",
  "--disable-infobars",
  "--disable-sync",
  // Session cookies and tabs come back after a browser restart.
  "--restore-last-session",
];

async function devToolsPort(profile) {
  try {
    const [port] = (
      await readFile(join(profile, "DevToolsActivePort"), "utf8")
    ).split("\n");
    return /^[0-9]{2,5}$/.test(port) ? Number(port) : null;
  } catch {
    return null;
  }
}

export async function findBrowser(paths = statePaths(), timeoutMs = 5000) {
  const port = await devToolsPort(paths.profile);
  if (!port) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    await response.json();
    return { port, endpoint: `http://127.0.0.1:${port}` };
  } catch {
    return null;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
function commandLine(pid) {
  try {
    return execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// A live process that still owns the profile, or null. An unreadable command
// line counts as the owner: a slow browser must never look like a dead one.
export async function profileOwner(paths = statePaths()) {
  const candidates = [];
  try {
    const { pid } = JSON.parse(await readFile(paths.browser, "utf8"));
    if (Number.isSafeInteger(pid) && pid > 1) candidates.push(pid);
  } catch {
    /* No launch record. */
  }
  try {
    const match = /-([0-9]+)$/.exec(
      await readlink(join(paths.profile, "SingletonLock")),
    );
    if (match) candidates.push(Number(match[1]));
  } catch {
    /* No Chrome holds the profile lock. */
  }
  for (const pid of candidates) {
    if (!processAlive(pid)) continue;
    const command = commandLine(pid);
    if (
      command === null ||
      command.includes(`--user-data-dir=${paths.profile}`)
    )
      return { pid };
  }
  return null;
}

// Launches the browser only when none owns the profile.
export async function launchDetachedBrowser({
  paths = statePaths(),
  urls = [],
} = {}) {
  if (await findBrowser(paths))
    throw new Error("An evaluation browser is already running.");
  if (await profileOwner(paths))
    throw Object.assign(
      new Error(
        "A browser still owns the profile but DevTools does not answer; nothing was launched.",
      ),
      { code: "browser-unreachable" },
    );
  await mkdir(paths.profile, { recursive: true, mode: 0o700 });
  await chmod(paths.root, 0o700);
  await rm(join(paths.profile, "DevToolsActivePort"), { force: true });
  // Cached extension service-worker scripts only; cookies are untouched.
  await rm(join(paths.profile, "Default", "Service Worker"), {
    recursive: true,
    force: true,
  });
  const child = spawn(
    chromium.executablePath(),
    [
      ...browserSwitches,
      `--user-data-dir=${paths.profile}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--disable-extensions-except=${paths.extension}`,
      `--load-extension=${paths.extension}`,
      ...urls,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const found = await findBrowser(paths);
    if (found) {
      await writeFile(
        paths.browser,
        `${JSON.stringify({ pid: child.pid, port: found.port })}\n`,
        { mode: 0o600 },
      );
      return { ...found, pid: child.pid };
    }
    await delay(250);
  }
  throw new Error("Evaluation browser did not expose its DevTools port.");
}

// Attach without owning the browser: callers use browser.close(), which only
// disconnects a CDP attachment, and never context.close().
export async function attachBrowser(paths = statePaths()) {
  const found = await findBrowser(paths);
  if (!found) return null;
  const browser = await chromium.connectOverCDP(found.endpoint);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error("Evaluation browser has no default context.");
  }
  return { browser, context, ...found };
}

// Chrome derives an unpacked extension's id from its absolute path.
export function extensionIdFor(path) {
  return [...createHash("sha256").update(path).digest("hex").slice(0, 32)]
    .map((digit) => String.fromCharCode(97 + parseInt(digit, 16)))
    .join("");
}
export async function extensionIdForDirectory(directory) {
  return extensionIdFor(await realpath(directory));
}

export async function installExtension(source, target) {
  const staging = `${target}.staging`;
  await rm(staging, { recursive: true, force: true });
  await cp(source, staging, { recursive: true });
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  await chmod(target, 0o700);
}

export async function readBuildInfo(directory) {
  try {
    return JSON.parse(
      await readFile(join(directory, "build-info.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

async function withExtensionPage(context, id, action, timeoutMs = 15000) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${id}/options.html`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    return await action(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// The build the running service worker reports (not the file on disk).
export async function installedBuild(context, id) {
  return withExtensionPage(context, id, (page) =>
    bounded(
      page.evaluate(() =>
        globalThis.chrome.runtime.sendMessage({
          type: "AUTOFILL_GET_INSTALLED_BUILD",
        }),
      ),
      5000,
    ),
  ).catch(() => null);
}

// Reloading a command-line unpacked extension unloads it unless developer
// mode is on, so turn it on first.
export async function ensureDeveloperMode(context) {
  const page = await context.newPage();
  try {
    await page.goto("chrome://extensions/", { timeout: 15000 });
    return await bounded(
      page.evaluate(async () => {
        const api = globalThis.chrome.developerPrivate;
        if ((await api.getProfileConfiguration()).inDeveloperMode)
          return { changed: false, enabled: true };
        await api.updateProfileConfiguration({ inDeveloperMode: true });
        return {
          changed: true,
          enabled: (await api.getProfileConfiguration()).inDeveloperMode,
        };
      }),
      10000,
      { changed: false, enabled: false },
    );
  } finally {
    await page.close().catch(() => undefined);
  }
}

const reloadMarkerKey = "careerForm.liveQa.reloadMarker";

// chrome.runtime.reload(), then wait until a fresh instance (its session
// storage is cleared by the reload) reports `revision`.
export async function reloadExtension(
  context,
  id,
  revision,
  timeoutMs = 60000,
) {
  const developerMode = await ensureDeveloperMode(context);
  if (!developerMode.enabled)
    throw new Error("Developer mode is required to reload the extension.");
  const marker = randomBytes(8).toString("hex");
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${id}/options.html`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.evaluate(
      ([key, value]) => globalThis.chrome.storage.session.set({ [key]: value }),
      [reloadMarkerKey, marker],
    );
    const closed = bounded(page.waitForEvent("close"), 5000);
    await page
      .evaluate(() => setTimeout(() => globalThis.chrome.runtime.reload(), 50))
      .catch(() => undefined);
    await closed;
  } finally {
    await page.close().catch(() => undefined);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const last = await withExtensionPage(context, id, (probe) =>
      bounded(
        probe.evaluate(async (key) => {
          const stored = await globalThis.chrome.storage.session.get(key);
          const build = await globalThis.chrome.runtime.sendMessage({
            type: "AUTOFILL_GET_INSTALLED_BUILD",
          });
          return { marker: stored[key] ?? null, build };
        }, reloadMarkerKey),
        5000,
      ),
    ).catch(() => null);
    if (last && last.marker !== marker && last.build?.revision === revision)
      return last.build;
    await delay(1000);
  }
  throw new Error("Extension did not come back with the installed revision.");
}

// Only a synthetic profile export (schemaVersion 1) is accepted.
export function validateProfileEnvelope(envelope) {
  if (
    !envelope ||
    envelope.schemaVersion !== 1 ||
    typeof envelope.profile !== "object" ||
    !envelope.profile
  )
    throw Object.assign(
      new Error("Not a profile export envelope (schemaVersion 1)."),
      { code: "profile-invalid" },
    );
  return envelope;
}

// JSON with object keys sorted: chrome.storage does not keep key order.
export function canonicalJson(value) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}

export async function seedProfile(context, id, path) {
  const envelope = validateProfileEnvelope(
    JSON.parse(await readFile(path, "utf8")),
  );
  // The profile is a synthetic export, so reading it back is safe.
  const stored = await withExtensionPage(context, id, (page) =>
    page.evaluate(async (value) => {
      await globalThis.chrome.storage.local.set({
        "careerForm.profile": value,
      });
      return (await globalThis.chrome.storage.local.get("careerForm.profile"))[
        "careerForm.profile"
      ];
    }, envelope),
  );
  if (canonicalJson(stored) !== canonicalJson(envelope))
    throw Object.assign(new Error("Profile storage verification failed."), {
      code: "profile-not-stored",
    });
}

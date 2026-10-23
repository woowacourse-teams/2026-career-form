// Tab bookkeeping that does not belong to a round: named aliases for the
// "url-substring|page text" tab specs, and the content-script recovery that a
// reinstall needs. Reinstalling the extension (`start`) leaves the old content
// script, or none, on tabs that were already open, so the next run fails with
// panel-trigger-missing until the tab is opened again at the same address.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bounded } from "./browser.mjs";
import { claimDialogs } from "./dialogs.mjs";
import {
  APPLICATION_PATH,
  brief,
  gotoStep,
  httpPages,
  onGuardedTab,
} from "./driver.mjs";
import { readStep } from "./page/hplace-step.mjs";

export const TAB_ALIASES_FILE = "tabs.json";
export const ALIAS_NAME = /^[A-Za-z0-9_-]+$/;
const aliasesPath = (reportsDir) => join(reportsDir, TAB_ALIASES_FILE);
const coded = (code, message) => Object.assign(new Error(message), { code });

// {name: "url-substring|page text"}; a missing or broken file is empty.
export async function readTabAliases(reportsDir) {
  try {
    const parsed = JSON.parse(await readFile(aliasesPath(reportsDir), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([name, spec]) => ALIAS_NAME.test(name) && typeof spec === "string",
      ),
    );
  } catch {
    return {};
  }
}

export async function writeTabAliases(reportsDir, map) {
  for (const [name, spec] of Object.entries(map)) {
    if (!ALIAS_NAME.test(name))
      throw coded("alias-invalid", "Alias names use [A-Za-z0-9_-] only.");
    if (typeof spec !== "string" || !spec.split("|")[0])
      throw coded("alias-invalid", "An alias needs a url-substring spec.");
  }
  await mkdir(reportsDir, { recursive: true, mode: 0o700 });
  await writeFile(aliasesPath(reportsDir), JSON.stringify(map, null, 1), {
    mode: 0o600,
  });
}

// An alias stands in for its stored spec; anything else is used as given.
export function resolveTabSpec(spec, aliases) {
  const key = String(spec ?? "");
  return Object.hasOwn(aliases ?? {}, key) ? aliases[key] : key;
}

// Aliases whose url-substring part matches this URL (the page-text part is
// not checked here: callers that can evaluate on the page narrow further).
export function aliasesForUrl(url, aliases) {
  return Object.entries(aliases ?? {})
    .filter(([, spec]) => url.includes(spec.split("|")[0]))
    .map(([name, spec]) => ({ name, spec, hasText: spec.includes("|") }));
}

export const LAUNCHER_SELECTOR = "[data-career-form-side-panel-launcher]";
const HPLACE_WRITE = /\/mrs2\/applicant\/resume\/writeResume/i;
const HYUNDAI_WRITE = /applyWrite/i;

// Whether the extension's content script is on the page: its floating
// launcher is the one element it always mounts. Unknown (hung tab) is false.
export async function hasContentScript(page, timeoutMs = 5000) {
  const count = await bounded(
    page.locator(LAUNCHER_SELECTOR).count(),
    timeoutMs,
    null,
  );
  return count !== null && count > 0;
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
};
export const isApplicationUrl = (url) => APPLICATION_PATH.test(pathOf(url));

// How a tab can be re-entered at its own address without losing the form.
export function reentryKind(url) {
  if (/(^|\.)recruiter\.co\.kr$/i.test(hostOf(url)) && HPLACE_WRITE.test(url))
    return "hplace-step";
  // Hyundai's applyWrite loses its body when the same address is opened
  // again; only a person can re-enter from the site's own list.
  if (/^talent\.hyundai\.com$/i.test(hostOf(url)) && HYUNDAI_WRITE.test(url))
    return "person";
  return "goto";
}

// Hplace MRS2: re-open the current step by the site's own no-save move.
async function reopenStepDefault(page, { allowHosts }) {
  const st = await bounded(page.evaluate(readStep), 8000);
  if (!st?.formPresent || !st.step)
    return { ok: false, code: "no-application-form" };
  return onGuardedTab(page, { allowHosts }, () =>
    gotoStep(page, st.step, { force: true }),
  );
}

// Other sites: navigate to the same address (hash dropped). The leave-page
// prompt is accepted only during this navigation, like a discard; a reload
// is not used because Chrome restores typed values on reload.
async function reopenAddressDefault(page) {
  const claim = claimDialogs(page);
  claim.allowLeave(true);
  try {
    await page.goto(page.url().replace(/#.*$/, ""), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    return { ok: true };
  } catch {
    return { ok: false, code: "navigation-failed" };
  } finally {
    claim.release();
  }
}

// After a reinstall or reload: every application tab without the content
// script is re-entered at its own address, then checked again. A tab that
// ends up elsewhere (an expired login bounced it to another page) stays in
// stillMissing. Only briefed URLs are reported.
export async function recoverContentScripts(
  context,
  {
    allowHosts = [],
    reopenStep = reopenStepDefault,
    reopenAddress = reopenAddressDefault,
    checkTimeoutMs = 5000,
  } = {},
) {
  const result = {
    checked: 0,
    recovered: [],
    stillMissing: [],
    needsPerson: [],
  };
  const pages = httpPages(context).filter((p) => isApplicationUrl(p.url()));
  for (const page of pages) {
    result.checked += 1;
    const url = brief(page.url());
    if (await hasContentScript(page, checkTimeoutMs)) continue;
    const kind = reentryKind(page.url());
    if (kind === "person") {
      result.needsPerson.push(url);
      continue;
    }
    const reopened = await (
      kind === "hplace-step"
        ? reopenStep(page, { allowHosts })
        : reopenAddress(page)
    ).catch(() => ({ ok: false, code: "reentry-failed" }));
    const after = page.url();
    if (
      reopened?.ok &&
      brief(after) === url &&
      (await hasContentScript(page, checkTimeoutMs))
    )
      result.recovered.push(url);
    else result.stillMissing.push(url);
  }
  return result;
}

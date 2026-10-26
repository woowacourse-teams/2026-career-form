// Drives one QA round on an application tab: dialogs claimed, writes blocked,
// mounts watched, pre-run census, clear, census, guard, the extension's real
// launcher -> 자동 기입 -> 준비하고 계속 -> N개 항목 기입하기, census again,
// then discard without saving while writes are still blocked and the guard is
// still armed (sites can autosave).
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { bounded } from "./browser.mjs";
import {
  census,
  discardResidue,
  fingerprintMap,
  stripFingerprints,
  syntheticFingerprints,
  valueFingerprints,
} from "./page/census.mjs";
import { watchMounts } from "./page/mounts.mjs";
import { clearForm } from "./page/clear.mjs";
import { installGuard } from "./page/guard.mjs";
import { readStep, submitStepNavigation } from "./page/hplace-step.mjs";
import { panelFailureCode, panelState } from "./page/panel.mjs";
import { clickTempSave } from "./page/temp-save.mjs";
import { claimDialogs } from "./dialogs.mjs";
import { keepAlivePage } from "./keepalive.mjs";
import { classifyRequest, maskFields, savePayload } from "./requests.mjs";
import { IDENTITY_FIELD } from "./sites.mjs";

const EVALUATE_MS = 8000;
const WRITE_BUTTON = /^(?:[1-9][0-9]*개 항목 기입하기|선택하지 않고 계속)$/;
const MAX_REVIEW_ROUNDS = 12;
const STAGE_RETRY_MS = 20000;
// Application forms show the applicant's own data: text dumps are refused there.
export const APPLICATION_PATH =
  /writeResume|registResume|applyWrite|\/Application\/|\/apply\b/i;

export const brief = (url) => {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
};
export const httpPages = (context) =>
  context.pages().filter((p) => /^https?:/.test(p.url()));

// Errors that go into files or the console carry a code and a fixed message.
// Playwright's own messages quote selectors, page text and URLs, so they are
// replaced (LIVE_QA_DEBUG=1 keeps them for local debugging).
export function safeError(error, fallbackCode = "harness-exception") {
  if (error?.code && error.safe !== false)
    return { code: error.code, message: error.message };
  return {
    code: error?.code ?? fallbackCode,
    message:
      process.env.LIVE_QA_DEBUG === "1"
        ? String(error?.message ?? error)
        : `Unexpected ${error?.name ?? "error"}.`,
  };
}
const coded = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });
const aborted = (review = null) =>
  coded("aborted", "The run was interrupted.", { review });

// Dry run of clearForm on every frame: what a clear would remove, as counts
// and control names (never values). A form that holds saved values must be
// cleared by a person before a round, or the extension's writes cannot be told
// apart from what was there. On Hplace MRS2 it walks steps 1-3 by no-save
// moves and returns to the step it started on.
const SAVED_COUNTS = [
  "hiddenRowIds",
  "disabledCleared",
  "searchDisplays",
  "text",
  "textarea",
  "select",
  "radioGroups",
  "checkbox",
];

// What a clear would remove from every frame (counts and control names, never
// values). `accountFields` are the identity fields the site fills from the
// login (name, email, phone): they come back after any reset. `defaultFields`
// still hold the value their HTML gave them (the site's defaults, e.g. a
// 비대상 radio or a select at its first option). `saved` counts only the
// fields that are neither.
// Hidden row ids (Hplace `...Sn`) whose row holds no other removable field:
// the server keeps such an id for an empty builder row (2026-10-23 and
// 2026-10-24 ABL step 2 `experienceBuilder.resumeBuilderSn` survived every
// reset), so it is the site's own state, not a saved value.
export function lonelyRowIds(fields) {
  const rowOf = (n) => (n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : "");
  return fields.filter((n) => {
    if (!/Sn$/.test(n)) return false;
    const row = rowOf(n);
    return !fields.some((o) => o !== n && rowOf(o) === row && !/Sn$/.test(o));
  });
}

async function dryClear(page) {
  const merged = { fields: [], defaultFields: [] };
  for (const f of page.frames()) {
    const r = await bounded(
      callInPage(f, clearForm, { dryRun: true }).catch(() => null),
      EVALUATE_MS,
    );
    if (!r) continue;
    for (const [k, v] of Object.entries(r))
      if (typeof v === "number") merged[k] = (merged[k] ?? 0) + v;
    merged.fields.push(...(r.fields ?? []));
    merged.defaultFields.push(...(r.defaultFields ?? []));
  }
  for (const n of lonelyRowIds(merged.fields))
    if (!merged.defaultFields.includes(n)) merged.defaultFields.push(n);
  merged.accountFields = merged.fields.filter((n) => IDENTITY_FIELD.test(n));
  const others = merged.fields.filter(
    (n) => !IDENTITY_FIELD.test(n) && !merged.defaultFields.includes(n),
  );
  merged.savedAny = SAVED_COUNTS.some((k) => (merged[k] ?? 0) > 0);
  merged.saved = others.length > 0;
  return merged;
}

const hplaceForm = (page, st) =>
  Boolean(
    st?.formPresent &&
    st.step &&
    /\/mrs2\/applicant\/resume\/writeResume/i.test(
      new URL(page.url()).pathname,
    ),
  );

// Dry run of clearForm on every frame: what a clear would remove, as counts
// and control names (never values). On Hplace MRS2 it walks steps 1-3 by
// no-save moves and returns to the step it started on.
export async function savedData(page, { allowHosts = [] } = {}) {
  return onGuardedTab(page, { allowHosts }, async () => {
    const st = await bounded(page.evaluate(readStep), EVALUATE_MS);
    if (!hplaceForm(page, st))
      return { how: "page", ...(await dryClear(page)) };
    const origin = st.step;
    const steps = {};
    for (const n of [1, 2, 3]) {
      const moved = await gotoStep(page, n);
      steps[n] = moved.ok ? await dryClear(page) : { error: moved.code };
    }
    const back = await gotoStep(page, origin);
    return {
      how: "hplace-steps",
      steps,
      returned: back.ok,
      saved: Object.values(steps).some((s) => s.saved === true),
    };
  });
}

// Test-account reset: clears the form in the page, then presses the site's
// own 임시저장 so the server copy is empty too, then re-opens the form from
// the server and reports what a clear would still remove. Hplace walks steps
// 1-3. Requires a site profile with a temp-save control; the guard stays
// armed in its relaxed form (submit, consent, verification and file inputs
// still blocked) and only writes to the tab's own host that carry no
// submit-like word are allowed.
export async function resetPage(page, { site, allowHosts = [] } = {}) {
  if (!site?.tempSave)
    return {
      ok: false,
      code: site ? "no-server-draft" : "site-unknown",
      message: site
        ? "This site keeps no server draft; a clear in the page is enough."
        : "No site profile for this tab.",
    };
  if (await serviceWorkerControlled(page))
    throw coded(
      "service-worker-active",
      "A service worker controls this tab; its requests cannot be blocked.",
    );
  const host = new URL(page.url()).host;
  const dialogs = claimDialogs(page);
  dialogs.allowConfirm(true);
  const blocking = await blockWrites(page, { allowHosts, saveHost: host });
  const guardEachFrame = async () => {
    for (const f of page.frames())
      await bounded(
        callInPage(f, installGuard, { allowSave: true }).catch(() => null),
        EVALUATE_MS,
      );
  };
  const disarmEachFrame = () =>
    eachFrame(page, () => {
      window.__careerFormLiveQa?.disarm?.();
      return true;
    });
  const saveRequests = () =>
    blocking.log().filter((line) => line.includes("(test-account reset save)"));
  // Form controls across frames: a login or list page after the save shows
  // as a collapse, which must not pass as "nothing left to clear".
  const controlCount = async () =>
    (
      await eachFrame(
        page,
        () => document.querySelectorAll("input, select, textarea").length,
      )
    ).reduce((a, n) => a + (Number(n) || 0), 0);
  const resetOne = async (step) => {
    const path = new URL(page.url()).pathname;
    const controlsBefore = await controlCount();
    await guardEachFrame();
    // Identity fields stay: sites refuse to temp-save without them.
    let cleared = 0;
    for (const f of page.frames()) {
      const c = await bounded(
        callInPage(f, clearForm, { keepPattern: IDENTITY_FIELD.source }).catch(
          () => null,
        ),
        EVALUATE_MS,
      );
      cleared += SAVED_COUNTS.reduce((m, k) => m + (c?.[k] ?? 0), 0);
    }
    await delay(1000);
    const seen = saveRequests().length;
    // A notice left open from an earlier save (SK keeps its popup until 확인)
    // would swallow the next click: close it first.
    if (site.tempSave.confirm) {
      const stale = await bounded(
        callInPage(page.mainFrame(), clickTempSave, site.tempSave.confirm),
        EVALUATE_MS,
        { clicked: false },
      );
      if (stale.clicked) await delay(1000);
    }
    const clicked = await bounded(
      callInPage(page.mainFrame(), clickTempSave, site.tempSave),
      EVALUATE_MS,
      { clicked: false, code: "page-unresponsive" },
    );
    let saveSeen = false;
    const confirms = [];
    if (clicked.clicked) {
      // The site may ask "임시저장하시겠습니까?" in an in-page dialog and then
      // show a "saved" notice: confirm each (at most three), and wait for the
      // save write between them.
      const deadline = Date.now() + 20000;
      let lastConfirm = 0;
      let saveSeenAt = 0;
      while (Date.now() < deadline) {
        if (!saveSeen && saveRequests().length > seen) {
          saveSeen = true;
          saveSeenAt = Date.now();
        }
        if (site.tempSave.confirm && Date.now() - lastConfirm > 1500) {
          const c = await bounded(
            callInPage(page.mainFrame(), clickTempSave, site.tempSave.confirm),
            EVALUATE_MS,
            { clicked: false, code: "page-unresponsive" },
          );
          if (c.clicked) {
            confirms.push(c.caption);
            lastConfirm = Date.now();
            if (confirms.length >= 3) break;
            continue;
          }
        }
        // After the save write, give the site's notice a few seconds to show
        // so it can be closed before the form is re-opened.
        if (
          saveSeen &&
          Date.now() - saveSeenAt > 4000 &&
          Date.now() - lastConfirm > 3000
        )
          break;
        await delay(500);
      }
      await delay(2000);
    }
    await disarmEachFrame();
    const reopened = step
      ? await gotoStep(page, step, { force: true })
      : await discardPage(page, { dialogs });
    const controlsAfter = reopened.ok ? await controlCount() : 0;
    // The site may answer the save with its login or list page (expired
    // session): then the form is gone and nothing can be reported as clean.
    const formLost =
      reopened.ok &&
      (new URL(page.url()).pathname !== path ||
        controlsAfter < controlsBefore * 0.5);
    const remaining = reopened.ok && !formLost ? await dryClear(page) : null;
    return {
      cleared,
      ...clicked,
      confirms,
      saveRequestSeen: saveSeen,
      reopened: Boolean(reopened.ok) && !formLost,
      reopenCode: !reopened.ok
        ? reopened.code
        : formLost
          ? "form-lost-after-save"
          : undefined,
      controls: { before: controlsBefore, after: controlsAfter },
      remainingFields: remaining?.fields ?? null,
      accountFields: remaining?.accountFields ?? null,
      defaultFields: remaining?.defaultFields ?? null,
      saved: remaining ? remaining.saved : null,
    };
  };
  try {
    const st = await bounded(page.evaluate(readStep), EVALUATE_MS);
    if (!hplaceForm(page, st)) {
      const result = await resetOne(null);
      return {
        ok: result.clicked && result.reopened,
        how: "page",
        ...result,
        requests: blocking.log(),
        dialogs: dialogs.log,
      };
    }
    const origin = st.step;
    const steps = {};
    for (const n of [1, 2, 3]) {
      const moved = await gotoStep(page, n);
      steps[n] = moved.ok ? await resetOne(n) : { error: moved.code };
    }
    const back = await gotoStep(page, origin);
    const all = Object.values(steps);
    return {
      ok: all.every((s) => s.clicked && s.reopened),
      how: "hplace-steps",
      steps,
      returned: back.ok,
      saved: all.some((s) => s.saved === true),
      requests: blocking.log(),
      dialogs: dialogs.log,
    };
  } finally {
    await disarmEachFrame();
    await blocking.release();
    dialogs.allowConfirm(false);
    dialogs.release();
  }
}

// Runs fn while every other application tab (not the one being driven) gets
// keepAlivePage every `everyMinutes`. Results are appended to fn's result as
// `keepalive`; errors are recorded, never thrown. 0 minutes: just fn.
export async function withKeepalive(
  context,
  page,
  fn,
  { everyMinutes = 10, thresholdMinutes = 30 } = {},
) {
  if (!everyMinutes) return fn();
  const log = [];
  let running = false;
  const tick = async () => {
    for (const p of httpPages(context)) {
      if (p === page) continue;
      let path;
      try {
        path = new URL(p.url()).pathname;
      } catch {
        continue;
      }
      if (!APPLICATION_PATH.test(path)) continue;
      const result = await keepAlivePage(p, { thresholdMinutes }).catch(
        (error) => ({
          action: "error",
          code: error?.code ?? "keepalive-error",
        }),
      );
      log.push({
        at: new Date().toISOString(),
        tab: brief(p.url()),
        action: result.action,
        ...(result.code ? { code: result.code } : {}),
      });
    }
  };
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    tick()
      .catch(() => {})
      .finally(() => {
        running = false;
      });
  }, everyMinutes * 60000);
  try {
    const result = await fn();
    return result && typeof result === "object" && !Array.isArray(result)
      ? { ...result, keepalive: log }
      : result;
  } finally {
    clearInterval(timer);
  }
}

// Clicks one of the extension panel's controls. A failure becomes a coded
// error: Playwright's message would quote the page.
async function press(locator, code, signal, review = null) {
  if (signal?.aborted) throw aborted(review);
  await locator.click({ timeout: 10000 }).catch(() => {
    throw coded(code, "An extension panel control could not be clicked.", {
      review,
    });
  });
}

// Requests from a service worker skip page.route, so such a tab is refused.
export async function serviceWorkerControlled(page) {
  for (const f of page.frames()) {
    const controlled = await bounded(
      f.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
      EVALUATE_MS,
      true,
    );
    if (controlled) return true;
  }
  return false;
}

// Blocks every write the page sends except read-only lookups (requests.mjs).
// The log is counted per method, host and path. recordSaves (test-account
// runs): the bodies of blocked save-like writes to the tab's own host are
// kept in memory (requests.mjs savePayload) and returned by saves().
export async function blockWrites(
  page,
  { allowHosts = [], saveHost = null, recordSaves = false } = {},
) {
  const counts = {};
  const saves = [];
  let tabHost = null;
  try {
    tabHost = new URL(page.url()).host;
  } catch {
    tabHost = null;
  }
  const handler = (route) => {
    const r = route.request();
    const request = {
      method: r.method(),
      url: r.url(),
      headers: r.headers(),
      postData: r.postData(),
    };
    const verdict = classifyRequest(request, { allowHosts, saveHost });
    if (verdict.log) counts[verdict.log] = (counts[verdict.log] ?? 0) + 1;
    if (verdict.action === "block" && recordSaves && tabHost) {
      try {
        const payload = savePayload(request, { tabHost });
        if (payload) saves.push(payload);
      } catch {
        // A malformed body is not recorded.
      }
    }
    return (
      verdict.action === "block" ? route.abort() : route.continue()
    ).catch(() => {});
  };
  await page.route("**/*", handler);
  return {
    log: () =>
      Object.entries(counts).map(([line, n]) =>
        n > 1 ? `${line} x${n}` : line,
      ),
    saves: () => saves.slice(),
    release: () => page.unroute("**/*", handler).catch(() => {}),
  };
}

// For commands that move a tab outside a round (step, discard): the same
// service-worker refusal, dialog claim and write blocking as a round.
export async function onGuardedTab(page, { allowHosts = [] } = {}, fn) {
  if (await serviceWorkerControlled(page))
    throw coded(
      "service-worker-active",
      "A service worker controls this tab; its requests cannot be blocked.",
    );
  const dialogs = claimDialogs(page);
  const blocking = await blockWrites(page, { allowHosts });
  try {
    return {
      ...(await fn(dialogs)),
      requests: blocking.log(),
      dialogs: dialogs.log,
    };
  } finally {
    await blocking.release();
    dialogs.release();
  }
}

// A tab is addressed by "url-substring" or "url-substring|page-text". The text
// check returns a boolean only. Exactly one tab must match.
export async function pageAt(context, spec) {
  const [urlPart, textPart] = String(spec).split("|");
  let matches = httpPages(context).filter((p) => p.url().includes(urlPart));
  if (textPart) {
    const keep = [];
    for (const p of matches)
      if (
        await p
          .evaluate((t) => document.body.innerText.includes(t), textPart)
          .catch(() => false)
      )
        keep.push(p);
    matches = keep;
  }
  if (matches.length !== 1)
    throw Object.assign(
      new Error(
        `tab '${spec}' matched ${matches.length}: ${matches.map((p) => brief(p.url())).join(", ")}`,
      ),
      {
        code: "tab-not-unique",
      },
    );
  return matches[0];
}

// Calls a self-contained page function with several arguments. Playwright's
// evaluate passes one argument and serializes the function, so the call is
// built as one expression from the function source and JSON arguments.
export function callInPage(target, fn, ...args) {
  return target.evaluate(
    `(${fn.toString()})(${args.map((a) => JSON.stringify(a ?? null)).join(", ")})`,
  );
}

// Frames are keyed "main" or "<origin+path>#<n>" (n-th frame with that URL),
// so same-URL iframes never share fingerprints. Control indexes run across
// all frames, so `i` is unique on the page (companionOf follows the same
// numbering). `regions` asks the main frame for its capture regions.
export async function framesCensus(
  page,
  {
    prior = null,
    known = null,
    synthetic = [],
    salt = "",
    includeHidden = false,
    recordValues = false,
    regions = false,
  } = {},
) {
  const frames = [];
  const seen = {};
  const total = {};
  for (const f of page.frames()) {
    const url = brief(f.url());
    total[url] = (total[url] ?? 0) + 1;
  }
  let offset = 0;
  for (const f of page.frames()) {
    const main = f === page.mainFrame();
    const url = brief(f.url());
    seen[url] = (seen[url] ?? 0) + 1;
    const key = main ? "main" : `${url}#${seen[url]}`;
    // Frames that share a URL cannot be matched to the baseline reliably, and
    // a frame missing from the pre-run value set has no `known`: in both cases
    // none of its values can be shown (fail closed).
    const ambiguous = !main && total[url] > 1;
    const options = {
      salt,
      includeHidden,
      synthetic,
      known: known && !ambiguous ? (known[key] ?? null) : null,
      recordValues,
      identityPattern: recordValues ? IDENTITY_FIELD.source : null,
      regions: regions && main,
    };
    const r = await bounded(
      callInPage(
        f,
        census,
        ambiguous ? null : (prior?.[key] ?? null),
        options,
      ).catch(() => null),
      EVALUATE_MS,
    );
    if (r && r.controls.length) {
      for (const c of r.controls) {
        c.i += offset;
        if (c.companionOf !== undefined) c.companionOf += offset;
      }
      if (r.regions) {
        for (const s of r.regions.sections)
          s.controls = s.controls.map((i) => i + offset);
        for (const c of r.regions.unsectioned) c.i += offset;
      }
      offset += r.controls.length;
      frames.push({ frame: url, key, main, ...r });
    }
  }
  return frames;
}
export const framesPrior = (frames) =>
  Object.fromEntries(frames.map((f) => [f.key, fingerprintMap(f)]));
export const framesKnown = (frames) =>
  Object.fromEntries(frames.map((f) => [f.key, valueFingerprints([f])]));

async function eachFrame(page, fn) {
  const out = [];
  for (const f of page.frames()) {
    const r = await bounded(
      f.evaluate(fn).catch(() => null),
      EVALUATE_MS,
    );
    if (r) out.push(r);
  }
  return out;
}

async function openPanel(page) {
  const host = page.locator("career-form-profile-panel");
  if (!(await host.isVisible().catch(() => false))) {
    await page
      .locator("[data-career-form-side-panel-launcher]")
      .getByRole("button", { name: "프로필 사이드바 열기", exact: true })
      .click({ timeout: 20000 })
      .catch(() => {
        throw coded(
          "launcher-missing",
          "Extension launcher not found on the tab.",
        );
      });
  }
  await host
    .getByRole("button", { name: "자동 기입", exact: true })
    .click({ timeout: 20000 })
    .catch(() => {
      throw coded("panel-trigger-missing", "자동 기입 trigger not found.");
    });
  return host;
}

// Includes every "확인 필요" item when approveReview is on, then writes.
async function reviewRound(host, approveReview, review, signal) {
  const reviewTab = host.getByRole("tab", { name: /^확인 필요/ });
  if (await reviewTab.isVisible().catch(() => false))
    await press(reviewTab, "review-tab-click-failed", signal, review);
  if (approveReview) {
    const includes = host.locator(
      'section[role="tabpanel"][aria-label="확인 필요한 항목"] button:enabled[aria-label$=" 포함하기"]',
    );
    const count = await includes.count().catch(() => 0);
    for (let k = 0; k < count; k++) {
      const button = includes.first();
      const label = (
        await button.getAttribute("aria-label").catch(() => null)
      )?.replace(/ 포함하기$/, "");
      await press(button, "review-include-click-failed", signal, review);
      if (label) review.approved.push(label);
    }
  }
}

// Whether the guard (page/guard.mjs) caught a forbidden action in any frame.
async function guardTripped(page) {
  for (const f of page.frames())
    if (
      await bounded(
        f.evaluate(() => window.__careerFormLiveQa?.passed === false),
        EVALUATE_MS,
        false,
      )
    )
      return true;
  return false;
}

// Guard counters of every frame, summed. null when no frame has a guard.
async function guardSummary(page) {
  const states = await eachFrame(page, () => {
    const g = window.__careerFormLiveQa;
    return g
      ? {
          passed: g.passed,
          forbiddenClicks: g.forbiddenClicks,
          blocked: g.blocked,
          formSubmissions: g.formSubmissions,
        }
      : null;
  });
  if (!states.length) return null;
  return {
    passed: states.every((g) => g.passed),
    forbiddenClicks: states.reduce((n, g) => n + g.forbiddenClicks, 0),
    formSubmissions: states.reduce((n, g) => n + g.formSubmissions, 0),
    blocked: states.flatMap((g) => g.blocked).slice(0, 20),
    frames: states.length,
  };
}

// Drives the panel to a terminal screen. Preparation and review screens can
// come back several times (search follow-ups); each new appearance is handled once.
export async function driveRound(
  page,
  { timeoutMs = 240000, approveReview = true, signal = null } = {},
) {
  if (signal?.aborted) throw aborted();
  const host = await openPanel(page);
  const review = { rounds: 0, approved: [] };
  const deadline = Date.now() + timeoutMs;
  let lastStage = null;
  let handled = null;
  let handledAt = 0;
  let retries = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw aborted(review);
    if (await guardTripped(page))
      throw coded("guard-failed", "A forbidden site action was blocked.", {
        review,
      });
    const state = await bounded(page.evaluate(panelState), EVALUATE_MS, {
      stage: "unknown",
    });
    const failure = panelFailureCode(state);
    if (failure)
      throw coded(failure, "The extension panel ended in an error state.", {
        panel: state,
        review,
      });
    if (state.stage === "result") return review;
    if (state.stage !== lastStage) {
      lastStage = state.stage;
      handled = null;
      retries = 0;
    }
    if (handled === null && state.stage === "preparation-review") {
      await press(
        host.getByRole("button", { name: "준비하고 계속", exact: true }),
        "prepare-click-failed",
        signal,
        review,
      );
      handled = state.stage;
      handledAt = Date.now();
    } else if (
      handled === null &&
      state.stage === "review" &&
      state.writeEnabled
    ) {
      if (++review.rounds > MAX_REVIEW_ROUNDS)
        throw coded(
          "review-loop-limit",
          "The panel kept returning to review.",
          {
            review,
          },
        );
      await reviewRound(host, approveReview, review, signal);
      await press(
        host.getByRole("button", { name: WRITE_BUTTON }),
        "write-click-failed",
        signal,
        review,
      );
      handled = state.stage;
      handledAt = Date.now();
    } else if (
      handled !== null &&
      state.stage === handled &&
      Date.now() - handledAt > STAGE_RETRY_MS
    ) {
      if (++retries > 2)
        throw coded("panel-not-advancing", "The panel did not advance.", {
          review,
        });
      handled = null;
      if (state.stage === "review") review.rounds--;
    }
    await delay(250);
  }
  throw coded("run-timeout", "Round timed out.", { review });
}

async function settleForm(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    const state = await bounded(page.evaluate(readStep), EVALUATE_MS);
    const count = state?.formPresent ? state.controls : -1;
    if (count > 0 && count === last) {
      if (++stable >= 2) return { settled: true, controls: count };
    } else stable = 0;
    last = count;
    await delay(500);
  }
  return { settled: false, controls: Math.max(last, 0) };
}

// Hplace MRS2: move a tab to a step without saving. `force` re-opens the same
// step, which reloads it from the server and drops unsaved values.
export async function gotoStep(
  page,
  step,
  { force = false, timeoutMs = 30000 } = {},
) {
  const before = await bounded(page.evaluate(readStep), EVALUATE_MS);
  if (!before?.formPresent) return { ok: false, code: "no-application-form" };
  if (!force && before.step === step)
    return { ok: true, step, navigated: false };
  if (!before.navigable) return { ok: false, code: "navigation-keys-missing" };
  const marker = randomBytes(6).toString("hex");
  const marked = await bounded(
    page.evaluate((value) => {
      window.__careerFormLiveQaNavigation = value;
      return true;
    }, marker),
    EVALUATE_MS,
    false,
  );
  if (!marked) return { ok: false, code: "page-unresponsive" };
  const submitted = await bounded(
    page.evaluate(submitStepNavigation, step),
    EVALUATE_MS,
    { ok: true },
  );
  if (!submitted?.ok)
    return submitted ?? { ok: false, code: "navigation-failed" };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const after = await bounded(page.evaluate(readStep), EVALUATE_MS);
    if (after?.formPresent && after.marker !== marker && after.step === step) {
      const settled = await settleForm(
        page,
        Math.max(1000, deadline - Date.now()),
      );
      return { ok: true, step, navigated: true, ...settled };
    }
    if (Date.now() > deadline)
      return {
        ok: false,
        code:
          after?.marker === marker
            ? "navigation-not-started"
            : "step-not-reached",
      };
    await delay(500);
  }
}

// Drops unsaved values: Hplace re-opens the same step by no-save POST, other
// sites navigate to the same URL again. A reload is not enough: Chrome
// restores typed form values on reload, and the 2026-10-21 QA found synthetic
// values back on Greeting forms after one. The leave-page prompt is the only
// dialog accepted, and only while the discard runs.
export async function discardPage(page, { dialogs = null } = {}) {
  const claim = dialogs ?? claimDialogs(page);
  claim.allowLeave(true);
  try {
    if (
      /\/mrs2\/applicant\/resume\/writeResume/i.test(
        new URL(page.url()).pathname,
      )
    ) {
      const st = await bounded(page.evaluate(readStep), EVALUATE_MS);
      if (!st?.step)
        return { how: "hplace-step", ok: false, code: "step-unknown" };
      return {
        how: "hplace-step",
        ...(await gotoStep(page, st.step, { force: true })),
      };
    }
    // A same-document move (URL with #) would keep the values: drop the hash
    // and confirm through a marker that a new document was loaded.
    const marker = randomBytes(6).toString("hex");
    // Without the marker a same-document move would look like a new document.
    const planted = await bounded(
      page.evaluate((m) => {
        window.__careerFormLiveQaDiscard = m;
        return true;
      }, marker),
      EVALUATE_MS,
      false,
    );
    if (planted !== true)
      return { how: "navigate", ok: false, code: "page-unresponsive" };
    const target = new URL(page.url());
    target.hash = "";
    try {
      await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
    } catch (error) {
      return {
        how: "navigate",
        ok: false,
        code: `navigation-failed:${error?.name ?? "Error"}`,
      };
    }
    await delay(2500);
    const left = await bounded(
      page.evaluate(() => window.__careerFormLiveQaDiscard ?? null),
      EVALUATE_MS,
    );
    if (left === marker)
      return { how: "navigate", ok: false, code: "same-document" };
    return { how: "navigate", ok: true };
  } finally {
    claim.allowLeave(false);
    if (!dialogs) claim.release();
  }
}

// Capture plan from the main frame's census regions (census.mjs `regions`):
// one clip per section container, chunks of `chunk` px for controls outside
// any section (the whole document when no section was found), and sections
// taller than maxHeight split into numbered pieces. Clips stay inside the
// document. Pure, so the layout rules are testable without a browser.
export function planCaptures(regions, { chunk = 1200, maxHeight = 4000 } = {}) {
  if (!regions) return [];
  const width = Math.max(1, Math.round(regions.document?.width ?? 0));
  const height = Math.max(1, Math.round(regions.document?.height ?? 0));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const out = [];
  const push = (name, rect, controls) => {
    const x = clamp(Math.round(rect.left), 0, width - 1);
    const y = clamp(Math.round(rect.top), 0, height - 1);
    const w = clamp(
      Math.round(rect.width) - (x - Math.round(rect.left)),
      1,
      width - x,
    );
    const h = clamp(
      Math.round(rect.height) - (y - Math.round(rect.top)),
      1,
      height - y,
    );
    out.push({ name, clip: { x, y, width: w, height: h }, controls });
  };
  const sections = (regions.sections ?? []).filter(
    (s) => s.rect && s.rect.width > 0 && s.rect.height > 0,
  );
  sections.forEach((s, n) => {
    const name = s.name || `section ${n + 1}`;
    const pieces = Math.ceil(s.rect.height / maxHeight);
    for (let k = 0; k < pieces; k++)
      push(
        pieces > 1 ? `${name} (${k + 1})` : name,
        {
          left: s.rect.left,
          top: s.rect.top + k * maxHeight,
          width: s.rect.width,
          height: Math.min(maxHeight, s.rect.height - k * maxHeight),
        },
        s.controls ?? [],
      );
  });
  const loose = regions.unsectioned ?? [];
  if (!sections.length || loose.length) {
    const chunks = Math.ceil(height / chunk);
    for (let k = 0; k < chunks; k++) {
      const top = k * chunk;
      const controls = loose
        .filter((c) => c.top >= top && c.top < top + chunk)
        .map((c) => c.i);
      if (sections.length && !controls.length) continue;
      push(
        `step ${k + 1}`,
        { left: 0, top, width, height: Math.min(chunk, height - top) },
        controls,
      );
    }
  }
  return out;
}

// Writes one PNG per planned clip into captureDir (0700, files 0600) and
// returns the run.json `captures` contract: paths relative to the out dir.
async function captureSections(page, frames, captureDir) {
  const plan = planCaptures(frames.find((f) => f.main)?.regions ?? null);
  if (!plan.length)
    throw coded("no-capture-regions", "No region to capture was found.");
  await mkdir(captureDir, { recursive: true, mode: 0o700 });
  await chmod(captureDir, 0o700);
  const dir = basename(captureDir);
  const captures = [];
  for (const [k, c] of plan.entries()) {
    const file = `${String(k + 1).padStart(2, "0")}.png`;
    const buffer = await page.screenshot({
      clip: c.clip,
      fullPage: true,
      timeout: 20000,
    });
    await writeFile(join(captureDir, file), buffer, { mode: 0o600 });
    captures.push({
      file: `${dir}/${file}`,
      name: c.name,
      frame: "main",
      controls: c.controls,
    });
  }
  return captures;
}

export async function runPage(
  page,
  {
    label,
    clear = true,
    approveReview = true,
    timeoutMs = 300000,
    allowHosts = [],
    build = null,
    signal = null,
    profile = null,
    // Test-account mode: values are recorded (identity fields masked), the
    // bodies of blocked save requests are kept, and section captures are
    // written to captureDir (absolute; null disables captures).
    recordValues = false,
    captureDir = null,
  },
) {
  if (await serviceWorkerControlled(page))
    throw coded(
      "service-worker-active",
      "A service worker controls this tab; its requests cannot be blocked.",
    );
  // Per-run secret for value fingerprints. It never leaves this process.
  const salt = randomBytes(16).toString("hex");
  // Synthetic values may be shown even when the page already held them.
  const synthetic = profile ? syntheticFingerprints(salt, profile) : [];
  const consoleLines = [];
  const onConsole = (m) => {
    const t = m.text();
    if (t.startsWith("[CareerForm]")) consoleLines.push(t.slice(0, 300));
  };
  const dialogs = claimDialogs(page);
  page.on("console", onConsole);
  const blocking = await blockWrites(page, {
    allowHosts,
    recordSaves: recordValues,
  });
  const capturing = recordValues && Boolean(captureDir);
  const started = Date.now();
  let error = null;
  let review = null;
  let before = [];
  let after = [];
  let discarded;
  let cleared = null;
  let initial = [];
  let session = null;
  let stepBefore = null;
  let captures = null;
  let captureError = null;
  try {
    // A long round must not run into a session timeout.
    session = await keepAlivePage(page).catch(() => null);
    stepBefore =
      (await bounded(page.evaluate(readStep), EVALUATE_MS))?.step ?? null;
    // From here on every control is either in the pre-run value set or
    // marked with the value it was mounted with (never shown).
    await eachFrame(page, watchMounts);
    // Every value on the page before the run, hidden controls included. Kept
    // in memory: no value from this set is shown unless the run wrote the
    // same synthetic value, and the discard is checked against it.
    initial = await framesCensus(page, {
      salt,
      includeHidden: true,
      recordValues,
    });
    if (signal?.aborted) throw aborted();
    if (clear) cleared = await eachFrame(page, clearForm);
    if (clear) await delay(1500);
    before = await framesCensus(page, { salt, recordValues });
    await eachFrame(page, installGuard);
    try {
      review = await driveRound(page, { timeoutMs, approveReview, signal });
    } catch (e) {
      error = { ...safeError(e), panel: e.panel };
      review = e.review ?? null;
    }
    await delay(1500);
    await eachFrame(page, () => {
      window.__careerFormLiveQaMounts?.flush();
      return true;
    });
    after = await framesCensus(page, {
      prior: framesPrior(before),
      known: framesKnown(initial),
      synthetic,
      salt,
      recordValues,
      regions: capturing,
    });
    // Captures come right after the census, before the discard, with the
    // guard still armed and writes still blocked. A capture failure is
    // recorded and never fails the run. An interrupted run skips them.
    if (capturing && !signal?.aborted) {
      try {
        captures = await captureSections(page, after, captureDir);
      } catch (e) {
        captureError = { code: safeError(e, "capture-failed").code };
      }
    }
  } catch (e) {
    error = error ?? safeError(e);
  }
  for (const f of after) delete f.regions;
  // Cleanup always runs: read the panel and guard, then discard while writes
  // are still blocked and the guard is still armed, then disarm and unblock.
  const panel = await bounded(page.evaluate(panelState), EVALUATE_MS);
  const guard = await guardSummary(page);
  await eachFrame(page, () => {
    window.__careerFormLiveQaMounts?.disconnect();
    return true;
  });
  try {
    discarded = await discardPage(page, { dialogs });
    const stepAfter =
      (await bounded(page.evaluate(readStep), EVALUATE_MS))?.step ?? null;
    discarded.residue = discardResidue(
      initial,
      await framesCensus(page, { salt, includeHidden: true }),
      { stepBefore, stepAfter },
    );
    if (!discarded.ok) discarded.residue.verified = false;
  } catch (e) {
    discarded = {
      ok: false,
      ...safeError(e, "discard-exception"),
      residue: { verified: false },
    };
  }
  // A same-document page (failed discard) still holds the guard.
  await eachFrame(page, () => {
    window.__careerFormLiveQa?.disarm?.();
    return true;
  });
  await blocking.release();
  dialogs.release();
  page.off("console", onConsole);
  return {
    label,
    url: brief(page.url()),
    build,
    session,
    testAccount: recordValues,
    seconds: Math.round((Date.now() - started) / 1000),
    cleared,
    error,
    panel,
    guard,
    review,
    requests: blocking.log(),
    dialogs: dialogs.log,
    discarded,
    // Files never get fingerprints or keys.
    before: stripFingerprints(before),
    after: stripFingerprints(after),
    console: consoleLines,
    // Test accounts only: the values the site would have stored (identity
    // fields masked) and the section captures.
    ...(recordValues
      ? {
          savePayloads: blocking.saves().map((s) => ({
            path: s.path,
            fieldCount: Object.keys(s.fields).length,
            fields: maskFields(s.fields, IDENTITY_FIELD),
          })),
        }
      : {}),
    ...(capturing
      ? captureError
        ? { captureError }
        : { captures: captures ?? [] }
      : {}),
  };
}

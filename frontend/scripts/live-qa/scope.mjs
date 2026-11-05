// Measurement scope: a person decides how many application tabs of each
// static-mapping platform (Hplace MRS2, Greeting, SK, Hyundai) a round
// covers. Generic sites are shown but out of scope for now. The choice is
// written to <out>/scope.json and census/run refuse tabs outside it.
import { brief } from "./driver.mjs";
import { siteFor } from "./sites.mjs";

export const PLATFORMS = ["hplace", "greeting", "sk", "hyundai"];
export const SCOPE_FILE = "scope.json";

// Page function: whether the posting shows a fixed closing phrase, how many
// form controls the page holds and whether its path is an application form
// (options.applicationPattern, a regex source). No value is read.
export function postingStatus(options) {
  const opts = options ?? {};
  const body = document.body;
  const text = String(body?.innerText ?? body?.textContent ?? "").slice(
    0,
    200000,
  );
  const closed =
    /마감되었습니다|접수가\s*종료|지원\s*기간이\s*아닙|모집이\s*종료|마감된\s*공고/.test(
      text,
    );
  const application = opts.applicationPattern
    ? new RegExp(opts.applicationPattern, "i").test(location.pathname)
    : false;
  return {
    closed,
    controls: document.querySelectorAll("input, select, textarea").length,
    application,
  };
}

export const platformOf = (url) => siteFor(url)?.id ?? "generic";

// open | closed | list-page (not an application path) | unknown.
export function tabStatus(status) {
  if (!status) return "unknown";
  if (status.closed) return "closed";
  if (!status.application) return "list-page";
  return status.controls > 0 ? "open" : "unknown";
}

export const describeTab = (url, status) => ({
  platform: platformOf(url),
  tab: brief(url),
  status: tabStatus(status),
});

const coded = (code, message) => Object.assign(new Error(message), { code });

// "--pick hplace=2,greeting=1,sk=1,hyundai=0"
export function parsePick(text) {
  const out = {};
  const parts = String(text ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) throw coded("invalid-pick", "Empty --pick.");
  for (const part of parts) {
    const m = /^([a-z]+)=(\d+)$/.exec(part);
    if (!m || !PLATFORMS.includes(m[1]) || m[1] in out)
      throw coded(
        "invalid-pick",
        `--pick takes platform=count pairs for ${PLATFORMS.join(", ")} once each.`,
      );
    out[m[1]] = Number(m[2]);
  }
  return out;
}

export function openCounts(tabs) {
  const counts = {};
  for (const p of PLATFORMS)
    counts[p] = tabs.filter(
      (t) => t.platform === p && t.status === "open",
    ).length;
  return counts;
}

// The first N open tabs of each platform, in list order.
export function pickScope(tabs, pick) {
  const picked = [];
  const short = {};
  for (const [platform, wanted] of Object.entries(pick)) {
    const open = tabs.filter(
      (t) => t.platform === platform && t.status === "open",
    );
    for (const t of open.slice(0, wanted))
      picked.push({ platform, tab: t.tab });
    if (open.length < wanted) short[platform] = { wanted, open: open.length };
  }
  return {
    picked,
    closed: tabs
      .filter((t) => t.status === "closed")
      .map((t) => ({ platform: t.platform, tab: t.tab })),
    ...(Object.keys(short).length ? { short } : {}),
  };
}

// Tabs named by spec ("url-substring" or "url-substring|text"); the spec is
// kept as given so census/run can use it.
export function scopeFromSpecs(tabs, specs) {
  const picked = [];
  for (const spec of specs) {
    const urlPart = String(spec).split("|")[0];
    const match = tabs.find((t) => t.tab.includes(urlPart));
    if (!match) throw coded("tab-not-found", "No open tab matches a spec.");
    if (match.platform === "generic")
      throw coded(
        "platform-out-of-scope",
        "Generic sites are outside this round's scope.",
      );
    picked.push({ platform: match.platform, tab: spec });
  }
  return {
    picked,
    closed: tabs
      .filter((t) => t.status === "closed")
      .map((t) => ({ platform: t.platform, tab: t.tab })),
  };
}

export function renderScopeTable(tabs) {
  const lines = tabs.map(
    (t) =>
      `${t.platform}\t${t.tab}\t${t.status}${t.platform === "generic" ? "\t범위 밖(이번 Issue 제외)" : ""}`,
  );
  const counts = openCounts(tabs);
  lines.push(`open: ${PLATFORMS.map((p) => `${p}=${counts[p]}`).join(" ")}`);
  return lines.join("\n");
}

// A tab is in scope when its URL contains the url part of a picked spec.
// Without a scope file everything is.
export function inScope(url, scope) {
  if (!scope) return true;
  return (scope.picked ?? []).some((p) =>
    String(url).includes(String(p.tab).split("|")[0]),
  );
}

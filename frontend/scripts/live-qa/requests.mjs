// Decides what happens to a request the page sends during a QA round.
// Fail closed: every write (anything but GET/HEAD/OPTIONS) to a site is
// blocked unless it is one of the read-only lookups below, seen on the live
// sites on 2026-10-21. Analytics writes are blocked too.
// Logs carry the method, host and path only, never the query or body.

const READ_METHODS = ["GET", "HEAD", "OPTIONS"];
// Words that mark a save, submit, consent or verification step. A lookup whose
// query carries one is blocked.
export const MUTATION_WORDS =
  /save|submit|temp|draft|complete|insert|update|upload|delete|remove|regist|apply|final|confirm|agree|consent|verify|cert|auth|sms|otp|send|writeResume/i;
const HPLACE_HOST = /(^|\.)recruiter\.co\.kr$/i;
// Read-only POST endpoints a round needs.
const LOOKUPS = [
  // Hplace MRS2 code searches (school, major, license, language exam).
  {
    reason: "hplace-code-lookup",
    host: HPLACE_HOST,
    path: /^\/com\/code\/retrieve[A-Za-z]+List$/,
  },
  // Hplace step data, loaded by the form after a step move (saving goes to
  // /mrs2/applicant/resume/saveStepN).
  {
    reason: "hplace-step-data",
    host: HPLACE_HOST,
    path: /^\/mrs2\/applicant\/resume\/step[1-5]\.json$/,
  },
  // Hplace notice popups (getMain, getResumeStart, getResumeEnd).
  {
    reason: "hplace-notice-popup",
    host: HPLACE_HOST,
    path: /^\/app\/noticePopup\/get(?:Main|ResumeStart|ResumeEnd)$/,
  },
  // SK search popups.
  {
    reason: "sk-lookup",
    host: /^www\.skcareers\.com$/i,
    path: /^\/Application\/(?:School|Major|License|ForeignExam|Company)List$/,
  },
];
// The harness's own Hplace move (page/hplace-step.mjs): exactly these three
// keys, steps 1-4.
const HPLACE_STEP_NAVIGATION =
  /^resumeSn=[A-Za-z0-9_-]{1,64}&recruitNoticeSn=[A-Za-z0-9_-]{1,64}&step=[1-4]$/;
const WRITE_RESUME = /^\/mrs2\/applicant\/resume\/writeResume$/;
// A Next.js server action is a POST to the page URL with a Next-Action
// header. Greeting uses it for school and major searches, whose bodies were
// 12-43 bytes of search arguments.
const GREETING_APPLY = /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?o\/\d+\/apply$/;
const APPLICATION_CONTENT =
  /basicInformation|email|phone|resume|attachment|portfolio|answer|agree|consent|submit|draft|temp|save/i;
export const LOOKUP_BODY_LIMIT = 200;

// A lookup body: a JSON array of short strings and numbers, or of flat objects
// holding only those. Booleans, nesting and anything else are not lookups.
function lookupArguments(body) {
  let args;
  try {
    args = JSON.parse(body);
  } catch {
    return false;
  }
  const primitive = (v) =>
    v === null ||
    (typeof v === "string" && v.length <= 60) ||
    (typeof v === "number" && Number.isFinite(v));
  return (
    Array.isArray(args) &&
    args.length > 0 &&
    args.every(
      (a) =>
        primitive(a) ||
        (a &&
          typeof a === "object" &&
          !Array.isArray(a) &&
          Object.values(a).every(primitive)),
    )
  );
}

// Never allowed, even while a test-account reset saves: anything that could
// submit, consent, verify or finish an application.
export const SUBMIT_WORDS =
  /final|submit|apply|oath|agree|consent|verify|cert|auth|sms|otp|complete|logout/i;

// options.saveHost (test-account reset only): writes to that one host are
// allowed unless path or query carry a SUBMIT_WORDS word. Other hosts keep
// the normal fail-closed rules.
export function classifyRequest(
  { method, url, headers = {}, postData = null },
  { allowHosts = [], saveHost = null } = {},
) {
  const verb = String(method).toUpperCase();
  if (READ_METHODS.includes(verb))
    return { action: "pass", reason: "read", log: null };
  const u = new URL(url);
  if (u.protocol === "chrome-extension:" || allowHosts.includes(u.host))
    return { action: "pass", reason: "trusted-host", log: null };
  const where = `${verb} ${u.host}${u.pathname}`;
  const block = (reason) => ({
    action: "block",
    reason,
    log: `BLOCKED ${where} (${reason})`,
  });
  const allow = (reason, note = reason) => ({
    action: "allow",
    reason,
    log: `allowed ${where} (${note})`,
  });
  if (verb !== "POST") return block("write-method");
  let query = u.search;
  try {
    query = decodeURIComponent(query);
  } catch {
    // Malformed escapes: test the raw query.
  }
  if (saveHost && u.host === saveHost) {
    if (SUBMIT_WORDS.test(u.pathname) || SUBMIT_WORDS.test(query))
      return block("submit-like-during-reset");
    return allow("reset-save", "test-account reset save");
  }
  if (MUTATION_WORDS.test(query)) return block("mutation-query");
  for (const lookup of LOOKUPS)
    if (lookup.host.test(u.host) && lookup.path.test(u.pathname))
      return allow(lookup.reason);
  if (
    HPLACE_HOST.test(u.host) &&
    WRITE_RESUME.test(u.pathname) &&
    typeof postData === "string" &&
    HPLACE_STEP_NAVIGATION.test(postData)
  )
    return allow("hplace-step-navigation", "no-save step navigation");
  const serverAction = Object.keys(headers).some(
    (name) => name.toLowerCase() === "next-action",
  );
  if (serverAction && GREETING_APPLY.test(u.pathname)) {
    // An unreadable (null) or empty body is not a lookup.
    if (typeof postData !== "string" || postData === "")
      return block("next-action-unreadable-body");
    const bytes = new TextEncoder().encode(postData).length;
    if (
      bytes <= LOOKUP_BODY_LIMIT &&
      !APPLICATION_CONTENT.test(postData) &&
      lookupArguments(postData)
    )
      return allow("next-action-lookup", `next-action lookup, body ${bytes}B`);
    return block("next-action-not-lookup");
  }
  return block("not-allowlisted");
}

// Test-account runs only: the body of a blocked save-like write (POST/PUT to
// the tab's own host whose path or query mentions save/temp/draft/store),
// as {name: value} one level deep, so the values the site would have stored
// can be compared with what the DOM shows. Values are cut at 200 characters.
export const SAVE_PATH = /save|temp|draft|store/i;
const VALUE_LIMIT = 200;

export function savePayload(
  { method, url, headers = {}, postData = null },
  { tabHost },
) {
  const verb = String(method).toUpperCase();
  if (verb !== "POST" && verb !== "PUT") return null;
  const u = new URL(url);
  if (u.host !== tabHost) return null;
  let query = u.search;
  try {
    query = decodeURIComponent(query);
  } catch {
    // Malformed escapes: test the raw query.
  }
  if (!SAVE_PATH.test(u.pathname) && !SAVE_PATH.test(query)) return null;
  const path = u.origin + u.pathname;
  const fields = {};
  if (typeof postData !== "string" || postData === "") return { path, fields };
  const type = String(
    Object.entries(headers).find(
      ([k]) => k.toLowerCase() === "content-type",
    )?.[1] ?? "",
  ).toLowerCase();
  const cut = (v) => String(v).slice(0, VALUE_LIMIT);
  if (type.includes("json") || /^\s*[{[]/.test(postData)) {
    let parsed;
    try {
      parsed = JSON.parse(postData);
    } catch {
      return { path, fields };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      for (const [k, v] of Object.entries(parsed))
        fields[k] =
          v === null || v === undefined
            ? ""
            : typeof v === "object"
              ? "[nested]"
              : cut(v);
    return { path, fields };
  }
  for (const [k, v] of new URLSearchParams(postData))
    fields[k] = k in fields ? cut(`${fields[k]} | ${v}`) : cut(v);
  return { path, fields };
}

// Values of fields whose name matches `pattern` (the account identity
// fields) are replaced with "[account]".
export function maskFields(fields, pattern) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {}))
    out[k] = pattern.test(k) ? "[account]" : v;
  return out;
}

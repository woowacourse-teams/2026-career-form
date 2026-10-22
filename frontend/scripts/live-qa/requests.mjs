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

export function classifyRequest(
  { method, url, headers = {}, postData = null },
  { allowHosts = [] } = {},
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

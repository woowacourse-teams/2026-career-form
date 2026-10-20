const tenantHost =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:recruiter\.co\.kr|recruiter\.im)$/;

export type HplaceDocumentKind = "mrs2" | "registration" | "v1" | "builder";

export function isHplaceDocument(document: Document): boolean {
  return hplaceDocumentKind(document) !== undefined;
}

/** Which fingerprint branch matched, or undefined when none did. */
export function hplaceDocumentKind(
  document: Document,
): HplaceDocumentKind | undefined {
  const location = document.location;
  if (
    !location ||
    !/^https?:$/.test(location.protocol) ||
    // Same normalization as the backend: lower-case, one trailing dot removed.
    !tenantHost.test(location.hostname.toLowerCase().replace(/\.$/, ""))
  ) {
    return undefined;
  }

  const scripts = resourcePaths(document, "script[src]", "src");
  const styles = resourcePaths(
    document,
    'link[rel~="stylesheet" i][href]',
    "href",
  );
  const hasIds = (...ids: string[]) =>
    ids.every((id) => document.getElementById(id) !== null);

  if (
    location.pathname === "/mrs2/applicant/resume/writeResume" &&
    ["writeResume.js", "writeResumeTemplate.js"].every((name) =>
      scripts.some((path) =>
        path.endsWith(`/mrs2/release/js/applicant/writeResume/${name}`),
      ),
    ) &&
    document.querySelector(
      'form#frm section.writeResume[data-code="11"] input#englishName[name="englishName"]',
    ) &&
    // Section 13 itself, not its address: some tenants have no address row.
    document.querySelector('form#frm section.writeResume[data-code="13"]')
  )
    return "mrs2";

  if (
    scripts.some((path) =>
      path.endsWith("/mrs2/release/js/applicant/applicantCommon.js"),
    ) &&
    scripts.some((path) =>
      path.endsWith("/mrs2/release/js/applicant/login/registResume.js"),
    ) &&
    styles.some((path) => path.endsWith("/mrs2/css/applicant/applicant.css")) &&
    Array.from(document.querySelectorAll("section.writeResume")).some(
      (section) =>
        section.id === "loginForm" && section.closest("form")?.id === "frm",
    )
  )
    return "registration";

  if (
    scripts.some((path) =>
      /^\/_next\/static\/chunks\/app\/\(main\)\/(?:\(jobflex\)\/career|\(jobda\))\/.+\/page-[\w-]+\.js$/.test(
        path,
      ),
    ) &&
    hasIds(
      "loading-root",
      "modal-root",
      "slate-hovering-toolbar",
      "tooltip-root",
      "message-root",
      "popup-root",
    )
  ) {
    return "builder";
  }

  if (
    scripts.some((path) => /^\/v1\/applicant\/index-[\w-]+\.js$/.test(path)) &&
    styles.some((path) => /^\/v1\/applicant\/index-[\w-]+\.css$/.test(path)) &&
    hasIds("root", "tooltip-root", "overlay-root")
  ) {
    return "v1";
  }

  if (
    !scripts.some((path) =>
      path.endsWith("/mit-common/js/custom/jquery.midasit.common.js"),
    )
  ) {
    return undefined;
  }

  const legacyMrs2 =
    (scripts.some((path) => path.endsWith("/mrs2/release/js/rsaCommon.js")) &&
      hasIds("appsiteSn", "systemKindCode", "jobnoticeSn", "mrs2")) ||
    (scripts.some((path) =>
      path.endsWith("/mrs2/release/js/applicant/applicantCommon.js"),
    ) &&
      styles.some((path) =>
        path.endsWith("/mrs2/css/applicant/applicant.css"),
      ) &&
      document.querySelector("form#frm") !== null);
  return legacyMrs2 ? "mrs2" : undefined;
}

function resourcePaths(
  document: Document,
  selector: string,
  attribute: string,
): string[] {
  return Array.from(document.querySelectorAll(selector)).flatMap((element) => {
    try {
      const url = new URL(element.getAttribute(attribute)!, document.baseURI);
      return url.origin === document.location.origin &&
        /^https?:$/.test(url.protocol)
        ? [decodeURIComponent(url.pathname)]
        : [];
    } catch {
      return [];
    }
  });
}

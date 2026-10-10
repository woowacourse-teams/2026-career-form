const tenantHost =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:recruiter\.co\.kr|recruiter\.im)$/;

export function isHplaceDocument(document: Document): boolean {
  const location = document.location;
  if (
    !location ||
    !/^https?:$/.test(location.protocol) ||
    !tenantHost.test(location.hostname.toLowerCase())
  ) {
    return false;
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
    return true;
  }

  if (
    scripts.some((path) => /^\/v1\/applicant\/index-[\w-]+\.js$/.test(path)) &&
    styles.some((path) => /^\/v1\/applicant\/index-[\w-]+\.css$/.test(path)) &&
    hasIds("root", "tooltip-root", "overlay-root")
  ) {
    return true;
  }

  if (
    !scripts.some((path) =>
      path.endsWith("/mit-common/js/custom/jquery.midasit.common.js"),
    )
  ) {
    return false;
  }

  return (
    (scripts.some((path) => path.endsWith("/mrs2/release/js/rsaCommon.js")) &&
      hasIds("appsiteSn", "systemKindCode", "jobnoticeSn", "mrs2")) ||
    (scripts.some((path) =>
      path.endsWith("/mrs2/release/js/applicant/applicantCommon.js"),
    ) &&
      styles.some((path) =>
        path.endsWith("/mrs2/css/applicant/applicant.css"),
      ) &&
      document.querySelector("form#frm") !== null)
  );
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

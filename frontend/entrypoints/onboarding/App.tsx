import { SiteApp } from "../../site/SiteApp";
import { SiteUrlContext } from "../../site/site-navigation";

export function extensionSiteUrl(path: string): string {
  if (path.startsWith("/demo/"))
    return `/onboarding-guide.html${path.slice(path.indexOf("?"))}`;
  return path.startsWith("/")
    ? `/onboarding.html?page=${encodeURIComponent(path)}`
    : path;
}

export function App() {
  const path =
    new URLSearchParams(window.location.search).get("page") ?? "/onboarding/";
  return (
    <SiteUrlContext value={extensionSiteUrl}>
      <SiteApp path={path} />
    </SiteUrlContext>
  );
}

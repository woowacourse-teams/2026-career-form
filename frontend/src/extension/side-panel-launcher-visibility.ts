export function shouldShowSidePanelLauncher(url: URL): boolean {
  return (
    url.href.toLowerCase().includes("apply") ||
    url.hostname.toLowerCase().endsWith("skhynix.com")
  );
}

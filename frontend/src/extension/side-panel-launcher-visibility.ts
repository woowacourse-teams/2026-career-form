export function shouldShowSidePanelLauncher(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  const urlText = `${url.hostname.toLowerCase()}${pathname}`;
  const hasApplicationKeyword = ["career", "recruit", "greeting"].some(
    (keyword) => urlText.includes(keyword),
  );

  return (
    url.href.toLowerCase().includes("apply") ||
    hasApplicationKeyword ||
    (url.hostname.toLowerCase() === "www.skcareers.com" &&
      url.pathname.startsWith("/Application/"))
  );
}

/** Page-level contentinfo landmark (HTML-AAM: footer maps to contentinfo only without an article/aside/main/nav/section ancestor) controls outside a form are page chrome. */
export function isPageChromeControl(element: Element): boolean {
  if (element.closest("form")) return false;
  if (element.closest("[role='contentinfo']")) return true;
  const footer = element.closest("footer");
  return (
    footer !== null &&
    footer.parentElement?.closest("article, aside, main, nav, section") === null
  );
}

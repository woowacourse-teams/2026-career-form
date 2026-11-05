/** Ancestors that make a `<footer>` local to its content (HTML-AAM). */
const SECTIONING_ANCESTOR =
  "article, aside, main, nav, section, dialog, [role='main'], [role='region'], [role='article'], [role='complementary'], [role='navigation'], [role='dialog'], [role='alertdialog']";
const DIALOG_ANCESTOR = "dialog, [role='dialog'], [role='alertdialog']";

/** Page-level contentinfo landmark (a footer without a sectioning or dialog
 * ancestor) controls outside a form are page chrome. */
export function isPageChromeControl(element: Element): boolean {
  if (element.closest("form")) return false;
  // A control tied to a form through its `form` attribute is still in a form.
  if ((element as Element & { form?: HTMLFormElement | null }).form)
    return false;
  const landmark = element.closest("[role='contentinfo']");
  if (landmark)
    return landmark.parentElement?.closest(DIALOG_ANCESTOR) === null;
  const footer = element.closest("footer");
  return (
    footer !== null &&
    footer.parentElement?.closest(SECTIONING_ANCESTOR) === null
  );
}

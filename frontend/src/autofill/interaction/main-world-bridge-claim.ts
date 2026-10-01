/**
 * MAIN-world bridges can be installed twice in one document: once by the
 * manifest content script and once by the programmatic re-injection used for
 * tabs that were open before the extension was (re)loaded. Two listeners would
 * each act on one request, so only the first installer may claim a document.
 * The marker lives on the shared DOM object so separate script bundles see it.
 */
export function claimMainWorldBridge(doc: Document, name: string): boolean {
  const key = Symbol.for(`career-form:main-world-bridge:${name}`);
  if (Object.prototype.hasOwnProperty.call(doc, key)) return false;
  Object.defineProperty(doc, key, { value: true });
  return true;
}

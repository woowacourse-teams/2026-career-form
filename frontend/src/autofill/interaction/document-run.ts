/**
 * Preparation and writing share one browser-local lease per document.
 * A late completion can only release its own lease.
 */
const active = new WeakMap<Document, symbol>();
export function acquireDocumentRun(
  document: Document,
): (() => void) | undefined {
  if (active.has(document)) return undefined;
  const token = Symbol("autofill-run");
  active.set(document, token);
  return () => {
    if (active.get(document) === token) active.delete(document);
  };
}

/** Cache only synchronous DOM reads. Never retain across await, events or writes. */
let pass: WeakMap<object, Map<string, unknown>> | undefined;

export function withDomReadPass<T>(read: () => T): T {
  if (pass) return read();
  pass = new WeakMap();
  try { return read(); }
  finally { pass = undefined; }
}

export function cachedDomRead<T>(owner: object, key: string, read: () => T): T {
  if (!pass) return read();
  let entries = pass.get(owner);
  if (!entries) { entries = new Map(); pass.set(owner, entries); }
  if (entries.has(key)) return entries.get(key) as T;
  const value = read();
  entries.set(key, value);
  return value;
}

export function displayState(element: Element) {
  return cachedDomRead(element, "display-state", () => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return { display: style?.display, visibility: style?.visibility };
  });
}

export function hasDomReadPass(): boolean { return pass !== undefined; }

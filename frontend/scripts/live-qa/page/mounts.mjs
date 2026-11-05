// Page function (serialized into the page): records the value each form
// control had when it was mounted during the run, as a property on the node
// (page memory only). census() never shows a value the control still has from
// its mount: an accordion or row that mounts with a server-saved value would
// otherwise look like something the run wrote. runPage installs it before the
// pre-run census, so every control is either in the pre-run value set or
// marked here. census() also shows nothing in a document without it (a new
// page after a redirect). Avoids Map/Set.
export function watchMounts() {
  window.__careerFormLiveQaMounts?.disconnect();
  // Every node census() reads a value from (its node list plus the radios of
  // role=radiogroup).
  const SELECTOR =
    'input, select, textarea, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="radio"], [contenteditable="true"], button[aria-haspopup]';
  const sig = (e) => {
    const type = (e.getAttribute("type") ?? "").toLowerCase();
    if (type === "radio" || type === "checkbox") return e.checked ? "1" : "";
    if (e.getAttribute("role") === "radio")
      return e.getAttribute("aria-checked") === "true" ||
        /^(on|checked)$/.test(e.getAttribute("data-state") ?? "")
        ? "1"
        : "";
    if ("value" in e && e.tagName !== "BUTTON") return String(e.value ?? "");
    return (e.textContent ?? "").replace(/\s+/g, " ").trim();
  };
  const mark = (node) => {
    if (!(node instanceof Element)) return;
    const list = node.matches(SELECTOR) ? [node] : [];
    for (const e of node.querySelectorAll(SELECTOR)) list.push(e);
    for (const e of list)
      if (e.__careerFormLiveQaMounted === undefined)
        e.__careerFormLiveQaMounted = sig(e);
  };
  const handle = (records) => {
    for (const r of records) for (const n of r.addedNodes) mark(n);
  };
  const observer = new MutationObserver(handle);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const controller = {
    flush: () => handle(observer.takeRecords()),
    disconnect: () => {
      handle(observer.takeRecords());
      observer.disconnect();
      if (window.__careerFormLiveQaMounts === controller)
        delete window.__careerFormLiveQaMounts;
    },
  };
  window.__careerFormLiveQaMounts = controller;
  return controller;
}

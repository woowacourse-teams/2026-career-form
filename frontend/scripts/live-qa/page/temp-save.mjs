// Page function (serialized into the page): clicks the site's own temp-save
// control, chosen by a site profile selector whose caption must still read
// 임시저장. Only the first visible match is clicked. Returns fixed UI identity.
export function clickTempSave(spec) {
  const caption = new RegExp(spec.caption, "i");
  const text = (e) =>
    (e instanceof HTMLInputElement ? e.value : (e.textContent ?? ""))
      .replace(/\s+/g, " ")
      .trim();
  const visible = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden") return false;
    }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const candidates = [].slice
    .call(document.querySelectorAll(spec.selector))
    .filter((e) => caption.test(text(e)));
  const target = candidates.find(visible) ?? null;
  if (!target)
    return {
      clicked: false,
      code: candidates.length ? "temp-save-hidden" : "temp-save-missing",
    };
  target.click();
  return { clicked: true, caption: text(target).slice(0, 20) };
}

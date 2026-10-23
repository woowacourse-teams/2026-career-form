// Page function (serialized into the page): lists the form controls the
// applicant can see. It is self-contained and avoids Map/Set because some
// sites replace them.
//
// Values never leave the page unless the run wrote them. Each control carries
// `fp`, a salted hash of its value (the salt is random per run and lives only
// in memory). Options:
// - salt: per-run secret mixed into every fp.
// - includeHidden: also list controls that are not visible (flag `hidden`).
//   Used for the pre-run value set and the discard check.
// - known: fps of every value on the page before the run, hidden controls
//   included. Without it nothing is shown.
// - synthetic: fps of the synthetic profile's values and their formatted
//   variants (see syntheticFingerprints).
// - ignoreLayout: tests only (jsdom has no layout).
// Nothing is shown in a document the run is not watching (mounts.mjs not
// installed, e.g. a new page after a redirect). Otherwise a value is shown when
// - it was not on the page before the run, and the control does not still hold
//   the value it was mounted with during the run (unless that value is exactly
//   a synthetic profile value), or
// - it was on the page before the run, is exactly a synthetic profile value
//   (code and text), and the run changed the control. A pre-run value that only
//   shares its text with the synthetic profile, or that the run left alone, is
//   never shown: small value sets (남성, 있음) would give it away.
// `prior` (key -> fp) marks controls as changed or added.
// - recordValues (test-account mode): every value is shown, whether or not
//   the run wrote it, and a control that still holds its mount value is
//   flagged `mountedAsIs`. Only account identity fields (identityPattern, a
//   regex source) that hold a pre-run value which is not a synthetic profile
//   value are masked as "[account]".
export function census(prior, options) {
  const opts = options ?? {};
  const ignoreLayout = Boolean(opts.ignoreLayout);
  const includeHidden = Boolean(opts.includeHidden);
  const salt = String(opts.salt ?? "");
  const known = opts.known ?? null;
  const synthetic = opts.synthetic ?? [];
  const recordValues = Boolean(opts.recordValues);
  const identity = opts.identityPattern
    ? new RegExp(opts.identityPattern, "i")
    : null;
  const clean = (s, n = 80) =>
    String(s ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n);
  const hash = (s) => {
    const text = salt + "\u0000" + s;
    let h = 2166136261;
    for (let k = 0; k < text.length; k++)
      h = Math.imul(h ^ text.charCodeAt(k), 16777619);
    let g = 0x811c9dc5 ^ text.length;
    for (let k = text.length - 1; k >= 0; k--)
      g = Math.imul(g ^ text.charCodeAt(k), 16777619);
    return (h >>> 0).toString(36) + (g >>> 0).toString(36);
  };
  const styleHidden = (e) => {
    const st = getComputedStyle(e);
    return st.display === "none" || st.visibility === "hidden";
  };
  const visible = (e) => {
    if (!(e instanceof Element)) return false;
    for (let n = e; n; n = n.parentElement) if (styleHidden(n)) return false;
    if (ignoreLayout) return true;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const NEAR =
    "th, dt, label, legend, strong, .tit, .title, .label, .select-label, .form-label, .field-title";
  const labelOf = (e) => {
    const parts = [];
    const aria = e.getAttribute("aria-label");
    if (aria) parts.push(aria);
    const by = e.getAttribute("aria-labelledby");
    if (by)
      parts.push(
        by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      );
    if (e.labels && e.labels.length)
      parts.push([].map.call(e.labels, (l) => l.textContent).join(" "));
    const title = e.getAttribute("title");
    if (title) parts.push(title);
    if (e.placeholder) parts.push("ph:" + e.placeholder);
    if (clean(parts.join(" ")).length < 2) {
      // Nearest non-empty caption of this control's own field. Once an
      // ancestor also holds another control, only captions between that
      // control and this one count (a table row with two fields).
      const FOLLOWING = 4;
      const isCaption = (c) =>
        !c.contains(e) &&
        clean(c.textContent).length > 0 &&
        !(c.tagName === "LABEL" && c.htmlFor && c.htmlFor !== e.id);
      let n = e;
      for (let d = 0; d < 5 && n; d++) {
        n = n.parentElement;
        if (!n) break;
        const captions = [].slice
          .call(n.querySelectorAll(NEAR))
          .filter(isCaption);
        const others = [].slice
          .call(n.querySelectorAll("input, select, textarea"))
          .filter((c) => c !== e && !e.contains(c) && c.type !== "hidden");
        if (!others.length) {
          if (captions.length) {
            parts.push("near:" + captions[0].textContent);
            break;
          }
          continue;
        }
        const precedes = (a, b) =>
          Boolean(a.compareDocumentPosition(b) & FOLLOWING);
        const prev = others.filter((c) => precedes(c, e)).pop() ?? null;
        const own = captions.filter(
          (c) => precedes(c, e) && (!prev || precedes(prev, c)),
        );
        if (own.length) parts.push("near:" + own[own.length - 1].textContent);
        break;
      }
    }
    return clean(parts.join(" | "), 100);
  };
  const sectionOf = (e) => {
    let n = e;
    for (let d = 0; d < 14 && n; d++) {
      n = n.parentElement;
      if (!n) break;
      const h = n.querySelector(
        ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > header h2, :scope > header h3, :scope > div > h3, :scope > div > h2",
      );
      if (h && !h.contains(e)) return clean(h.textContent, 40);
    }
    return "";
  };
  const ours = (e) =>
    e.closest(
      "career-form-profile-panel, [data-career-form-side-panel-launcher]",
    );
  const optionText = (r) => {
    const texts = [].map
      .call(r.labels ?? [], (l) => clean(l.textContent, 20))
      .filter(Boolean);
    return texts.length ? texts[texts.length - 1] : clean(r.value, 20);
  };
  // Dropdown triggers show their placeholder ("선택") as text. Greeting marks
  // it with data-placeholder(-shown); "false" means a real value is shown.
  const flagOn = (el, name) =>
    el.hasAttribute(name) && el.getAttribute(name) !== "false";
  const placeholderShown = (e) =>
    flagOn(e, "data-placeholder-shown") ||
    flagOn(e, "data-placeholder") ||
    Boolean(
      e.querySelector(
        '[data-placeholder-shown]:not([data-placeholder-shown="false"])',
      ),
    ) ||
    /^(선택|선택\s*해\s*주세요|선택하세요|선택하십시오|select)\.?$/i.test(
      clean(e.textContent),
    );
  // Same signature as mounts.mjs: the value a control was mounted with.
  const sig = (e) => {
    const t = (e.getAttribute("type") ?? "").toLowerCase();
    if (t === "radio" || t === "checkbox") return e.checked ? "1" : "";
    if (e.getAttribute("role") === "radio")
      return e.getAttribute("aria-checked") === "true" ||
        /^(on|checked)$/.test(e.getAttribute("data-state") ?? "")
        ? "1"
        : "";
    if ("value" in e && e.tagName !== "BUTTON") return String(e.value ?? "");
    return (e.textContent ?? "").replace(/\s+/g, " ").trim();
  };
  const mountedAsIs = (e) =>
    Boolean(e) &&
    e.__careerFormLiveQaMounted !== undefined &&
    e.__careerFormLiveQaMounted !== "" &&
    e.__careerFormLiveQaMounted === sig(e);
  const ariaOn = (b) =>
    b.getAttribute("aria-checked") === "true" ||
    b.getAttribute("aria-pressed") === "true" ||
    /^(on|checked)$/.test(b.getAttribute("data-state") ?? "");

  const watched = Boolean(window.__careerFormLiveQaMounts);
  const out = [];
  const seenRadio = {};
  const nodes = document.querySelectorAll(
    'input, select, textarea, [role="combobox"], [role="listbox"], [role="radiogroup"], [contenteditable="true"], button[aria-haspopup]',
  );
  for (const e of nodes) {
    if (ours(e)) continue;
    const tag = e.tagName.toLowerCase();
    const type = (
      e.getAttribute("type") ?? (tag === "input" ? "text" : tag)
    ).toLowerCase();
    const shownNow = (box) => visible(e) || (box && visible(box));
    // Hyundai-style select: input.btn-select shows the choice, a hidden
    // .js-field in the same .select-wrap holds the code.
    if (
      tag === "input" &&
      type === "button" &&
      e.classList.contains("btn-select")
    ) {
      const isVisible = shownNow(null);
      if (!isVisible && !includeHidden) continue;
      const wrap = e.closest(".select-wrap");
      const field = wrap ? wrap.querySelector("input.js-field") : null;
      const code = field ? field.value : "";
      const text = String(e.value ?? "");
      const choices = wrap
        ? [].map
            .call(
              wrap.querySelectorAll(
                ".select-option button, .select-option li, .select-option a",
              ),
              (b) => clean(b.textContent, 24),
            )
            .filter(Boolean)
        : [];
      out.push({
        tag: "btn-select",
        type: "button-select",
        name: field ? (field.getAttribute("name") ?? "") : "",
        id: e.id,
        label:
          clean(wrap?.querySelector("label.field-title")?.textContent, 60) ||
          labelOf(e),
        section: sectionOf(e),
        hidden: isVisible ? undefined : true,
        hasValue: Boolean(code),
        fp: code ? hash(code + "|" + text) : "",
        _fpText: code ? hash(text) : "",
        _mounted: mountedAsIs(e) || mountedAsIs(field),
        _show: code ? clean(code + "|" + text, 60) : "",
        required: Boolean(
          field?.required || wrap?.classList.contains("required"),
        ),
        disabled: Boolean(e.disabled),
        readonly: false,
        optionCount: choices.length,
        selectOptions: choices.slice(0, 40),
      });
      continue;
    }
    if (
      tag === "input" &&
      ["hidden", "submit", "button", "reset", "image"].includes(type)
    )
      continue;
    // A widget wrapping a real control is counted once, as that control.
    if (
      tag !== "input" &&
      tag !== "select" &&
      tag !== "textarea" &&
      e.querySelector("input, select, textarea")
    )
      continue;
    // ARIA radio group without native radios (Greeting toggle groups).
    if (e.getAttribute("role") === "radiogroup") {
      const items = [].slice.call(e.querySelectorAll('[role="radio"]'));
      if (!items.length) continue;
      const isVisible = shownNow(null);
      if (!isVisible && !includeHidden) continue;
      const on = items.find(ariaOn);
      const text = on ? clean(on.textContent, 20) : "";
      out.push({
        tag: "radiogroup",
        type: "radio-group",
        name: e.getAttribute("name") ?? e.getAttribute("data-name") ?? "",
        id: e.id,
        label: labelOf(e),
        section: sectionOf(e),
        hidden: isVisible ? undefined : true,
        options: items.map((b) => clean(b.textContent, 20)).slice(0, 8),
        hasValue: Boolean(on),
        fp: on ? hash("aria|" + text) : "",
        _fpText: on ? hash(text) : "",
        _mounted: mountedAsIs(on),
        _show: on ? text : "",
        required: e.getAttribute("aria-required") === "true",
        disabled: items.every(
          (b) => b.disabled || b.getAttribute("aria-disabled") === "true",
        ),
      });
      continue;
    }
    const box =
      type === "radio" || type === "checkbox"
        ? (e.closest("label") ?? e.parentElement ?? e)
        : e;
    const isVisible = shownNow(box);
    if (!isVisible && !includeHidden) continue;
    const name = e.getAttribute("name") ?? "";
    if (type === "radio") {
      const groupKey = (e.form ? "f:" : "d:") + name;
      if (name && seenRadio[groupKey]) continue;
      seenRadio[groupKey] = true;
      const group = name
        ? [].slice
            .call(document.querySelectorAll('input[type="radio"]'))
            .filter((r) => r.name === name)
        : [e];
      const on = group.find((r) => r.checked);
      out.push({
        tag,
        type: "radio-group",
        name,
        id: e.id,
        label: labelOf(e),
        section: sectionOf(e),
        hidden: isVisible ? undefined : true,
        options: group.map(optionText).slice(0, 8),
        hasValue: Boolean(on),
        fp: on ? hash(on.value + "|" + optionText(on)) : "",
        _fpText: on ? hash(optionText(on)) : "",
        _mounted: mountedAsIs(on),
        _show: on ? optionText(on) + " [v=" + clean(on.value, 12) + "]" : "",
        required: group.some((r) => r.required),
        disabled: group.every((r) => r.disabled),
      });
      continue;
    }
    const value =
      type === "checkbox"
        ? e.checked
          ? "1"
          : ""
        : tag === "select"
          ? e.selectedIndex >= 0 && e.value
            ? e.value + "|" + clean(e.selectedOptions[0]?.textContent, 40)
            : ""
          : "value" in e && tag !== "button"
            ? String(e.value ?? "")
            : placeholderShown(e)
              ? ""
              : clean(e.textContent, 60);
    const isFile = type === "file";
    out.push({
      tag,
      type,
      name,
      id: e.id,
      role: e.getAttribute("role") ?? undefined,
      label: labelOf(e),
      section: sectionOf(e),
      hidden: isVisible ? undefined : true,
      hasValue: isFile
        ? Boolean(e.files && e.files.length)
        : Boolean(value.trim()),
      fp: value && !isFile ? hash(value) : "",
      _fpText:
        tag === "select" && value
          ? hash(clean(e.selectedOptions[0]?.textContent, 40))
          : "",
      _mounted: mountedAsIs(e),
      _show: value && !isFile ? clean(value, 60) : "",
      required: Boolean(
        e.required || e.getAttribute("aria-required") === "true",
      ),
      disabled: Boolean(e.disabled),
      readonly: Boolean(e.readOnly),
      maxLength: e.maxLength > 0 ? e.maxLength : undefined,
      optionCount: tag === "select" ? e.options.length : undefined,
      selectOptions:
        tag === "select"
          ? [].slice.call(e.options, 0, 30).map((o) => clean(o.textContent, 24))
          : undefined,
    });
  }

  const occurrences = {};
  out.forEach((o, index) => {
    o.i = index;
    const base = [o.tag, o.type, o.name, o.id, o.label, o.section].join("|");
    occurrences[base] = (occurrences[base] ?? 0) + 1;
    o.key = base + "#" + occurrences[base];
    const show = o._show;
    const fpText = o._fpText;
    const mounted = o._mounted;
    delete o._show;
    delete o._fpText;
    delete o._mounted;
    if (o.hidden === undefined) delete o.hidden;
    const preexisting = Boolean(known && o.fp && known.indexOf(o.fp) >= 0);
    if (preexisting) o.preexisting = true;
    if (prior) {
      const before = Object.prototype.hasOwnProperty.call(prior, o.key)
        ? prior[o.key]
        : undefined;
      o.changed = (before ?? "") !== o.fp;
      if (before === undefined) o.added = true;
    }
    const syntheticValue = Boolean(o.fp) && synthetic.indexOf(o.fp) >= 0;
    const syntheticText = Boolean(fpText) && synthetic.indexOf(fpText) >= 0;
    const showable = preexisting
      ? syntheticValue && o.changed === true && !mounted
      : syntheticValue || syntheticText || !mounted;
    if (recordValues) {
      if (o.fp) {
        // Without a pre-run value set every value counts as pre-run.
        const fromBefore = known ? preexisting : true;
        const identityField =
          Boolean(identity) && identity.test(o.name + " " + o.label);
        o.shown =
          fromBefore && !syntheticValue && identityField ? "[account]" : show;
        if (mounted) o.mountedAsIs = true;
      }
    } else if (prior && known && watched && o.fp && showable) o.shown = show;
  });
  return {
    url: location.origin + location.pathname,
    title: clean(document.title, 60),
    controls: out,
  };
}

// Node side: the `prior` map for a later census() pass.
export function fingerprintMap(result) {
  const map = {};
  for (const c of result.controls) map[c.key] = c.fp;
  return map;
}

// Node side: every value fp in the given frames (a multiset, as an array).
export function valueFingerprints(frames) {
  return frames.flatMap((f) => f.controls.map((c) => c.fp).filter(Boolean));
}

// Node side: copy of census frames without fps and keys, for files. A salted
// fp is useless without the in-memory salt, but nothing downstream needs it.
export function stripFingerprints(frames) {
  return frames.map((f) => ({
    ...f,
    controls: f.controls.map((c) => {
      const copy = { ...c };
      delete copy.fp;
      delete copy.key;
      return copy;
    }),
  }));
}

// Node side: whether a discard left run values behind. The discard must end
// on the same page (and Hplace step) with most of its controls, and every
// control that holds a value afterwards (hidden ones included) must hold the
// value it had before the run. Compared per control, so swapped checkbox
// states count too. A control whose key the reload re-generated (SK names its
// hidden row templates with a per-load GUID) is matched by value against the
// pre-run values that no stable key accounted for. An error or login page is
// not a success.
export function discardResidue(
  beforeRun,
  afterDiscard,
  { stepBefore = null, stepAfter = null } = {},
) {
  const controls = (frames) => frames.flatMap((f) => f.controls);
  const keyed = (f, c) => `${f.key ?? "main"}|${c.key}`;
  const was = {};
  const pool = {};
  for (const f of beforeRun)
    for (const c of f.controls) {
      was[keyed(f, c)] = c.fp;
      if (c.fp) pool[c.fp] = (pool[c.fp] ?? 0) + 1;
    }
  let unexpected = 0;
  let rekeyed = 0;
  const unknown = [];
  for (const f of afterDiscard)
    for (const c of f.controls) {
      if (!c.fp) continue;
      const k = keyed(f, c);
      if (!Object.prototype.hasOwnProperty.call(was, k)) unknown.push(c.fp);
      else if (was[k] !== c.fp) unexpected++;
      else pool[c.fp]--;
    }
  for (const fp of unknown) {
    if (pool[fp] > 0) {
      pool[fp]--;
      rekeyed++;
    } else unexpected++;
  }
  const mainUrl = (frames) => frames.find((f) => f.main)?.frame ?? null;
  const count = {
    before: controls(beforeRun).length,
    after: controls(afterDiscard).length,
  };
  const formLost = count.before > 0 && count.after === 0;
  const sameUrl =
    afterDiscard.length === 0 || mainUrl(beforeRun) === mainUrl(afterDiscard);
  const sameStep = stepBefore === stepAfter;
  const shrunk = count.after < count.before * 0.8;
  return {
    verified: unexpected === 0 && !formLost && sameUrl && sameStep && !shrunk,
    unexpected,
    rekeyed,
    before: controls(beforeRun).filter((c) => c.hasValue).length,
    after: controls(afterDiscard).filter((c) => c.hasValue).length,
    formLost,
    sameUrl,
    sameStep,
    controls: count,
  };
}

// Node side: the same salted hash as the page function.
export function fingerprint(salt, value) {
  const text = String(salt ?? "") + "\u0000" + String(value);
  let h = 2166136261;
  for (let k = 0; k < text.length; k++)
    h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  let g = 0x811c9dc5 ^ text.length;
  for (let k = text.length - 1; k >= 0; k--)
    g = Math.imul(g ^ text.charCodeAt(k), 16777619);
  return (h >>> 0).toString(36) + (g >>> 0).toString(36);
}

// Node side: fps of the synthetic profile's values in the forms sites show
// them (date and phone formats, joined names). A pre-run value is shown only
// when it is one of these, which happens on applications saved earlier with
// the same synthetic profile.
export function syntheticFingerprints(salt, envelope) {
  const values = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
    else if (typeof v === "string" || typeof v === "number") {
      const s = String(v).trim();
      if (s) values.push(s);
    }
  };
  walk(envelope?.profile ?? envelope);
  const out = [];
  const add = (v) => out.push(fingerprint(salt, v));
  for (const v of values) {
    add(v);
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m)
      for (const f of [
        `${m[1]}.${m[2]}.${m[3]}`,
        `${m[1]}.${m[2]}`,
        `${m[1]}-${m[2]}`,
        `${m[1]}. ${m[2]}`,
        `${m[1]}${m[2]}${m[3]}`,
        `${m[1]}. ${m[2]}. ${m[3]}`,
      ])
        add(f);
    m = /^(\d{4})-(\d{2})$/.exec(v);
    if (m) for (const f of [`${m[1]}.${m[2]}`, `${m[1]}. ${m[2]}`]) add(f);
    m = /^(01\d)(\d{3,4})(\d{4})$/.exec(v);
    if (m) add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  const personal = envelope?.profile?.personal ?? {};
  const pairs = [
    [personal.koreanFamilyName, personal.koreanGivenName],
    [personal.englishFamilyName, personal.englishGivenName],
  ];
  for (const [family, given] of pairs)
    if (family && given)
      for (const f of [
        `${family}${given}`,
        `${family} ${given}`,
        `${given} ${family}`,
        `${family} ${given}`.toUpperCase(),
        `${given} ${family}`.toUpperCase(),
      ])
        add(f);
  return out;
}

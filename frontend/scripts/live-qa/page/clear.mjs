// Page function (serialized into the page): clears values that were already in
// the application form, in the page only. Nothing is saved. It returns counts,
// never values, and avoids Map/Set because some sites replace them.
//
// Rules that the 2026-10-21 live QA showed are needed:
// - Hplace MRS2 keeps saved rows. A row is "new" to the extension only when
//   every control in it is empty, hidden row ids included. Inside
//   section.writeResume this function also blanks hidden inputs, disabled
//   controls, search result labels and the readonly address. patriotYn and
//   handicapYn go back to the template's 비대상 default.
// - Other platforms render row templates as hidden inputs with defaults.
//   Blanking those breaks row creation, so only visible controls are cleared.
// - Job selection, consent and the Hyundai 국내/해외 toggle (pre-selected on a
//   fresh form) are never touched.
//
// options.dryRun: change nothing; count what a clear would remove and list the
// names of those controls in `fields` (names only, never values). A 비대상
// radio that is still at its default is not counted then.
// options.keepPattern (regex source): controls whose name or caption matches
// are left alone and counted as skippedProtected. A test-account reset keeps
// the login identity fields this way: sites refuse to temp-save without them,
// and they come back from the account anyway.
export function clearForm(options) {
  const ignoreLayout = Boolean(options && options.ignoreLayout);
  const dry = Boolean(options && options.dryRun);
  const keep =
    options && options.keepPattern ? new RegExp(options.keepPattern, "i") : null;
  const fields = [];
  const counts = {
    hiddenRowIds: 0,
    disabledCleared: 0,
    searchDisplays: 0,
    text: 0,
    textarea: 0,
    select: 0,
    radioGroups: 0,
    checkbox: 0,
    skippedProtected: 0,
    skippedReadonly: 0,
    // Custom widgets (Hyundai btn-select, ARIA comboboxes and toggle groups)
    // that still show a value: this function cannot clear them safely.
    widgetsLeft: 0,
  };
  const hplace = Boolean(
    document.querySelector("form#frm section.writeResume"),
  );
  const root = document.querySelector("form#frm") ?? document;
  const protectedName = hplace
    ? /^(contact\b|applySector|applyChannel)/
    : /^(contact\b|applySector|applyChannel|inExGb$|appJobRole)|recruit|notice|resumeSn|jobGroup|applyField|job_?id/i;
  const protectedLabel =
    /지원\s*분야|지원\s*직무|지원\s*부문|모집\s*분야|직무\s*선택|희망\s*직무|동의|약관|개인정보\s*(수집|이용|제공|처리)|consent|agree/i;
  const addressName = /(^|\.)(zipCode|address|detailAddress)$/;
  const defaultFalse = ["patriot.patriotYn", "handicap.handicapYn"];
  const ours = (e) =>
    e.closest(
      "career-form-profile-panel, [data-career-form-side-panel-launcher]",
    );
  const note = (el) => {
    if (dry) fields.push(el.getAttribute("name") || el.id || el.tagName);
  };
  const textOf = (e) => {
    const parts = [
      e.getAttribute("aria-label") ?? "",
      e.getAttribute("name") ?? "",
      e.id ?? "",
      e.getAttribute("title") ?? "",
    ];
    if (e.labels) for (const l of e.labels) parts.push(l.textContent ?? "");
    const row = e.closest(
      "tr, li, dl, .row, .form-group, .form-item, fieldset, [class*='field'], [class*='Field']",
    );
    if (row)
      parts.push(
        (
          row.querySelector(
            "th, dt, label, legend, .tit, .title, .select-label, .form-label",
          ) ?? row
        ).textContent?.slice(0, 80) ?? "",
      );
    return parts.join(" ");
  };
  const visible = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden") return false;
    }
    if (ignoreLayout) return true;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const setValue = (proto, el, value) =>
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  const fire = (el) => {
    for (const t of ["input", "change", "blur"])
      el.dispatchEvent(new Event(t, { bubbles: true }));
  };
  const inSection = (el) =>
    hplace && Boolean(el.closest("section.writeResume"));
  const radios = {};
  const radioOrder = [];

  for (const el of root.querySelectorAll("input, textarea, select")) {
    if (ours(el)) continue;
    const type = (
      el.getAttribute("type") ?? (el.tagName === "INPUT" ? "text" : el.tagName)
    ).toLowerCase();
    const name = el.getAttribute("name") ?? "";
    if (type === "hidden") {
      if (protectedName.test(name)) continue;
      if (inSection(el) && el.value) {
        if (!dry) el.value = "";
        counts.hiddenRowIds++;
        note(el);
      }
      continue;
    }
    if (
      ["file", "password", "submit", "button", "reset", "image"].includes(type)
    )
      continue;
    if (protectedName.test(name) || protectedLabel.test(textOf(el))) {
      counts.skippedProtected++;
      continue;
    }
    if (keep && (keep.test(name) || keep.test(textOf(el)))) {
      counts.skippedProtected++;
      continue;
    }
    if (!hplace) {
      const box =
        type === "radio" || type === "checkbox"
          ? (el.closest("label") ?? el.parentElement ?? el)
          : el;
      if (!visible(el) && !visible(box)) continue;
    }
    if (el.disabled) {
      if (!inSection(el)) continue;
      if (type === "radio" || type === "checkbox") {
        if (el.checked) {
          if (!dry) {
            el.checked = false;
            el.defaultChecked = false;
          }
          counts.disabledCleared++;
          note(el);
        }
      } else if (el.tagName === "SELECT") {
        if (el.value) {
          if (!dry) {
            for (const o of el.options) o.defaultSelected = false;
            el.selectedIndex = 0;
            if (el.value) el.selectedIndex = -1;
          }
          counts.disabledCleared++;
          note(el);
        }
      } else if (el.value) {
        if (!dry) el.value = "";
        counts.disabledCleared++;
        note(el);
      }
      continue;
    }
    if (el.tagName === "SELECT") {
      if (!el.value) continue;
      if (!dry) {
        for (const o of el.options) o.defaultSelected = false;
        el.selectedIndex = 0;
        if (el.value && hplace) el.selectedIndex = -1;
        fire(el);
      }
      counts.select++;
      note(el);
    } else if (el.tagName === "TEXTAREA") {
      if (el.readOnly) {
        if (el.value) counts.skippedReadonly++;
        continue;
      }
      if (!el.value) continue;
      if (!dry) {
        el.defaultValue = "";
        setValue(HTMLTextAreaElement.prototype, el, "");
        fire(el);
      }
      counts.textarea++;
      note(el);
    } else if (type === "radio") {
      const key = name || "_unnamed" + radioOrder.length;
      if (!radios[key]) {
        radios[key] = [];
        radioOrder.push(key);
      }
      radios[key].push(el);
    } else if (type === "checkbox") {
      if (!el.checked) continue;
      if (!dry) {
        el.defaultChecked = false;
        el.click();
        if (el.checked) {
          el.checked = false;
          fire(el);
        }
      }
      counts.checkbox++;
      note(el);
    } else {
      if (el.readOnly && !(hplace && addressName.test(name))) {
        if (el.value) counts.skippedReadonly++;
        continue;
      }
      if (!el.value) continue;
      if (!dry) {
        el.defaultValue = "";
        setValue(HTMLInputElement.prototype, el, "");
        fire(el);
      }
      counts.text++;
      note(el);
    }
  }
  if (!hplace) {
    for (const field of root.querySelectorAll(".select-wrap input.js-field"))
      if (field.value && visible(field.closest(".select-wrap")))
        counts.widgetsLeft++;
    for (const box of root.querySelectorAll('[role="combobox"]'))
      if (
        !/^(INPUT|SELECT|TEXTAREA)$/.test(box.tagName) &&
        !box.querySelector("input, select, textarea") &&
        !(
          box.hasAttribute("data-placeholder-shown") &&
          box.getAttribute("data-placeholder-shown") !== "false"
        ) &&
        !(
          box.hasAttribute("data-placeholder") &&
          box.getAttribute("data-placeholder") !== "false"
        ) &&
        !box.querySelector(
          '[data-placeholder-shown]:not([data-placeholder-shown="false"])',
        ) &&
        !/^(선택|선택\s*해\s*주세요|선택하세요|선택하십시오|select)\.?$/i.test(
          box.textContent.trim(),
        ) &&
        box.textContent.trim() &&
        visible(box)
      )
        counts.widgetsLeft++;
    for (const group of root.querySelectorAll('[role="radiogroup"]'))
      if (
        group.querySelector('[role="radio"][aria-checked="true"]') &&
        visible(group)
      )
        counts.widgetsLeft++;
  }
  if (hplace) {
    if (!dry)
      for (const span of root.querySelectorAll("span.postCode"))
        span.textContent = "";
    for (const span of root.querySelectorAll(
      "section.writeResume span.searchResultName",
    ))
      if (span.textContent.trim()) {
        if (!dry) span.textContent = "";
        counts.searchDisplays++;
      }
    if (!dry)
      for (const b of root.querySelectorAll(
        '[data-button="resetAddressResult"], .resetAddressResult, #resetAddressResult',
      ))
        b.remove();
  }
  for (const key of radioOrder) {
    const group = radios[key];
    const on = group.find((r) => r.checked);
    if (!on) continue;
    const isDefault = defaultFalse.indexOf(key) >= 0;
    // A 비대상 radio still at its template default is not saved data.
    if (dry && isDefault && on.value === "false") continue;
    counts.radioGroups++;
    note(on);
    if (dry) continue;
    for (const r of group) {
      r.checked = false;
      r.defaultChecked = false;
    }
    group[0].dispatchEvent(new Event("change", { bubbles: true }));
    if (isDefault) {
      const target = group.find((r) => r.value === "false");
      if (target) {
        target.defaultChecked = true;
        target.click();
      }
    }
  }
  if (dry) counts.fields = fields;
  return counts;
}

/**
 * Test-only emulator of the MRS2 `data-rel-*` linked-form semantics.
 * Reimplemented from observed behaviour; no third-party code is copied here.
 * The public site script is kept for reference only under
 * `.git/cf-workflow/live-dom/public-js/` (gs-jquery.midas.linkedForm.js).
 *
 * Semantics:
 * - A radio inside `label|span|div[data-rel-id]`, a `select[data-rel-id]`
 *   change, or an `input[data-rel-id]` evaluation toggles every
 *   `[data-rel-target=<id>]` element (and shows/hides `[data-rel-hide=true]`).
 * - `data-rel-type`: default = any non-empty value enables; `with` = value in
 *   `data-rel-value` (comma list); `without` = value not in the list;
 *   `complex` = space-separated ids paired with space-separated lists.
 * - Enabling an element re-evaluates relations that hang off it: checked
 *   radios in its wrapper are clicked again 50ms later, its selects fire
 *   change, its wrappers re-read checked checkboxes and its inputs re-read
 *   their trimmed value. Disabling cascades through `data-rel-id` targets.
 * - `input[data-rel-id]` is polled every 200ms only while focused and once on
 *   blur. Like the site, only the latest poll is cleared on blur.
 */
const WRAPPER = "label[data-rel-id], span[data-rel-id], div[data-rel-id]";
const quoted = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;
const relIds = (element: Element) => {
  const id =
    element.getAttribute("data-rel-id") ??
    element.closest(WRAPPER)?.getAttribute("data-rel-id");
  return id ? id.split(" ").filter(Boolean) : [];
};

export interface LinkedFormEmulator {
  dispose(): void;
}
const active = new Set<LinkedFormEmulator>();

export function installLinkedForm(
  target: Element,
  { init = true }: { init?: boolean } = {},
): LinkedFormEmulator {
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let poll: ReturnType<typeof setInterval> | undefined;
  const find = <T extends Element = Element>(selector: string) =>
    Array.from(target.querySelectorAll<T>(selector));
  const targets = (id: string) => find(`[data-rel-target=${quoted(id)}]`);
  const toggle = (id: string, enabled: boolean, seen: Set<Element>) => {
    for (const element of targets(id)) {
      (element as HTMLInputElement).disabled = !enabled;
      if (element.getAttribute("data-rel-hide") === "true")
        (element as HTMLElement).style.display = enabled ? "" : "none";
    }
    for (const element of targets(id)) {
      if (seen.has(element)) continue;
      seen.add(element);
      if (enabled) enabledChildren(element);
      else disabledChildren(element, seen);
    }
  };
  const values = (element: Element) => {
    const list = element.getAttribute("data-rel-value");
    return list ? list.split(",") : [];
  };
  const relate = (
    source: Element,
    value: string | readonly string[],
    seen = new Set<Element>(),
  ) => {
    const ids = (source.getAttribute("data-rel-id") ?? "")
      .split(" ")
      .filter(Boolean);
    const type = source.getAttribute("data-rel-type");
    const truthy = Array.isArray(value) || value !== "";
    ids.forEach((id, i) => {
      const list =
        type === "complex"
          ? ((source.getAttribute("data-rel-value") ?? "")
              .split(" ")
              [i]?.split(",") ?? [])
          : values(source);
      const hit = Array.isArray(value)
        ? value.some((v) => list.includes(v))
        : list.includes(value as string);
      const enabled =
        type === "with" || type === "complex"
          ? hit && truthy
          : type === "without"
            ? !hit && truthy
            : truthy;
      toggle(id, enabled, seen);
    });
  };
  const checkedBoxes = (wrapper: Element) =>
    Array.from(
      wrapper.querySelectorAll<HTMLInputElement>(
        "input[type=checkbox]:checked",
      ),
      (box) => box.value,
    );
  // Wrapper re-evaluation always uses the "with" rule, as on the site.
  const relateWrapper = (wrapper: Element) => {
    const ids = (wrapper.getAttribute("data-rel-id") ?? "")
      .split(" ")
      .filter(Boolean);
    const list = values(wrapper);
    const checked = checkedBoxes(wrapper);
    const hit = checked.some((v) => list.includes(v));
    for (const id of ids) toggle(id, hit, new Set());
  };
  const relateText = (input: HTMLInputElement) =>
    relate(input, input.value.trim());
  const enabledChildren = (element: Element) => {
    for (const id of relIds(element)) {
      const near = ["label", "span", "div"].map(
        (tag) => `${tag}[data-rel-id~=${quoted(id)}]`,
      );
      for (const radio of find<HTMLInputElement>(
        near.map((w) => `${w} input[type=radio]:checked`).join(", "),
      )) {
        const timer = setTimeout(() => {
          timeouts.delete(timer);
          radio.click();
        }, 50);
        timeouts.add(timer);
      }
      for (const select of find(`select[data-rel-id~=${quoted(id)}]`))
        select.dispatchEvent(new Event("change", { bubbles: true }));
      for (const wrapper of find(near.join(", "))) relateWrapper(wrapper);
      for (const input of find<HTMLInputElement>(
        `input[data-rel-id~=${quoted(id)}]`,
      ))
        relateText(input);
    }
  };
  const disabledChildren = (element: Element, seen: Set<Element>) => {
    for (const id of relIds(element)) toggle(id, false, seen);
  };

  const onClick = (event: Event) => {
    const radio = event.target;
    if (
      !(radio instanceof HTMLInputElement) ||
      radio.type !== "radio" ||
      !radio.closest(WRAPPER) ||
      !target.contains(radio)
    )
      return;
    relate(radio.closest("[data-rel-id]")!, radio.value);
  };
  const onChange = (event: Event) => {
    const control = event.target;
    if (
      control instanceof HTMLSelectElement &&
      control.hasAttribute("data-rel-id")
    )
      relate(control, control.value);
    else if (
      control instanceof HTMLInputElement &&
      control.type === "checkbox" &&
      control.name &&
      control.closest(WRAPPER)
    )
      toggleCheckboxes(control);
  };
  const toggleCheckboxes = (box: HTMLInputElement) => {
    const wrapper = box.closest("[data-rel-id]")!;
    const checked = Array.from(
      target.ownerDocument.querySelectorAll<HTMLInputElement>(
        `input[type=checkbox][name=${quoted(box.name)}]:checked`,
      ),
      (b) => b.value,
    );
    const list = values(wrapper);
    const hit = checked.some((v) => list.includes(v));
    for (const id of relIds(wrapper)) toggle(id, hit, new Set());
  };
  const isRelInput = (e: EventTarget | null): e is HTMLInputElement =>
    e instanceof HTMLInputElement && e.hasAttribute("data-rel-id");
  const onFocus = (event: Event) => {
    const input = event.target;
    if (!isRelInput(input)) return;
    poll = setInterval(() => relateText(input), 200);
    intervals.add(poll);
  };
  const onBlur = (event: Event) => {
    const input = event.target;
    if (!isRelInput(input)) return;
    relateText(input);
    if (poll !== undefined) {
      clearInterval(poll);
      intervals.delete(poll);
    }
  };
  target.addEventListener("click", onClick);
  target.addEventListener("change", onChange);
  target.addEventListener("focus", onFocus, true);
  target.addEventListener("blur", onBlur, true);

  if (init) {
    for (const select of find<HTMLSelectElement>("select[data-rel-id]"))
      relate(select, select.value);
    for (const wrapper of find(WRAPPER)) relateWrapper(wrapper);
    for (const radio of find<HTMLInputElement>(
      "span[data-rel-id] input[type=radio]:checked, div[data-rel-id] input[type=radio]:checked",
    ))
      radio.click();
    for (const input of find<HTMLInputElement>("input[data-rel-id]"))
      relateText(input);
  }

  const emulator: LinkedFormEmulator = {
    dispose() {
      target.removeEventListener("click", onClick);
      target.removeEventListener("change", onChange);
      target.removeEventListener("focus", onFocus, true);
      target.removeEventListener("blur", onBlur, true);
      intervals.forEach(clearInterval);
      timeouts.forEach(clearTimeout);
      intervals.clear();
      timeouts.clear();
      active.delete(emulator);
    },
  };
  active.add(emulator);
  return emulator;
}

/** Call from `afterEach`: clears every installed emulator's listeners and timers. */
export function disposeLinkedForms(): void {
  for (const emulator of Array.from(active)) emulator.dispose();
}

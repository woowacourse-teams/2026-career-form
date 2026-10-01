import { normalized, type TargetIdentity } from "./readonly-search";
import { SearchFailure, type SearchSession } from "./search-session";
import { elements } from "./search-surface-dom";
import type { SearchSurface } from "./search-surface";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const state = (control: Control) =>
  JSON.stringify([
    control.value,
    control.disabled,
    "readOnly" in control ? control.readOnly : null,
    "checked" in control ? control.checked : null,
    control.getAttribute("name"),
    control.getAttribute("type"),
  ]);

/** Strict effect lease for the new structural path; no writes or rollback here. */
export function bindStructuredEffects(
  identity: TargetIdentity,
  row: HTMLElement,
  action: HTMLElement,
  surface: SearchSurface,
  session: SearchSession,
) {
  const scope = identity.repeatRow ?? identity.fieldGroup;
  const target = identity.target;
  const codes = elements<HTMLInputElement>(scope, "input[type='hidden']");
  const codeValue =
    action.getAttribute("data-code") ?? row.getAttribute("data-code");
  const relation = codes.length === 1 && codeValue ? codes[0] : undefined;
  const selection = [action, row].find(
    (e) => e.getAttribute("aria-selected") === "false",
  );
  if (
    (!relation && !selection) ||
    (relation && relation.value && relation.value !== codeValue)
  )
    throw new SearchFailure("selection_effect_unverified");
  const controls = elements<Control>(
    target.ownerDocument,
    "input, select, textarea",
  ).filter((e) => e !== target && e !== relation && !surface.contains(e));
  const peers = controls.map((element) => ({
    element,
    parent: element.parentElement,
    state: state(element),
  }));
  const initialControls = [target, relation, ...controls].filter(Boolean);
  const url = target.ownerDocument.URL;
  let invalid = false;
  let recordsSeen = 0;
  const observer = new MutationObserver((records) => {
    recordsSeen += records.length;
    if (recordsSeen > 128) invalid = true;
    for (const record of records) {
      const node = record.target;
      const attr = record.attributeName;
      if (
        (node === target || node === relation) &&
        record.type === "attributes" &&
        attr === "value"
      )
        continue;
      if (
        (node === action || node === row) &&
        record.type === "attributes" &&
        attr === "aria-selected"
      )
        continue;
      if (
        node === surface.container &&
        record.type === "attributes" &&
        ["hidden", "style", "aria-hidden", "open"].includes(attr ?? "")
      )
        continue;
      if (
        record.type === "childList" &&
        !record.addedNodes.length &&
        Array.from(record.removedNodes).every((n) => n === surface.container)
      )
        continue;
      invalid = true;
    }
  });
  observer.observe(target.ownerDocument.documentElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  if (surface.document !== target.ownerDocument)
    observer.observe(surface.document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  const navigation = (event: Event) => {
    invalid = true;
    if (event.type === "submit") event.preventDefault();
  };
  const documents = [...new Set([target.ownerDocument, surface.document])];
  for (const doc of documents) {
    doc.addEventListener("submit", navigation, true);
    doc.defaultView?.addEventListener("beforeunload", navigation);
    doc.defaultView?.addEventListener("popstate", navigation);
    doc.defaultView?.addEventListener("hashchange", navigation);
  }
  session.addCleanup(() => {
    observer.disconnect();
    for (const doc of documents) {
      doc.removeEventListener("submit", navigation, true);
      doc.defaultView?.removeEventListener("beforeunload", navigation);
      doc.defaultView?.removeEventListener("popstate", navigation);
      doc.defaultView?.removeEventListener("hashchange", navigation);
    }
  });
  return {
    verify() {
      if (
        invalid ||
        target.ownerDocument.URL !== url ||
        !scope.contains(target) ||
        (relation &&
          (!scope.contains(relation) ||
            relation.type !== "hidden" ||
            relation.value !== codeValue)) ||
        peers.some(
          (p) =>
            !p.element.isConnected ||
            p.element.parentElement !== p.parent ||
            state(p.element) !== p.state,
        ) ||
        elements<Control>(target.ownerDocument, "input, select, textarea").some(
          (e) => !surface.contains(e) && !initialControls.includes(e),
        )
      )
        throw new SearchFailure("selection_postcondition_failed");
      return (
        (relation
          ? Boolean(normalized(relation.value))
          : selection?.getAttribute("aria-selected") === "true") &&
        (surface.closure() === "closed" ||
          selection?.getAttribute("aria-selected") === "true")
      );
    },
  };
}

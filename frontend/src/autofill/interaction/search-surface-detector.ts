import { genericRowFor } from "../dom/repeatable-rows";
import { isTrustedId, trustedLabels } from "../dom/trusted-id";
import type { TargetIdentity } from "./readonly-search";
import { SearchSurface } from "./search-surface";
import { SearchFailure, type SearchSession } from "./search-session";
import {
  accessibleDocument,
  elements,
  isRolelessLayerCandidate,
  label,
  layerHeading,
  linked,
  roots,
  sharesSearchSubject,
  shown,
  SURFACE_SELECTOR,
} from "./search-surface-dom";

/** Document-wide role-less candidates are skipped on larger pages. */
const LAYER_SCAN_LIMIT = 2048;
const LAYER_SELECTOR = "div, section, aside, article";

function rolelessLayers(
  document: Document,
  fieldGroup: Element,
  includeUnqualified = false,
): HTMLElement[] {
  const primary = Array.from(
    fieldGroup.querySelectorAll<HTMLElement>(LAYER_SELECTOR),
  );
  const all = document.querySelectorAll<HTMLElement>(LAYER_SELECTOR);
  const auxiliary = all.length > LAYER_SCAN_LIMIT ? [] : Array.from(all);
  return [...primary, ...auxiliary].filter(
    (element) => includeUnqualified || isRolelessLayerCandidate(element),
  );
}

export function observeSearchSurfaces(
  document: Document,
  identity: TargetIdentity,
  session: SearchSession,
) {
  const scan = (includeUnqualifiedLayers = false) => [
    ...new Set([
      ...roots(document, identity.target).flatMap((root) =>
        elements<HTMLElement>(root, SURFACE_SELECTOR),
      ),
      ...rolelessLayers(
        document,
        identity.fieldGroup,
        includeUnqualifiedLayers,
      ),
    ]),
  ];
  const before = new Map(
    // Inserting a popup can make an already-visible ancestor qualify as a
    // search layer for the first time. Remember its prior visibility too;
    // gaining search descendants must not count as opening that ancestor.
    // Keep the legacy discovery baseline unchanged.
    scan(session.args.genericPopupRecovery === true).map((element) => [
      element,
      {
        visible: shown(element),
        document:
          element.tagName === "IFRAME"
            ? accessibleDocument(element as HTMLIFrameElement)
            : undefined,
      },
    ]),
  );
  const pending = new Set<HTMLIFrameElement>();
  const Observer = document.defaultView?.MutationObserver;
  const receive = (records: MutationRecord[]) => {
    for (const record of records)
      if (record.target.nodeName === "IFRAME")
        pending.add(record.target as HTMLIFrameElement);
  };
  const observer = Observer ? new Observer(receive) : undefined;
  for (const root of roots(document, identity.target))
    observer?.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcdoc"],
    });
  const onLoad = (event: Event) => {
    if ((event.target as Element | null)?.nodeName === "IFRAME") {
      receive(observer?.takeRecords() ?? []);
      pending.delete(event.target as HTMLIFrameElement);
    }
  };
  document.addEventListener("load", onLoad, true);
  session.addCleanup(() => {
    observer?.disconnect();
    document.removeEventListener("load", onLoad, true);
  });

  const fieldName = () =>
    trustedLabels(identity.target)
      .map((item) => item.textContent)
      .join(" ") +
    " " +
    label(identity.target);

  function attributedLayer(element: HTMLElement, opener: HTMLElement): boolean {
    // A layer inside another repeat row never belongs to this target.
    // A page-level layer (e.g. a modal appended to the body) belongs to no row
    // and is attributed by the explicit checks below instead.
    const row = genericRowFor(element);
    if (
      identity.repeatRow &&
      (row || session.args.genericPopupRecovery !== true) &&
      row !== identity.repeatRow
    )
      return false;
    if (linked(opener, element) || linked(identity.target, element))
      return true;
    if (identity.fieldGroup.contains(element)) return true;
    let surfaceName =
      element.getAttribute("aria-label") ??
      element.getAttribute("title") ??
      layerHeading(element);
    if (!surfaceName && session.args.genericPopupRecovery) {
      const queries = elements<HTMLInputElement>(element, "input").filter(
        (input) =>
          ["text", "search"].includes(input.type) &&
          !input.readOnly &&
          !input.disabled &&
          shown(input),
      );
      if (queries.length === 1) {
        const query = queries[0]!;
        surfaceName = [
          ...trustedLabels(query).map((item) => item.textContent ?? ""),
          query.getAttribute("aria-label") ?? "",
          query.getAttribute("placeholder") ?? "",
        ].join(" ");
      }
    }
    return (
      sharesSearchSubject(
        fieldName(),
        surfaceName,
        session.args.genericPopupRecovery === true,
      ) &&
      /검색|조회|search|lookup/i.test(surfaceName)
    );
  }

  function attributed(element: HTMLElement, opener: HTMLElement): boolean {
    if (!element.matches(SURFACE_SELECTOR))
      return attributedLayer(element, opener);
    if (
      linked(opener, element) ||
      linked(identity.target, element) ||
      identity.fieldGroup.contains(element)
    )
      return true;
    const labelIds = (element.getAttribute("aria-labelledby") ?? "").split(
      /\s+/,
    );
    const root = identity.target.getRootNode() as Document | ShadowRoot;
    if (
      trustedLabels(identity.target).some(
        (item) =>
          item.id && isTrustedId(root, item.id) && labelIds.includes(item.id),
      )
    )
      return true;
    // Require a shared, explicit accessible subject as well as the before/after change.
    const surfaceName =
      element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "";
    return (
      sharesSearchSubject(
        fieldName(),
        surfaceName,
        session.args.genericPopupRecovery === true,
      ) &&
      /검색|search|lookup/i.test(surfaceName)
    );
  }

  return {
    discover(opener: HTMLElement): SearchSurface | undefined {
      receive(observer?.takeRecords() ?? []);
      const changed = scan().filter((element) => {
        if (!shown(element)) return false;
        const previous = before.get(element);
        return (
          !previous?.visible ||
          (element.tagName === "IFRAME" &&
            accessibleDocument(element as HTMLIFrameElement) !==
              previous.document)
        );
      });
      if (!changed.length) return undefined;
      const outer = changed.filter(
        (element) =>
          !changed.some(
            (parent) => parent !== element && parent.contains(element),
          ),
      );
      if (outer.length !== 1) throw new SearchFailure("surface_ambiguous");
      const container = outer[0]!;
      if (!attributed(container, opener))
        throw new SearchFailure("surface_unobservable");
      const frames =
        container.tagName === "IFRAME"
          ? [container as HTMLIFrameElement]
          : elements<HTMLIFrameElement>(container, "iframe").filter(shown);
      if (frames.length > 1) throw new SearchFailure("surface_ambiguous");
      if (frames.length === 1) {
        const frame = frames[0]!;
        const doc = accessibleDocument(frame);
        if (!doc) {
          try {
            if (frame.contentDocument?.URL === "about:blank") return undefined;
          } catch {
            /* inaccessible context */
          }
          throw new SearchFailure("inaccessible_popup_frame");
        }
        if (pending.has(frame) || doc.readyState !== "complete")
          return undefined;
        return new SearchSurface(
          "same-origin-iframe",
          container,
          doc,
          opener,
          identity.target,
          frame,
        );
      }
      const kind = !container.matches(SURFACE_SELECTOR)
        ? "same-document-layer"
        : container.getAttribute("role") === "listbox"
          ? "inline-listbox"
          : "same-document-dialog";
      if (
        kind === "inline-listbox" &&
        !linked(identity.target, container) &&
        !linked(opener, container) &&
        !identity.fieldGroup.contains(container)
      )
        throw new SearchFailure("surface_unobservable");
      return new SearchSurface(
        kind,
        container,
        container,
        opener,
        identity.target,
        undefined,
        {
          allowUnlabelledResultRoot: session.args.genericPopupRecovery === true,
        },
      );
    },
    assertOwned(surface: SearchSurface): void {
      receive(observer?.takeRecords() ?? []);
      for (const element of scan()) {
        if (!shown(element) || before.get(element)?.visible) continue;
        if (
          element !== surface.container &&
          !surface.container.contains(element)
        )
          throw new SearchFailure("surface_ambiguous");
      }
      // Closed popups may clear a removed iframe's src; selection still requires
      // the original field value and closed surface to remain verified.
      if (
        surface.frame &&
        pending.has(surface.frame) &&
        !surface.navigationPending() &&
        surface.closure() === "open"
      )
        throw new SearchFailure("surface_navigation_unsafe");
    },
  };
}

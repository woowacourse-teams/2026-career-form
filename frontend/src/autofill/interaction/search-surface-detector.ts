import type { TargetIdentity } from "./readonly-search";
import { SearchSurface } from "./search-surface";
import { SearchFailure, type SearchSession } from "./search-session";
import {
  accessibleDocument,
  elements,
  label,
  linked,
  roots,
  shown,
  SURFACE_SELECTOR,
} from "./search-surface-dom";

export function observeSearchSurfaces(
  document: Document,
  identity: TargetIdentity,
  session: SearchSession,
) {
  const scan = () => [
    ...new Set(
      roots(document, identity.target).flatMap((root) =>
        elements<HTMLElement>(root, SURFACE_SELECTOR),
      ),
    ),
  ];
  const before = new Map(
    scan().map((element) => [
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

  function attributed(element: HTMLElement, opener: HTMLElement): boolean {
    if (
      linked(opener, element) ||
      linked(identity.target, element) ||
      identity.fieldGroup.contains(element)
    )
      return true;
    const targetLabels = Array.from(identity.target.labels ?? []);
    const labelIds = (element.getAttribute("aria-labelledby") ?? "").split(
      /\s+/,
    );
    if (targetLabels.some((item) => item.id && labelIds.includes(item.id)))
      return true;
    // Require a shared, explicit accessible subject as well as the before/after change.
    const subjects = [
      "학교",
      "school",
      "전공",
      "major",
      "소재지",
      "region",
      "자격증",
      "certificate",
    ];
    const fieldName =
      targetLabels.map((item) => item.textContent).join(" ") +
      " " +
      label(identity.target);
    const surfaceName =
      element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "";
    return (
      subjects.some(
        (subject) =>
          fieldName.toLowerCase().includes(subject) &&
          surfaceName.toLowerCase().includes(subject),
      ) && /검색|search|lookup/i.test(surfaceName)
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
      const kind =
        container.getAttribute("role") === "listbox"
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

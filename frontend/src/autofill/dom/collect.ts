import type {
  ActionCandidate,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsSection,
  PreparationAnalyzeRequest,
  PreparationSection,
} from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "./candidate-registry";
import type { CandidateBlockReason } from "./types";

const SECTION_SELECTOR = "fieldset, section, [role='group']";
const FORBIDDEN_ACTION =
  /저장|제출|지원|완료|다음|이전|이동|미리보기|submit|save|next|previous|preview/i;
const MAX_METADATA_LENGTH = 200;

export interface CollectedSnapshot<TRequest> {
  request: TRequest;
  registry: CandidateRegistry;
}

function createOpaqueId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function createSnapshotId(prefix: "preparation" | "fields"): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

function metadata(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_METADATA_LENGTH);
}

function labelOf(element: HTMLElement): string | undefined {
  const ariaLabelledBy = metadata(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    const labelledText = metadata(text);
    if (labelledText) return labelledText;
  }
  const ariaLabel = metadata(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelText = metadata(element.labels?.[0]?.textContent);
    if (labelText) return labelText;
    const placeholder = metadata(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
  }
  return metadata(element.textContent);
}

function sectionName(container: Element | null): string | undefined {
  if (!container) return undefined;
  return (
    metadata(container.getAttribute("aria-label")) ??
    metadata(
      container.querySelector(
        ":scope > legend, :scope > h1, :scope > h2, :scope > h3",
      )?.textContent,
    )
  );
}

function isHidden(element: HTMLElement): boolean {
  return Boolean(
    element.hidden ||
    element.closest("[hidden], [aria-hidden='true']") ||
    element.closest("[style*='display: none'], [style*='display:none']"),
  );
}

function isInert(element: HTMLElement): boolean {
  return Boolean(element.closest("[inert]"));
}

function blockReason(element: HTMLElement): CandidateBlockReason | undefined {
  if (isHidden(element)) return "hidden";
  if (isInert(element)) return "inert";
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement) &&
    element.disabled
  ) {
    return "disabled";
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return "readonly";
  }
  return undefined;
}

function visibility(element: HTMLElement): "visible" | "hidden" {
  return isHidden(element) ? "hidden" : "visible";
}

function siteOf(document: Document): { host: string; pathPattern: string } {
  const pathPattern = document.location.pathname
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
      segment.length > 32
        ? "*"
        : segment,
    )
    .join("/");
  return {
    host: document.location.host,
    pathPattern: pathPattern || "/",
  };
}

function groupBySection<T extends Element>(
  elements: T[],
): Map<Element | null, T[]> {
  const groups = new Map<Element | null, T[]>();
  for (const element of elements) {
    const section = element.closest(SECTION_SELECTOR);
    groups.set(section, [...(groups.get(section) ?? []), element]);
  }
  if (groups.size === 0) groups.set(null, []);
  return groups;
}

function baseCandidate(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  candidateId: string,
) {
  return {
    candidateId,
    visibility: visibility(element),
    ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
    ...(metadata(element.id) ? { domId: metadata(element.id) } : {}),
    ...(metadata(element.name) ? { domName: metadata(element.name) } : {}),
    ...(metadata(element.getAttribute("placeholder"))
      ? { placeholder: metadata(element.getAttribute("placeholder")) }
      : {}),
    ...(element.disabled ? { disabled: true as const } : {}),
    ...("readOnly" in element && element.readOnly
      ? { readonly: true as const }
      : {}),
    ...(isInert(element) ? { inert: true as const } : {}),
  };
}

function collectFieldElements(document: Document) {
  return Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  ).filter((element) => {
    if (!(element instanceof HTMLInputElement)) return true;
    return ![
      "hidden",
      "password",
      "file",
      "submit",
      "button",
      "reset",
      "image",
    ].includes(element.type);
  });
}

export function collectFieldsSnapshot(
  document: Document,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: FieldsSection[] = [];
  const groups = groupBySection(collectFieldElements(document));

  Array.from(groups.entries()).forEach(
    ([container, elements], sectionIndex) => {
      const sectionId = container
        ? createOpaqueId("section", sectionIndex)
        : "section-root";
      const fields: FieldCandidate[] = [];
      const consumed = new Set<Element>();

      for (const element of elements) {
        if (consumed.has(element)) continue;
        const isChoice =
          element instanceof HTMLInputElement &&
          (element.type === "radio" || element.type === "checkbox");
        const grouped =
          isChoice && element.name
            ? elements.filter(
                (peer) =>
                  peer instanceof HTMLInputElement &&
                  peer.type === element.type &&
                  peer.name === element.name,
              )
            : [element];
        grouped.forEach((peer) => consumed.add(peer));

        const candidateId = createOpaqueId("field", candidateIndex++);
        const first = grouped[0]!;
        let candidate: FieldCandidate;
        const optionElements = new Map<
          string,
          HTMLOptionElement | HTMLInputElement
        >();
        if (isChoice) {
          const options = grouped.map((peer, optionIndex) => {
            const optionId = createOpaqueId(
              `${candidateId}-option`,
              optionIndex,
            );
            optionElements.set(optionId, peer as HTMLInputElement);
            return {
              optionId,
              displayName:
                labelOf(peer as HTMLElement) ?? `선택 ${optionIndex + 1}`,
            };
          });
          candidate = {
            ...baseCandidate(first, candidateId),
            element: "input",
            control: (first as HTMLInputElement).type as "radio" | "checkbox",
            options,
          };
        } else if (first instanceof HTMLSelectElement) {
          const options = Array.from(first.options)
            .map((option, optionIndex) => {
              const displayName = metadata(option.textContent);
              if (!displayName) return undefined;
              const optionId = createOpaqueId(
                `${candidateId}-option`,
                optionIndex,
              );
              optionElements.set(optionId, option);
              return { optionId, displayName };
            })
            .filter(
              (option): option is { optionId: string; displayName: string } =>
                Boolean(option),
            );
          candidate = {
            ...baseCandidate(first, candidateId),
            element: "select",
            control: "select",
            ...(options.length > 0 ? { options } : {}),
          };
        } else {
          candidate = {
            ...baseCandidate(first, candidateId),
            element:
              first instanceof HTMLTextAreaElement ? "textarea" : "input",
            control: first instanceof HTMLTextAreaElement ? "textarea" : "text",
          };
        }

        fields.push(candidate);
        const elementsForHandle = grouped as Array<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >;
        registry.registerField(
          {
            kind: "field",
            candidateId,
            candidate,
            elements: elementsForHandle,
            optionElements,
            sectionId,
            signature: createStructuralSignature(elementsForHandle),
          },
          blockReason(first),
        );
      }
      sections.push({
        sectionId,
        ...(sectionName(container)
          ? { displayName: sectionName(container) }
          : {}),
        fields,
      });
    },
  );

  return {
    request: {
      schemaVersion: 2,
      snapshotId: createSnapshotId("fields"),
      site: siteOf(document),
      sections,
    },
    registry,
  };
}

function collectActionElements(document: Document) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      "button, input[type='button']",
    ),
  ).filter((element) => {
    const label = labelOf(element);
    return Boolean(label && !FORBIDDEN_ACTION.test(label));
  });
}

export function collectPreparationSnapshot(
  document: Document,
): CollectedSnapshot<PreparationAnalyzeRequest> {
  const registry = new CandidateRegistry();
  let candidateIndex = 0;
  const sections: PreparationSection[] = [];
  const groups = groupBySection(collectActionElements(document));

  Array.from(groups.entries()).forEach(
    ([container, elements], sectionIndex) => {
      const sectionId = container
        ? createOpaqueId("section", sectionIndex)
        : "section-root";
      const actionCandidates: ActionCandidate[] = elements.map((element) => {
        const candidateId = createOpaqueId("action", candidateIndex++);
        const candidate: ActionCandidate = {
          candidateId,
          element: element instanceof HTMLButtonElement ? "button" : "input",
          control: "button",
          visibility: visibility(element),
          ...(labelOf(element) ? { displayName: labelOf(element) } : {}),
          ...(metadata(element.id) ? { domId: metadata(element.id) } : {}),
          ...(metadata(element.name)
            ? { domName: metadata(element.name) }
            : {}),
          ...(element.disabled ? { disabled: true } : {}),
          ...(isInert(element) ? { inert: true } : {}),
        };
        registry.registerAction(
          {
            kind: "action",
            candidateId,
            candidate,
            element,
            sectionId,
            signature: createStructuralSignature([element]),
          },
          blockReason(element),
        );
        return candidate;
      });
      sections.push({
        sectionId,
        ...(sectionName(container)
          ? { displayName: sectionName(container) }
          : {}),
        actionCandidates,
      });
    },
  );

  return {
    request: {
      schemaVersion: 2,
      snapshotId: createSnapshotId("preparation"),
      site: siteOf(document),
      sections,
    },
    registry,
  };
}

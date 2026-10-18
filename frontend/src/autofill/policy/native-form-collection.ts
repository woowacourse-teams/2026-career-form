import {
  excludedSearchRow,
  searchNodes,
  sameSearchNodes,
  protectedSearchRow,
  searchGate,
  type SearchNodes,
} from "./native-form-search-dom";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type {
  CollectedSnapshot,
  PreparationCollectedSnapshot,
} from "../dom/collect";
import type {
  FieldsAnalyzeRequest,
  FieldCandidate,
  FieldsSection,
  PreparationAnalyzeRequest,
  SiteDescriptor,
} from "../api/types";
import { executionPolicy } from "../workflow/execution-policy";
import { visible } from "./primitives";
import {
  validNativeForm,
  type NativeField,
  type NativeForm,
  type NativeSection,
} from "./native-form-contract";

export interface NativeOwnership {
  search?: SearchNodes;
  form: NativeForm;
  section: NativeSection;
  root: Element;
  row: Element;
  index?: number;
  field: NativeField;
  observedOptions: { element: HTMLElement; code: string; label: string }[];
  digest: string;
  url: string;
}
const owners = new WeakMap<FieldCandidateHandle, NativeOwnership>();
export const nativeOwnership = (handle: FieldCandidateHandle) =>
  owners.get(handle);
export const rawNativeName = (name: string, index?: number) =>
  name.replace("{index}", String(index));
export function nativeForm(document: Document): NativeForm | undefined {
  const p = executionPolicy(document)?.browserPolicy;
  return p?.schemaVersion === 2 && validNativeForm(p.nativeForm)
    ? p.nativeForm
    : undefined;
}
export function nativeDocument(
  document: Document,
  form = nativeForm(document),
): boolean {
  if (!form || new URL(document.URL).pathname !== form.path) return false;
  const roots = document.querySelectorAll(form.rootSelector),
    forms = document.querySelectorAll(form.formSelector);
  if (
    forms.length !== 1 ||
    !(forms[0] instanceof HTMLFormElement) ||
    roots.length !== 1 ||
    !forms[0].contains(roots[0])
  )
    return false;
  const paths = Array.from(document.querySelectorAll("script[src]")).flatMap(
    (s) => {
      try {
        const u = new URL(s.getAttribute("src")!, document.baseURI);
        return u.origin === document.location.origin ? [u.pathname] : [];
      } catch {
        return [];
      }
    },
  );
  return form.assetPaths.every((path) =>
    paths.some((actual) => actual.endsWith(path)),
  );
}
export function nativeRows(
  root: Element,
  section: NativeSection,
): Element[] | undefined {
  if (!root.isConnected) return;
  if (!section.rows) return [root];
  const rows = Array.from(root.querySelectorAll(section.rows.selector));
  if (rows.length > section.rows.maxCount) return;
  for (const [index, row] of rows.entries()) {
    const names = Array.from(
      row.querySelectorAll<HTMLInputElement>("[name]"),
    ).map((e) => e.name);
    if (
      names.some(
        (n) =>
          n.startsWith(`${section.rows!.namePrefix}[`) &&
          !n.startsWith(`${section.rows!.namePrefix}[${index}].`),
      )
    )
      return;
    if (
      !section.anchors.every((n) => {
        const field = section.fields.find((f) => f.name === n)!;
        return (
          row.querySelectorAll(
            `[name="${CSS.escape(rawNativeName(field.rawName, index))}"]`,
          ).length === 1
        );
      })
    )
      return;
  }
  return rows;
}
function scopes(document: Document, form: NativeForm) {
  const owner = document.querySelector(form.rootSelector)!;
  return form.sections.flatMap((section) => {
    const roots = Array.from(
      document.querySelectorAll(section.selector),
    ).filter((r) => r === owner || owner.contains(r));
    if (roots.length !== 1 || !visible(roots[0], true)) return [];
    const rows = nativeRows(roots[0], section);
    return rows ? [{ section, root: roots[0], rows }] : [];
  });
}
function controls(row: Element, field: NativeField, index?: number) {
  if (field.search) {
    const n = searchNodes(row, field, index);
    return n ? [n.query] : [];
  }
  const all = Array.from(
    row.querySelectorAll(
      `[name="${CSS.escape(rawNativeName(field.rawName, index))}"]`,
    ),
  );
  if (
    field.scopeSelector &&
    all.some(
      (e) =>
        !e.closest(field.scopeSelector!) ||
        !row.contains(e.closest(field.scopeSelector!)),
    )
  )
    return [];
  if (!all.length || (field.type !== "radio" && all.length !== 1)) return [];
  return all.every((e) =>
    field.type === "select"
      ? e instanceof HTMLSelectElement
      : field.type === "textarea"
        ? e instanceof HTMLTextAreaElement
        : e instanceof HTMLInputElement &&
          e.type ===
            (field.type === "number"
              ? "number"
              : field.type === "radio"
                ? "radio"
                : "text"),
  )
    ? (all as FieldCandidateHandle["elements"])
    : [];
}
export function currentNativeOwner(
  handle: FieldCandidateHandle,
): NativeOwnership | undefined {
  const o = owners.get(handle);
  if (!o) return;
  const document = o.row.ownerDocument,
    form = nativeForm(document);
  if (
    !form ||
    document.URL !== o.url ||
    JSON.stringify(form) !== o.digest ||
    !nativeDocument(document, form) ||
    !o.root.isConnected ||
    !o.row.isConnected
  )
    return;
  const scope = scopes(document, form).find(
    (s) => s.section.id === o.section.id,
  );
  if (
    !scope ||
    scope.root !== o.root ||
    (o.index === undefined ? o.row !== o.root : scope.rows[o.index] !== o.row)
  )
    return;
  if (
    o.search &&
    !sameSearchNodes(o.search, searchNodes(o.row, o.field, o.index))
  )
    return;
  if (
    o.section.fields.some(
      (f) => f.search && protectedSearchRow(o.row, f.search, o.index),
    )
  )
    return;
  if (!searchGate(o.row, o.field, o.section.fields, o.index)) return;
  const current = controls(o.row, o.field, o.index);
  if (
    current.length !== handle.elements.length ||
    current.some((e, i) => e !== handle.elements[i])
  )
    return;
  return o;
}
export function collectNativeFields(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
  legacy?: CollectedSnapshot<FieldsAnalyzeRequest>,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const registry = legacy?.registry ?? new CandidateRegistry();
  const sections: FieldsSection[] = [...(legacy?.request.sections ?? [])];
  const form = nativeForm(document);
  const claimed = new Set<Element>();
  for (const s of sections)
    for (const f of s.fields) {
      const found = registry.lookupField(f.candidateId);
      if ("handle" in found) {
        found.handle.owner = "legacy";
        const previous = found.handle.isCurrentContext;
        const digest = JSON.stringify(executionPolicy(document)?.browserPolicy),
          url = document.URL;
        found.handle.isCurrentContext = () =>
          previous?.() !== false &&
          document.URL === url &&
          JSON.stringify(executionPolicy(document)?.browserPolicy) === digest;
        found.handle.elements.forEach((e) => claimed.add(e));
      }
    }
  if (!form || !nativeDocument(document, form))
    return {
      registry,
      request: { schemaVersion: 2, snapshotId, site, sections },
    };
  let next = 0;
  for (const { section, root, rows } of scopes(document, form)) {
    const fields: FieldCandidate[] = [];
    const items: NonNullable<FieldsSection["items"]> = [];
    for (const [position, row] of rows.entries()) {
      const index = section.rows ? position : undefined;
      const itemFields: FieldCandidate[] = [];
      const itemId = section.rows
        ? `${section.id}-item-${position}`
        : undefined;
      const excluded = section.fields.some((f) =>
        excludedSearchRow(row, f, index),
      );
      if (excluded && !section.excludedRow) continue;
      for (const field of section.fields) {
        if (
          excluded
            ? field.name !== section.excludedRow!.name
            : !searchGate(row, field, section.fields, index)
        )
          continue;
        const elements = controls(row, field, index);
        if (
          !elements.length ||
          elements.some((e) => claimed.has(e)) ||
          (!excluded &&
            elements.some(
              (e) => !visible(e) || ("readOnly" in e && e.readOnly),
            ))
        )
          continue;
        const candidateId = `native-field-${++next}`;
        const optionElements = new Map<string, HTMLElement>();
        if (elements[0] instanceof HTMLSelectElement) {
          for (const opt of Array.from(elements[0].options))
            if (opt.value && !opt.disabled && opt.textContent?.trim())
              optionElements.set(
                `${candidateId}-option-${optionElements.size}`,
                opt,
              );
        } else if (field.type === "radio") {
          for (const el of elements as HTMLInputElement[])
            if (el.labels?.[0]?.textContent?.trim())
              optionElements.set(
                `${candidateId}-option-${optionElements.size}`,
                el,
              );
        }
        const candidate: FieldCandidate = {
          candidateId,
          domId: field.name,
          domName: field.name,
          element:
            field.type === "select"
              ? "select"
              : field.type === "textarea"
                ? "textarea"
                : "input",
          control: field.type === "number" ? "text" : field.type,
          displayName: excluded ? section.excludedRow!.reason : field.label,
          visibility: "visible",
          ...(!section.enabled || excluded ? { inert: true as const } : {}),
          ...(optionElements.size
            ? {
                options: [...optionElements].map(([optionId, e]) => ({
                  optionId,
                  displayName:
                    e instanceof HTMLOptionElement
                      ? e.textContent!.trim()
                      : (e as HTMLInputElement).labels![0].textContent!.trim(),
                })),
              }
            : {}),
          semanticContext: {
            ...(field.type === "number"
              ? { inputType: "number" as const }
              : {}),
            ...(section.rows
              ? {
                  repeat: {
                    groupId: section.rows.groupId,
                    rowIndex: position,
                    rowCount: rows.length,
                  },
                }
              : {}),
          },
        };
        const handle: FieldCandidateHandle = {
          kind: "field",
          owner: "native",
          candidateId,
          candidate,
          sectionId: section.id,
          itemId,
          itemIndex: index,
          itemGroupId: section.rows?.groupId,
          elements,
          optionElements,
          signature: createStructuralSignature(elements),
          isCurrentContext: () => !!currentNativeOwner(handle),
          unsupportedReason: excluded
            ? section.excludedRow!.reason
            : !section.enabled
              ? section.reason
              : undefined,
        };
        owners.set(handle, {
          search: field.search ? searchNodes(row, field, index) : undefined,
          form,
          section,
          root,
          row,
          index,
          field,
          observedOptions: [...optionElements.values()].map((e) => ({
            element: e,
            code: (e as HTMLOptionElement | HTMLInputElement).value,
            label:
              e instanceof HTMLOptionElement
                ? e.textContent!.trim()
                : (e as HTMLInputElement).labels![0].textContent!.trim(),
          })),
          digest: JSON.stringify(form),
          url: document.URL,
        });
        registry.registerField(
          handle,
          section.enabled && !excluded ? undefined : "unsupported",
        );
        elements.forEach((e) => claimed.add(e));
        (section.rows ? itemFields : fields).push(candidate);
      }
      if (itemId && itemFields.length)
        items.push({
          itemId,
          itemGroupId: section.rows!.groupId,
          fields: itemFields,
        });
    }
    if (section.rows) {
      registry.setFieldItemCount(section.id, rows.length, section.rows.groupId);
      registry.setFieldItemElements(section.id, rows, section.rows.groupId);
    }
    if (fields.length || items.length)
      sections.push({
        sectionId: section.id,
        displayName: section.title,
        fields,
        ...(items.length ? { items } : {}),
      });
  }
  return {
    registry,
    request: { schemaVersion: 2, snapshotId, site, sections },
  };
}
const forbidden =
  /save|submit|next|prev|file|upload|delete|remove|reset|existYn|저장|제출|다음|이전|삭제|미리보기/i;
export function collectNativePreparation(
  document: Document,
  snapshotId: string,
  site: SiteDescriptor,
  legacy?: PreparationCollectedSnapshot,
): PreparationCollectedSnapshot {
  const registry = legacy?.registry ?? new CandidateRegistry();
  const sections: PreparationAnalyzeRequest["sections"] = [
    ...(legacy?.request.sections ?? []),
  ];
  const form = nativeForm(document);
  const actions = new Map<string, { root: Element; section: NativeSection }>();
  if (form && nativeDocument(document, form))
    for (const { section, root, rows } of scopes(document, form)) {
      const candidates: PreparationAnalyzeRequest["sections"][number]["actionCandidates"] =
        [];
      if (
        section.enabled &&
        section.action &&
        section.rows &&
        rows.length < section.rows.maxCount
      ) {
        const buttons = Array.from(
          root.querySelectorAll(section.action.selector),
        ).filter(
          (e): e is HTMLButtonElement =>
            e instanceof HTMLButtonElement &&
            e.type === "button" &&
            visible(e) &&
            !forbidden.test(
              [e.textContent, e.name, e.id, e.getAttribute("data-button")].join(
                " ",
              ),
            ) &&
            (section.action!.scope === "SECTION"
              ? !rows.some((row) => row.contains(e))
              : rows.length === 0
                ? e.parentElement === root
                : e.closest(section.rows!.selector.replace(":scope > ", "")) ===
                  rows.at(-1)),
        );
        if (buttons.length === 1) {
          const candidateId = `native-action-${actions.size}`;
          const candidate = {
            candidateId,
            domId: section.action.id,
            displayName: section.action.label,
            element: "button" as const,
            control: "button" as const,
            visibility: "visible" as const,
          };
          registry.registerAction({
            kind: "action",
            owner: "native",
            candidateId,
            candidate,
            sectionId: section.id,
            element: buttons[0],
            signature: createStructuralSignature(buttons),
            isCurrentContext: () => {
              const now = nativeForm(document);
              return (
                !!now &&
                JSON.stringify(now) === JSON.stringify(form) &&
                nativeDocument(document, now) &&
                buttons[0].type === "button" &&
                buttons[0].matches(section.action!.selector) &&
                root.contains(buttons[0]) &&
                !forbidden.test(
                  [
                    buttons[0].textContent,
                    buttons[0].name,
                    buttons[0].id,
                    buttons[0].getAttribute("data-button"),
                  ].join(" "),
                ) &&
                !!nativeRows(root, section)
              );
            },
          });
          actions.set(candidateId, { root, section });
          candidates.push(candidate);
        }
      }
      sections.push({
        sectionId: section.id,
        displayName: section.title,
        actionCandidates: candidates,
      });
    }
  const current = (id: string) => {
    const a = actions.get(id);
    return a && nativeDocument(document, form)
      ? nativeRows(a.root, a.section)
      : undefined;
  };
  return {
    registry,
    request: { schemaVersion: 2, snapshotId, site, sections },
    isSectionVisible: (id) => sections.some((s) => s.sectionId === id),
    countRepeatableGroups: (id) => current(id)?.length,
    repeatableGroupLimit: (id) => actions.get(id)?.section.rows?.maxCount,
    repeatableGroupState: (id) =>
      current(id)?.map((row) =>
        JSON.stringify(
          Array.from(
            row.querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >("input,select,textarea"),
          ).map((e) => [
            e.tagName,
            e.name,
            e.value,
            e instanceof HTMLInputElement ? e.checked : null,
          ]),
        ),
      ),
  };
}

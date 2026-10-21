import { debugCollectionSkip } from "../debug/structural-diagnostics";
import { isAutofillDebugEnabled } from "../debug/autofill-debug";
import {
  nativeNestedRows,
  nativeNestedPreparationCurrent,
  nativeNestedState,
} from "./native-form-nested";
import {
  collectStagedAddress,
  collectStagedAddressAction,
} from "./staged-address-collection";
import { nativePreparationRowsCurrent } from "./native-form-row-state";
import { nativeUnitMatches } from "./native-form-unit";
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
import { executionPolicy, policyDigest } from "../workflow/execution-policy";
import { visible } from "./primitives";
import {
  validNativeForm,
  type NativeField,
  type NativeForm,
  type NativeSection,
} from "./native-form-contract";

export interface NativeOwnership {
  childRow?: Element;
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
/** 정책은 객체 단위로 통째 설치되므로 검증 결과를 정책 객체별로 한 번만 계산한다. */
const validatedForms = new WeakMap<object, NativeForm | undefined>();
/** 같은 NativeForm 객체의 내용 지문은 한 번만 직렬화한다. */
const formDigests = new WeakMap<NativeForm, string>();
export const nativeFormDigest = (form: NativeForm) => {
  let digest = formDigests.get(form);
  if (digest === undefined) {
    digest = JSON.stringify(form);
    formDigests.set(form, digest);
  }
  return digest;
};
const sameNativeForm = (a: NativeForm, b: NativeForm) =>
  a === b || nativeFormDigest(a) === nativeFormDigest(b);
export function nativeForm(document: Document): NativeForm | undefined {
  const p = executionPolicy(document)?.browserPolicy;
  if (p?.schemaVersion !== 2) return undefined;
  if (validatedForms.has(p)) return validatedForms.get(p);
  const form = validNativeForm(p.nativeForm) ? p.nativeForm : undefined;
  if (!form)
    debugCollectionSkip("hplace-mrs2", "policy-missing", "native-form-schema");
  validatedForms.set(p, form);
  return form;
}
export function nativeDocument(
  document: Document,
  form = nativeForm(document),
): boolean {
  if (!form || new URL(document.URL).pathname !== form.path) {
    debugCollectionSkip(
      "hplace-mrs2",
      "policy-missing",
      "native-path-contract",
    );
    return false;
  }
  const roots = document.querySelectorAll(form.rootSelector),
    forms = document.querySelectorAll(form.formSelector);
  if (
    forms.length !== 1 ||
    !(forms[0] instanceof HTMLFormElement) ||
    roots.length !== 1 ||
    !forms[0].contains(roots[0])
  ) {
    debugCollectionSkip("hplace-mrs2", "owner-mismatch", "form-root-count");
    return false;
  }
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
  const matches = form.assetPaths.every((path) =>
    paths.some((actual) => actual.endsWith(path)),
  );
  if (!matches)
    debugCollectionSkip(
      "hplace-mrs2",
      "asset-path",
      "same-origin-asset-suffix",
    );
  return matches;
}
export function nativeRows(
  root: Element,
  section: NativeSection,
): Element[] | undefined {
  if (!root.isConnected) return;
  if (!section.rows) return [root];
  const rows = Array.from(root.querySelectorAll(section.rows.selector));
  if (
    rows.length > section.rows.maxCount ||
    root.querySelectorAll(
      `[data-loop="${CSS.escape(section.rows.namePrefix)}"]`,
    ).length !== rows.length
  )
    return;
  for (const [index, row] of rows.entries()) {
    if (
      row.hasAttribute("data-index") &&
      row.getAttribute("data-index") !== String(index)
    )
      return;
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
    if (roots.length !== 1 || !visible(roots[0], true)) {
      debugCollectionSkip(
        section.id,
        roots.length !== 1 ? "section-missing" : "section-hidden",
        "native-section-root",
      );
      return [];
    }
    const rows = nativeRows(roots[0], section);
    if (!rows)
      debugCollectionSkip(section.id, "row-identity", "native-row-contract");
    return rows ? [{ section, root: roots[0], rows }] : [];
  });
}
/** 소유 섹션 하나의 범위만 계산한다. scopes()와 같은 검사를 섹션 단위로 적용한다. */
function ownerScope(document: Document, form: NativeForm, sectionId: string) {
  const owner = document.querySelector(form.rootSelector)!;
  const section = form.sections.find((s) => s.id === sectionId);
  if (!section) return undefined;
  const roots = Array.from(document.querySelectorAll(section.selector)).filter(
    (r) => r === owner || owner.contains(r),
  );
  if (roots.length !== 1 || !visible(roots[0], true)) return undefined;
  const rows = nativeRows(roots[0], section);
  return rows ? { section, root: roots[0], rows } : undefined;
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
    nativeFormDigest(form) !== o.digest ||
    !nativeDocument(document, form) ||
    !o.root.isConnected ||
    !o.row.isConnected
  )
    return;
  const scope = ownerScope(document, form, o.section.id);
  if (
    !scope ||
    scope.root !== o.root ||
    (o.index === undefined ? o.row !== o.root : scope.rows[o.index] !== o.row)
  )
    return;
  if (
    o.childRow &&
    nativeNestedRows(o.row, o.section, o.index!)?.[o.field.nestedIndex!] !==
      o.childRow
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
/** Neutral detail per policy reason; titles and reason text never reach a line. */
const unsupportedDetails: Readonly<Record<string, string>> = {
  "프로필 키 없음": "profile-key-missing",
};
/** One debug line per visible policy-unsupported subject inside the root. */
function debugUnsupportedSections(document: Document, form: NativeForm) {
  if (!isAutofillDebugEnabled()) return;
  const root = document.querySelector(form.rootSelector);
  if (!root) return;
  for (const unsupported of form.unsupportedSections) {
    const code = /data-code=['"]?([^'"\]]*)['"]?\]/.exec(
      unsupported.selector,
    )?.[1];
    if (!code || !/^\d{1,4}$/.test(code)) continue;
    let nodes: Element[];
    try {
      nodes = Array.from(root.querySelectorAll(unsupported.selector));
    } catch {
      continue;
    }
    if (!nodes.some((node) => visible(node, true))) continue;
    debugCollectionSkip(
      `hplace-mrs2-unsupported-${code}`,
      "unsupported-section",
      unsupportedDetails[unsupported.reason] ?? "policy-unsupported",
    );
  }
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
        const digest = policyDigest(executionPolicy(document)?.browserPolicy),
          url = document.URL;
        found.handle.isCurrentContext = () =>
          previous?.() !== false &&
          document.URL === url &&
          policyDigest(executionPolicy(document)?.browserPolicy) === digest;
        found.handle.elements.forEach((e) => claimed.add(e));
      }
    }
  if (!form || !nativeDocument(document, form))
    return {
      registry,
      request: { schemaVersion: 2, snapshotId, site, sections },
    };
  debugUnsupportedSections(document, form);
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
      if (excluded && !section.excludedRow) {
        debugCollectionSkip(section.id, "excluded-row", "native-row-exclusion");
        continue;
      }
      for (const field of section.fields) {
        const childRows =
          field.nestedIndex === undefined
            ? undefined
            : nativeNestedRows(row, section, index!);
        const childRow =
          field.nestedIndex === undefined
            ? undefined
            : childRows?.[field.nestedIndex];
        if (field.nestedIndex !== undefined && !childRow) {
          if (childRows && field.nestedIndex >= childRows.length)
            debugCollectionSkip(
              field.name,
              "control-missing",
              "nested-row-absent",
            );
          else debugCollectionSkip(field.name, "owner-mismatch", "nested-row");
          continue;
        }
        if (
          excluded
            ? field.name !== section.excludedRow!.name
            : !searchGate(row, field, section.fields, index)
        ) {
          debugCollectionSkip(
            field.name,
            "dependency-inactive",
            "native-search-gate",
          );
          continue;
        }
        const elements = controls(row, field, index);
        if (
          !elements.length ||
          (childRow && elements.some((e) => !childRow.contains(e))) ||
          elements.some((e) => claimed.has(e)) ||
          (!excluded &&
            elements.some(
              (e) => !visible(e) || ("readOnly" in e && e.readOnly),
            ))
        ) {
          debugCollectionSkip(
            field.name,
            elements.some((e) => claimed.has(e))
              ? "legacy-owner"
              : !elements.length
                ? "control-missing"
                : elements.some((e) => e.matches(":disabled"))
                  ? "disabled"
                  : "owner-mismatch",
            "native-field-contract",
          );
          continue;
        }
        const unitMismatch = elements.some(
          (e) => !nativeUnitMatches(e, row, field.unit),
        );
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
          unsupportedReason: unitMismatch
            ? "입력 불가(단위 불일치)"
            : excluded
              ? section.excludedRow!.reason
              : !section.enabled
                ? section.reason
                : undefined,
        };
        owners.set(handle, {
          childRow,
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
          digest: nativeFormDigest(form),
          url: document.URL,
        });
        registry.registerField(
          handle,
          section.enabled && !excluded && !unitMismatch
            ? undefined
            : "unsupported",
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
  collectStagedAddress(document, registry, sections);
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
  const actions = new Map<
    string,
    { root: Element; section: NativeSection; parent?: Element; index?: number }
  >();
  if (form && nativeDocument(document, form))
    for (const { section, root, rows } of scopes(document, form)) {
      const candidates: PreparationAnalyzeRequest["sections"][number]["actionCandidates"] =
        [];
      if (
        section.action &&
        (!section.enabled ||
          !section.rows ||
          !rows.length ||
          rows.length >= section.rows.maxCount)
      )
        debugCollectionSkip(
          section.action.id,
          "row-add-guard",
          !section.enabled
            ? "section-disabled"
            : !rows.length
              ? "zero-rows"
              : "row-limit-or-disabled",
        );
      if (
        section.enabled &&
        section.action &&
        section.rows &&
        rows.length > 0 &&
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
        if (buttons.length !== 1)
          debugCollectionSkip(
            section.action.id,
            "owner-mismatch",
            "native-add-button-count",
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
                sameNativeForm(now, form) &&
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
                !!nativeRows(root, section) &&
                nativePreparationRowsCurrent(root, nativeRows(root, section)!)
              );
            },
          });
          actions.set(candidateId, { root, section });
          candidates.push(candidate);
        }
      }
      const items: NonNullable<
        PreparationAnalyzeRequest["sections"][number]["items"]
      > = [];
      if (section.enabled && section.nested)
        for (const [index, parent] of rows.entries()) {
          const n = section.nested,
            children = nativeNestedRows(parent, section, index);
          if (!children) {
            debugCollectionSkip(
              section.id,
              "row-identity",
              "nested-preparation-rows",
            );
            continue;
          }
          const owned = (allowDisabled: boolean) =>
            Array.from(parent.querySelectorAll(n.action.selector)).filter(
              (e): e is HTMLButtonElement =>
                e instanceof HTMLButtonElement &&
                e.type === "button" &&
                visible(e, allowDisabled) &&
                e.closest(`[data-loop="${n.namePrefix}"]`) ===
                  children.at(-1) &&
                e.getAttribute("data-rel-target") ===
                  `${section.rows!.namePrefix}[${index}]` &&
                !forbidden.test(
                  [
                    e.textContent,
                    e.name,
                    e.id,
                    e.getAttribute("data-button"),
                  ].join(" "),
                ),
            );
          const buttons = owned(false);
          if (buttons.length !== 1) {
            // Diagnostics only: the disabled add never becomes a candidate.
            const candidates =
              buttons.length || !isAutofillDebugEnabled() ? [] : owned(true);
            if (candidates.length === 1 && candidates[0].matches(":disabled"))
              debugCollectionSkip(
                section.id,
                "disabled",
                "nested-add-disabled",
              );
            else
              debugCollectionSkip(
                section.id,
                "owner-mismatch",
                "nested-add-button-count",
              );
            continue;
          }
          const candidateId = `native-action-${actions.size}`,
            itemId = `${section.id}-item-${index}`;
          const candidate = {
            candidateId,
            domId: n.action.idPrefix + index,
            displayName: n.action.label,
            element: "button" as const,
            control: "button" as const,
            visibility: "visible" as const,
          };
          const url = document.URL,
            digest = nativeFormDigest(form);
          registry.registerAction({
            kind: "action",
            owner: "native",
            candidateId,
            candidate,
            sectionId: section.id,
            itemId,
            itemIndex: index,
            element: buttons[0],
            signature: createStructuralSignature(buttons),
            isCurrentContext: () => {
              const current = nativeRows(root, section),
                child = nativeNestedRows(parent, section, index);
              return (
                document.URL === url &&
                (() => {
                  const now = nativeForm(document);
                  return !!now && nativeFormDigest(now) === digest;
                })() &&
                nativeDocument(document) &&
                !!current &&
                current[index] === parent &&
                !!child &&
                buttons[0].isConnected &&
                buttons[0].type === "button" &&
                visible(buttons[0]) &&
                buttons[0].matches(n.action.selector) &&
                child.at(-1)!.contains(buttons[0]) &&
                buttons[0].getAttribute("data-rel-target") ===
                  `${section.rows!.namePrefix}[${index}]` &&
                nativeNestedPreparationCurrent(parent, current)
              );
            },
          });
          actions.set(candidateId, { root, section, parent, index });
          items.push({ itemId, actionCandidates: [candidate] });
        }
      sections.push({
        sectionId: section.id,
        displayName: section.title,
        actionCandidates: candidates,
        ...(items.length ? { items } : {}),
      });
    }
  collectStagedAddressAction(document, registry, sections);
  const current = (id: string) => {
    const a = actions.get(id);
    return a && nativeDocument(document, form)
      ? a.parent
        ? nativeNestedRows(a.parent, a.section, a.index!)
        : nativeRows(a.root, a.section)
      : undefined;
  };
  return {
    registry,
    request: { schemaVersion: 2, snapshotId, site, sections },
    isSectionVisible: (id) => sections.some((s) => s.sectionId === id),
    countRepeatableGroups: (id) => current(id)?.length,
    repeatableGroupLimit: (id) => {
      const a = actions.get(id);
      return a?.parent ? a.section.nested?.maxCount : a?.section.rows?.maxCount;
    },
    repeatableGroupState: (id) => {
      const a = actions.get(id);
      if (a?.parent) {
        const parents = nativeRows(a.root, a.section);
        return parents && nativeNestedPreparationCurrent(a.parent, parents)
          ? nativeNestedState(a.parent, parents, a.section, a.index!)
          : undefined;
      }
      return current(id)?.map((row) =>
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
      );
    },
  };
}

/**
 * Test-only reference implementations (F) for the preservation properties of
 * CF-129 (Property 2). Each function is a verbatim copy of the pre-fix
 * implementation, renamed so the live code (F') can be compared against it on
 * inputs outside the bug condition:
 *
 * - `referenceLabelOf`: `dom/metadata.ts` `labelOf` (with its label helpers)
 * - `referenceGenericRows` / `referenceGenericRowFor`: `dom/repeatable-rows.ts`
 * - `referenceSafeActivation`: `interaction/search-surface-dom.ts`
 * - `referenceObserveResults`: `interaction/search-results.ts` readiness and
 *   completeness of `exact()`
 * - `referenceLocalItemCount`: `workflow/workflow-model.tsx` `localItemCount`
 *
 * Helpers that the fix does not change are imported from the live modules.
 * Do not update these copies when the live code changes: they pin the
 * baseline behavior.
 */
import {
  getWorkflowAdapter,
  type WorkflowAdapter,
} from "../../adapters/workflow";
import type { PreparationPlan } from "../../api/types";
import {
  collectPreparationSnapshot,
  type CollectedSnapshot,
} from "../../dom/collect";
import {
  genericFormGroupFor,
  genericFormGroups,
} from "../../dom/generic-form-groups";
import {
  controlSignature,
  HIGH_RISK_ACTION,
  normalized as searchNormalized,
  type SearchResult,
} from "../../interaction/readonly-search";
import {
  SearchFailure,
  type SearchSession,
} from "../../interaction/search-session";
import type { SearchSurface } from "../../interaction/search-surface";
import {
  elements,
  interactive,
  label,
  shown,
} from "../../interaction/search-surface-dom";
import { PROFILE_CATEGORIES } from "../../../profile/field-definitions";
import type {
  Profile,
  RepeatedProfileCategoryId,
} from "../../../profile/model";

// --- labelOf (dom/metadata.ts)

const MAX_METADATA_LENGTH = 120;
const DEFINITION_LIST_CONTROL_SELECTOR =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), select, textarea, [contenteditable='true']";
const LABEL_BOUNDARY_SELECTOR =
  "[data-repeatable-group], [data-repeater-item], fieldset, [role='group']";

function refMetadata(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_METADATA_LENGTH);
}

/** Accept a sibling label only inside a bounded, single-control group. */
function refUnassociatedLabelOf(
  element: HTMLElement,
): HTMLLabelElement | undefined {
  let group = element.parentElement;
  for (
    let depth = 0;
    group && depth < 4;
    depth += 1, group = group.parentElement
  ) {
    const controls = Array.from(
      group.querySelectorAll(
        "input:not([type='hidden']), select, textarea, [contenteditable='true']",
      ),
    );
    if (controls.length !== 1 || controls[0] !== element) return undefined;
    const labels = Array.from(
      group.querySelectorAll<HTMLLabelElement>(":scope > label"),
    ).filter(
      (label) =>
        (!label.htmlFor ||
          !element.ownerDocument.getElementById(label.htmlFor)) &&
        !label.control &&
        !label.closest("[hidden], [aria-hidden='true'], [inert]"),
    );
    if (labels.length > 1) return undefined;
    if (labels.length === 1) return labels[0];
    if (group.matches("form, fieldset, section")) break;
  }
  return undefined;
}

function labelBoundary(element: Element): Element | null {
  return element.closest(LABEL_BOUNDARY_SELECTOR);
}

/**
 * Read a definition-list label without crossing a repeat row or group.
 * A dd is eligible only when it owns this single non-button control; its
 * current value and any other text inside the dd are intentionally ignored.
 */
function refDefinitionListLabelOf(element: HTMLElement): string | undefined {
  const definition = element.closest("dd");
  const list = definition?.closest("dl");
  if (
    !definition ||
    !list ||
    labelBoundary(definition) !== labelBoundary(element)
  ) {
    return undefined;
  }

  const controls = Array.from(
    definition.querySelectorAll<HTMLElement>(DEFINITION_LIST_CONTROL_SELECTOR),
  ).filter((control) => control.closest("dd") === definition);
  if (controls.length !== 1 || controls[0] !== element) return undefined;

  const precedingTerms = Array.from(list.querySelectorAll("dt")).filter(
    (term) =>
      term.closest("dl") === list &&
      Boolean(
        term.compareDocumentPosition(definition) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  const nearestTerm = precedingTerms[precedingTerms.length - 1];
  if (!nearestTerm || labelBoundary(nearestTerm) !== labelBoundary(element)) {
    return undefined;
  }
  return refMetadata(nearestTerm.textContent);
}

export function referenceLabelOf(element: HTMLElement): string | undefined {
  const ariaLabelledBy = refMetadata(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    const labelledText = refMetadata(text);
    if (labelledText) return labelledText;
  }
  const ariaLabel = refMetadata(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelText = refMetadata(
      (element.labels?.[0] ?? refUnassociatedLabelOf(element))?.textContent,
    );
    if (labelText) return labelText;
    const placeholder = refMetadata(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
  }
  const definitionListLabel = refDefinitionListLabelOf(element);
  if (definitionListLabel) return definitionListLabel;
  return refMetadata(element.textContent);
}

// --- generic rows (dom/repeatable-rows.ts)

const MARKERS = "[data-repeatable-group], [data-repeater-item]";
const CONTROLS =
  "input:not([type='hidden']):not([type='button']), select, textarea";

function shape(element: Element): string {
  const controls = Array.from(
    element.querySelectorAll<HTMLInputElement>(CONTROLS),
  );
  if (controls.length < 2) return "";
  return controls
    .map((control) =>
      [
        control.tagName,
        control.type,
        control.name.replace(/\d+/g, "#"),
        control.labels?.[0]?.textContent?.trim() ??
          control.getAttribute("aria-label") ??
          "",
      ].join(":"),
    )
    .join("|");
}

function refIsGenericRepeatableRow(element: Element): boolean {
  if (element.closest("template, [data-template]")) return false;
  if (element.matches(MARKERS)) return true;
  const names = [element.id, ...element.classList];
  if (
    names.some(
      (name) =>
        /(?:^|[-_])item$/i.test(name) &&
        !/^(?:form|input|field|select)-item$/i.test(name),
    ) &&
    shape(element)
  )
    return true;
  if (
    !element.matches("fieldset, [role='group']") ||
    !element.parentElement?.closest("section, fieldset, [role='group']")
  )
    return false;
  const signature = shape(element);
  const label =
    element.querySelector(":scope > legend")?.textContent ??
    element.getAttribute("aria-label");
  if (!signature || !label) return false;
  return Array.from(element.parentElement.children).some(
    (peer) =>
      peer !== element &&
      peer.tagName === element.tagName &&
      shape(peer) === signature &&
      (peer.querySelector(":scope > legend")?.textContent ??
        peer.getAttribute("aria-label")) === label,
  );
}

export function referenceGenericRowFor(element: Element): Element | undefined {
  const grouped = genericFormGroupFor(element)?.rows.find(
    (row) => row === element || row.contains(element),
  );
  if (grouped) return grouped;
  let ancestor = element.parentElement;
  while (ancestor && !ancestor.matches("form, body")) {
    if (refIsGenericRepeatableRow(ancestor)) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return undefined;
}

export function referenceGenericRows(container: Element): Element[] {
  const candidates = Array.from(
    container.querySelectorAll(
      `${MARKERS}, [class], [id], fieldset, [role='group']`,
    ),
  ).filter(refIsGenericRepeatableRow);
  const groupedRows = genericFormGroups(container.ownerDocument)
    .filter(
      (group) => group.area === container || container.contains(group.area),
    )
    .flatMap((group) => group.rows);
  return [...new Set([...candidates, ...groupedRows])].filter(
    (row, _, rows) =>
      !rows.some((parent) => parent !== row && parent.contains(row)),
  );
}

// --- safeActivation (interaction/search-surface-dom.ts)

/** Only a single literal-bearing selector call is eligible for a normal UI click.
 * This does not evaluate the URL. Result scope, uniqueness and reflection are
 * independently checked by the search transaction. */
function simpleSelectionHref(href: string, labelText: string): boolean {
  if (href.length > 256 || HIGH_RISK_ACTION.test(href)) return false;
  const match = /^javascript:([A-Za-z_$][\w$]*)\('([^'\\\r\n]*)'\);?$/i.exec(
    href,
  );
  if (
    !match ||
    /^(eval|function|fetch|open|close|post|send|navigate|location|window|document|parent|top)$/i.test(
      match[1]!,
    )
  )
    return false;
  const label = searchNormalized(labelText);
  return (
    Boolean(label) &&
    match[2]!.split(/[|,]/).some((part) => searchNormalized(part) === label)
  );
}

export function referenceSafeActivation(
  element: HTMLElement,
  acceptedValues?: readonly string[],
): boolean {
  if (!interactive(element) || HIGH_RISK_ACTION.test(label(element)))
    return false;
  if (element.hasAttribute("download")) return false;
  const target =
    element.getAttribute("target") ||
    element.ownerDocument.querySelector("base")?.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return false;
  if (element.tagName === "BUTTON" || element.tagName === "INPUT")
    return (element as HTMLButtonElement).type === "button";
  if (element.tagName === "A") {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (href === "" || href === "#") return true;
    if (
      !acceptedValues ||
      !acceptedValues.some(
        (value) =>
          searchNormalized(value) ===
          searchNormalized(element.textContent ?? ""),
      ) ||
      element.closest("form") ||
      Array.from(element.attributes).some((attribute) =>
        /^on/i.test(attribute.name),
      )
    )
      return false;
    return simpleSelectionHref(href, element.textContent ?? "");
  }
  return (
    element.getAttribute("role") === "option" &&
    !element.hasAttribute("href") &&
    !element.querySelector("a[href], button, input")
  );
}

// --- exact() (interaction/search-results.ts)

type RootState = { root: HTMLElement; signature: string; busy: string | null };
export function referenceResultBaseline(surface: SearchSurface): RootState[] {
  return surface.resultRoots().map((root) => ({
    root,
    signature: root.textContent ?? "",
    busy: root.getAttribute("aria-busy"),
  }));
}
export function referenceObserveResults(
  surface: SearchSurface,
  session: SearchSession,
  baseline: RootState[],
  query: string | undefined,
) {
  const generation = surface.queryGeneration;
  let busySeen = false;
  const observe = () => {
    for (const root of surface.resultRoots()) {
      if (
        root.getAttribute("aria-busy") === "true" ||
        root.closest("[aria-busy='true']")
      )
        busySeen = true;
    }
  };
  const Observer = surface.document.defaultView?.MutationObserver;
  const observer = Observer
    ? new Observer((records) => {
        for (const record of records)
          if (
            record.attributeName === "aria-busy" &&
            (record.oldValue === "true" ||
              (record.target as Element).getAttribute("aria-busy") === "true")
          )
            busySeen = true;
        observe();
      })
    : undefined;
  observer?.observe(surface.root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
  });
  session.addCleanup(() => observer?.disconnect());

  return {
    exact(
      expected: readonly string[],
    ): { element: SearchResult; signature: string } | undefined {
      if (surface.queryGeneration !== generation)
        throw new SearchFailure("result_stale");
      if (surface.navigationPending()) return undefined;
      surface.revalidate();
      observe();
      const roots = surface.resultRoots();
      if (!roots.length) return undefined;
      if (roots.length !== 1) throw new SearchFailure("surface_ambiguous");
      const root = roots[0]!;
      if (
        root.getAttribute("aria-busy") === "true" ||
        root.closest("[aria-busy='true']")
      )
        return undefined;
      const previous = baseline.find((item) => item.root === root);
      const changed =
        !previous || previous.signature !== (root.textContent ?? "");
      const queryTagged =
        query !== undefined &&
        searchNormalized(root.getAttribute("data-search-query") ?? "") ===
          searchNormalized(query);
      const completeMarker =
        root.getAttribute("data-search-complete") === "true";
      const ready =
        query === undefined ||
        surface.hasCompletedNavigation(query) ||
        (queryTagged && completeMarker) ||
        (busySeen && changed && root.getAttribute("aria-busy") === "false");
      if (!ready) return undefined;
      const paging = elements<HTMLElement>(
        surface.root,
        "[rel='next'], [aria-label*='pagination' i], [aria-label*='페이지'], [data-has-more='true'], [data-virtualized='true'], [data-search-complete='false']",
      );
      if (paging.some(shown)) throw new SearchFailure("result_set_incomplete");
      if (
        elements<HTMLElement>(surface.root, "button, a").some(
          (control) =>
            shown(control) &&
            /^(더\s*보기|다음\s*(페이지|결과)|load more|next page)$/i.test(
              searchNormalized(control.textContent ?? ""),
            ),
        )
      )
        throw new SearchFailure("result_set_incomplete");
      const actions = elements<HTMLElement>(
        root,
        "[role='option'], a, button",
      ).filter(
        (element) =>
          shown(element) &&
          !element.querySelector("[role='option'], a, button"),
      );
      const positions = actions.filter((element) =>
        element.hasAttribute("aria-setsize"),
      );
      if (
        positions.some(
          (element) =>
            Number(element.getAttribute("aria-setsize")) !== actions.length,
        ) ||
        root.getAttribute("aria-setsize") === "-1"
      )
        throw new SearchFailure("result_set_incomplete");
      const declared =
        root.getAttribute("data-result-count") ??
        root.getAttribute("aria-setsize");
      if (
        declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) !== actions.length)
      )
        throw new SearchFailure("result_set_incomplete");
      // Absence of a Next button alone cannot establish a complete result set.
      const allPositionsDeclared =
        actions.length > 0 && positions.length === actions.length;
      if (!completeMarker && declared === null && !allPositionsDeclared)
        throw new SearchFailure("result_set_incomplete");
      const ordinals = actions.map((element) =>
        element.getAttribute("aria-posinset"),
      );
      if (
        ordinals.some((ordinal) => ordinal !== null) &&
        (ordinals.some(
          (ordinal) =>
            ordinal === null ||
            !/^\d+$/.test(ordinal) ||
            Number(ordinal) < 1 ||
            Number(ordinal) > actions.length,
        ) ||
          new Set(ordinals).size !== actions.length)
      )
        throw new SearchFailure("result_set_incomplete");
      const matches = actions.filter((element) =>
        expected.some(
          (value) =>
            searchNormalized(value) ===
            searchNormalized(element.textContent ?? ""),
        ),
      );
      if (matches.length > 1)
        throw new SearchFailure("multiple_matching_results");
      if (!matches.length) throw new SearchFailure("search_results_not_found");
      const element = matches[0]!;
      if (!referenceSafeActivation(element, expected))
        throw new SearchFailure("result_activation_unsafe");
      return { element, signature: controlSignature(element) };
    },
  };
}

// --- localItemCount (workflow/workflow-model.tsx)

function normalized(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

const PROFILE_CATEGORY_KEYWORDS: Record<
  RepeatedProfileCategoryId,
  readonly string[]
> = {
  education: ["학력", "academic"],
  languages: ["어학", "외국어", "foreign"],
  certifications: ["자격", "면허", "licence"],
  careers: ["경력", "직장", "career"],
  projects: ["프로젝트", "project"],
  publications: ["논문", "특허", "publication"],
  health: ["건강"],
};

function matchesProfileCategory(
  category: (typeof PROFILE_CATEGORIES)[number],
  sectionDisplayName: string | undefined,
): boolean {
  if (!category.repeatable) return false;
  const sectionLabel = normalized(sectionDisplayName).toLowerCase();
  const keywords = PROFILE_CATEGORY_KEYWORDS[
    category.id as RepeatedProfileCategoryId
  ] ?? [normalized(category.label)];
  return keywords.some((keyword) => sectionLabel.includes(keyword));
}

function educationProfileSectionId(
  matchLabel: string,
  sectionHint?: "highSchool" | "university" | "graduateSchool",
): "highSchool" | "university" | "graduateSchool" | undefined {
  const normalizedLabel = matchLabel.toLowerCase();
  if (
    matchLabel.includes("대학원") ||
    normalizedLabel.includes("graduateschool") ||
    sectionHint === "graduateSchool"
  ) {
    return "graduateSchool";
  }
  if (
    matchLabel.includes("고등학교") ||
    normalizedLabel.includes("highschool") ||
    sectionHint === "highSchool"
  ) {
    return "highSchool";
  }
  if (
    matchLabel.includes("대학") ||
    normalizedLabel.includes("university") ||
    sectionHint === "university"
  ) {
    return "university";
  }
  return undefined;
}

export function referenceLocalItemCount(
  plan: PreparationPlan,
  snapshot: CollectedSnapshot<
    ReturnType<typeof collectPreparationSnapshot>["request"]
  >,
  profile: Profile,
  adapter?: WorkflowAdapter,
): number | undefined {
  if (plan.command !== "ADD_REPEATABLE_GROUP") return undefined;
  const lookup = snapshot.registry.lookupAction(plan.actionCandidateId);
  const selectedAdapter =
    adapter ??
    getWorkflowAdapter(
      "handle" in lookup
        ? lookup.handle.element.ownerDocument
        : snapshot.request.site.host,
    );
  const section = snapshot.request.sections.find((candidate) =>
    candidate.actionCandidates.some(
      (action) => action.candidateId === plan.actionCandidateId,
    ),
  );
  const action = section?.actionCandidates.find(
    (candidate) => candidate.candidateId === plan.actionCandidateId,
  );
  const adapterCount = selectedAdapter.repeatableProfileCount?.(
    action?.domId,
    profile,
  );
  if (adapterCount !== undefined) return adapterCount ?? undefined;
  const matchLabel = [
    section?.displayName,
    action?.displayName,
    action?.domName,
    action?.domId,
  ]
    .filter(Boolean)
    .join(" ");
  if (
    selectedAdapter === getWorkflowAdapter("") &&
    !selectedAdapter.repeatedProfileSectionHint?.(action?.domId)
  ) {
    const categories = PROFILE_CATEGORIES.filter((category) =>
      matchesProfileCategory(category, matchLabel),
    );
    if (categories.length !== 1) return undefined;
    const category = categories[0];
    const entries = profile[category.id as RepeatedProfileCategoryId];
    const sectionIds = new Set(entries.map((entry) => entry.sectionId));
    if (category.id === "education") {
      const sectionId = educationProfileSectionId(matchLabel);
      if (!sectionId && sectionIds.size > 1) return undefined;
      return sectionId
        ? entries.filter((entry) => entry.sectionId === sectionId).length
        : entries.length;
    }
    if (category.id === "languages") {
      const tests = /시험|성적|test|exam/i.test(matchLabel);
      const skills = /활용|회화|skill|proficiency/i.test(matchLabel);
      if (tests && skills) return undefined;
      const sectionId = tests
        ? "languageTest"
        : skills
          ? "languageSkill"
          : undefined;
      if (!sectionId && sectionIds.size > 1) return undefined;
      return sectionId
        ? entries.filter((entry) => entry.sectionId === sectionId).length
        : entries.length;
    }
    return sectionIds.size <= 1 ? entries.length : undefined;
  }
  const profileSectionHint = selectedAdapter.repeatedProfileSectionHint?.(
    action?.domId,
  );
  const category = profileSectionHint
    ? PROFILE_CATEGORIES.find(
        (candidate) => candidate.id === profileSectionHint.categoryId,
      )
    : PROFILE_CATEGORIES.find((candidate) =>
        matchesProfileCategory(candidate, matchLabel),
      );
  const profileItemCount = category
    ? category.id === "education"
      ? (() => {
          const sectionId = educationProfileSectionId(
            matchLabel,
            selectedAdapter.educationSectionHint?.(matchLabel),
          );
          return sectionId
            ? profile.education.filter((entry) => entry.sectionId === sectionId)
                .length
            : profile.education.length;
        })()
      : profileSectionHint
        ? profile[category.id as RepeatedProfileCategoryId].filter(
            (entry) => entry.sectionId === profileSectionHint.sectionId,
          ).length
        : profile[category.id as RepeatedProfileCategoryId].length
    : 0;

  return profileItemCount;
}

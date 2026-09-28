import type {
  InteractionCandidate,
  InteractionDecisionProvider,
  InteractionDecisionRequest,
  InteractionDecisionResponse,
  InteractionRole,
} from "../api/interaction-types";
import { InteractionDecisionBudgetError } from "../api/interaction-decision-session";
import {
  collectActionSemanticContext,
  semanticText,
} from "../dom/semantic-context";
import type { FieldCandidateHandle } from "../dom/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { SearchFollowUpControl } from "./search-follow-up";
import { genericRowFor } from "../dom/repeatable-rows";
import {
  elementSignature,
  isAnchorElement,
  isButtonElement,
  isInputElement,
  isSelectElement,
  isTextareaElement,
  isVisible,
} from "./readonly-search-helpers";

export {
  elementSignature,
  isAnchorElement,
  isButtonElement,
  isInputElement,
  isSelectElement,
  isTextareaElement,
  isVisible,
} from "./readonly-search-helpers";

export const MAX_OBSERVATION_POLLS = 32;
export const OBSERVATION_POLL_MS = 250;
export const MAX_PROVIDER_CALLS = 2;
export const MAX_DECISIONS = 3;
export const MAX_CANDIDATES_PER_DECISION = 8;
export const MAX_CANDIDATES = 24;

export const HIGH_RISK_ACTION =
  /저장|제출|지원|완료|다음|이전|이동|미리보기|동의|약관|인증|업로드|초기화|재설정|삭제|제거|save|submit|apply|complete|next|previous|preview|agree|terms|verify|upload|reset|clear|delete|remove/i;
const SEARCH_ACTION = /검색|search|find|lookup|조회|찾기/i;

export type SearchControl = HTMLInputElement;
export type SearchSubmit = HTMLButtonElement | HTMLInputElement;
export type SearchResult = HTMLElement;

export type ReadonlySearchFailureReason =
  | "field_not_readonly"
  | "search_opener_not_found"
  | "multiple_search_openers"
  | "stale_target"
  | "stale_field_group"
  | "stale_repeat_row"
  | "popup_frame_not_found"
  | "multiple_popup_frames"
  | "inaccessible_popup_frame"
  | "search_query_not_found"
  | "multiple_search_query_inputs"
  | "search_submit_not_found"
  | "multiple_search_submits"
  | "unverified_search_form"
  | "search_results_not_found"
  | "multiple_matching_results"
  | "result_activation_unsafe"
  | "result_not_reflected"
  | "popup_unresolved"
  | "model_response_invalid"
  | "decision_budget_exhausted"
  | "execution_failed"
  | "surface_not_found"
  | "surface_ambiguous"
  | "surface_stale"
  | "surface_unobservable"
  | "surface_navigation_unsafe"
  | "result_set_incomplete"
  | "result_pending"
  | "result_stale"
  | "selection_effect_unverified"
  | "selection_postcondition_failed"
  | "deadline_exceeded"
  | "run_in_progress";

export type SearchEffect = "none" | "interaction-started" | "value-observed";
export type ReadonlySearchExecutionResult = (
  | {
      status: "selected" | "unchanged";
      targetCandidateId: string;
      identity: TargetIdentity;
      followUp?: { controls: readonly SearchFollowUpControl[] };
      /** Local-only search form retained from the approved review plan. */
      selectedValue?: string;
    }
  | {
      status: "skipped" | "unsupported" | "failed";
      targetCandidateId: string;
      reason:
        | ReadonlySearchFailureReason
        | "existing_value_conflict"
        | "search_query_conflict"
        | "decision_abstained"
        | "aborted";
    }
) & { effect?: SearchEffect };

export type ElementBinding<T extends Element> = {
  candidateId: string;
  element: T;
  candidate: InteractionCandidate;
  signature: string;
};

export type DecisionBinding<T extends Element> = {
  decisionId: string;
  role: InteractionRole;
  candidates: readonly ElementBinding<T>[];
};

export type TargetIdentity = {
  target: HTMLInputElement;
  fieldGroup: Element;
  repeatRow?: Element;
  fieldSignature: string;
  semanticSignature?: string;
  noOp?: true;
  opener?: HTMLButtonElement | HTMLInputElement | HTMLAnchorElement;
  openerSignature?: string;
  openers: readonly (
    HTMLButtonElement | HTMLInputElement | HTMLAnchorElement
  )[];
  openerSignatures: readonly string[];
};

export type ReadonlySearchEligibility =
  | {
      status: "eligible";
      targetCandidateId: string;
      identity: TargetIdentity;
    }
  | {
      status: "unsupported" | "ambiguous";
      reason:
        | "field_not_readonly"
        | "search_opener_not_found"
        | "multiple_search_openers";
    };

export interface ExecuteReadonlySearchArgs {
  document: Document;
  registry: CandidateRegistry;
  targetCandidateId: string;
  canonicalFieldKey: string;
  /** Kept local; it is never included in an interaction decision request. */
  expectedValue: string;
  /** A known pre-review value, also retained locally for the conflict guard. */
  expectedCurrentValue?: string;
  /** Local-only exact search forms. The original expected value is always first. */
  searchValues?: readonly string[];
  decisionProvider?: InteractionDecisionProvider;
  /** Lets the workflow invalidate an approved review item before each click/type. */
  assertCurrent?: () => boolean;
  signal?: AbortSignal;
  /** Re-read the local profile after asynchronous work, before the next mutation. */
  beforeMutation?: () => Promise<boolean>;
}

function opaqueId(prefix: string, index: number): string {
  return `${prefix}${index + 1}`;
}

function snapshotId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `interaction-${random}`;
}

function belongsToSurface(element: Element, surface?: Element): boolean {
  return (
    !!surface &&
    (surface.contains(element) ||
      (!!surface.id &&
        element.getRootNode() === surface.getRootNode() &&
        ["aria-controls", "aria-owns"].some((name) =>
          (element.getAttribute(name) ?? "").split(/\s+/).includes(surface.id),
        )))
  );
}

export function fieldGroupFor(
  target: HTMLInputElement,
  surface?: Element,
): Element | undefined {
  const row = genericRowFor(target);
  let fallback: Element | undefined;
  let distance = 0;
  for (
    let group: Element | null = target.parentElement;
    group && distance < 6;
    group = group.parentElement, distance++
  ) {
    if (row && !row.contains(group) && group !== row) break;
    if (group.matches("body, html, form")) break;
    const controls = Array.from(
      group.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea"),
    ).filter(
      (control) =>
        isVisible(control) &&
        (control === target || !belongsToSurface(control, surface)) &&
        !(
          isInputElement(control) &&
          ["hidden", "button", "submit", "image", "reset"].includes(
            control.type,
          )
        ),
    );
    const openers = searchOpeners(group, surface);
    if (
      controls.length === 1 &&
      controls[0] === target &&
      openers.every((opener) => genericRowFor(opener) === row)
    ) {
      fallback ??= group;
      if (openers.length) return group;
    }
  }
  return fallback;
}

function openerLabel(element: Element): string {
  const iconText = Array.from(element.querySelectorAll("img, svg"))
    .map(
      (icon) =>
        icon.getAttribute("alt") ?? icon.getAttribute("aria-label") ?? "",
    )
    .filter(Boolean)
    .join(" ");
  return [
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
    (element as HTMLInputElement).value,
    element.textContent,
    iconText,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleSearchOpener(
  element: Element,
): element is HTMLButtonElement | HTMLInputElement | HTMLAnchorElement {
  if (!(
    isButtonElement(element) ||
    isInputElement(element) ||
    isAnchorElement(element)
  ))
    return false;
  if (
    isInputElement(element) &&
    !["button", "submit", "reset", "image"].includes(element.type)
  )
    return false;
  return SEARCH_ACTION.test(openerLabel(element));
}

/**
 * Enumerate every semantically plausible opener before applying safety gates.
 * The executor must treat an unsafe second candidate as ambiguity rather than
 * filtering it away and pretending the remaining opener is unique.
 */
export function searchOpeners(
  group: Element,
  surface?: Element,
): Array<HTMLButtonElement | HTMLInputElement | HTMLAnchorElement> {
  return Array.from(group.querySelectorAll("button, input, a")).filter(
    (
      element,
    ): element is HTMLButtonElement | HTMLInputElement | HTMLAnchorElement =>
      isPlausibleSearchOpener(element) &&
      !surface?.contains(element) &&
      isVisible(element as HTMLElement),
  );
}

/** A candidate is safe only after its type, visibility, destination and risk are checked. */
export function safeSearchOpener(
  element: Element,
): element is HTMLButtonElement | HTMLInputElement | HTMLAnchorElement {
  if (!isPlausibleSearchOpener(element)) return false;
  if (!isVisible(element) || element.matches(":disabled")) return false;
  if (element.closest("[aria-disabled='true']")) return false;
  if (isButtonElement(element) && element.type !== "button") return false;
  if (isInputElement(element) && element.type !== "button") return false;
  if (isAnchorElement(element)) {
    const href = element.getAttribute("href")?.trim() ?? "";
    const target = element.getAttribute("target")?.trim().toLowerCase() ?? "";
    const baseTarget = element.ownerDocument
      .querySelector("base[target]")
      ?.getAttribute("target")
      ?.trim()
      .toLowerCase();
    if (
      element.hasAttribute("download") ||
      (target && target !== "_self") ||
      (baseTarget && baseTarget !== "_self")
    )
      return false;
    if (!(href === "" || href === "#")) return false;
  }
  return !HIGH_RISK_ACTION.test(openerLabel(element));
}

function blockedByModal(target: HTMLInputElement): boolean {
  return Array.from(
    target.ownerDocument.querySelectorAll(
      "dialog[open], [role='dialog'][aria-modal='true']",
    ),
  ).some((modal) => {
    if (!isVisible(modal as HTMLElement) || modal.contains(target))
      return false;
    if (modal.getAttribute("aria-modal") === "true") return true;
    try {
      return modal.matches(":modal");
    } catch {
      return true;
    }
  });
}

export function targetInput(
  handle: FieldCandidateHandle,
): HTMLInputElement | undefined {
  const target = handle.elements.length === 1 ? handle.elements[0] : undefined;
  return handle.candidate.element === "input" &&
    handle.candidate.control === "text" &&
    handle.candidate.semanticContext?.inputType === "text" &&
    target &&
    isInputElement(target) &&
    target.type === "text" &&
    target.readOnly &&
    target.isConnected &&
    target.getRootNode() === target.ownerDocument &&
    isVisible(target) &&
    !blockedByModal(target) &&
    !target.matches(":disabled") &&
    !target.closest("[aria-disabled='true'], [inert]")
    ? target
    : undefined;
}

export function observeReadonlySearch(
  handle: FieldCandidateHandle,
): ReadonlySearchEligibility {
  const target = targetInput(handle);
  if (!target) return { status: "unsupported", reason: "field_not_readonly" };
  // Populated readonly fields require no opener discovery or role classification.
  if (normalized(target.value) && target.parentElement) {
    return {
      status: "eligible",
      targetCandidateId: handle.candidateId,
      identity: {
        target,
        fieldGroup: target.parentElement,
        repeatRow: genericRowFor(target),
        fieldSignature: elementSignature(target),
        semanticSignature: targetSemanticSignature(target),
        noOp: true,
        openers: [],
        openerSignatures: [],
      },
    };
  }
  const fieldGroup = fieldGroupFor(target);
  if (!fieldGroup)
    return { status: "unsupported", reason: "search_opener_not_found" };
  const openers = searchOpeners(fieldGroup);
  // A populated field can be a no-op even if its opener is absent.
  if (openers.length > 1)
    return { status: "ambiguous", reason: "multiple_search_openers" };
  if (
    !target.value &&
    (!openers.length || openers.some((item) => !safeSearchOpener(item)))
  ) {
    return { status: "unsupported", reason: "search_opener_not_found" };
  }
  return {
    status: "eligible",
    targetCandidateId: handle.candidateId,
    identity: {
      target,
      fieldGroup,
      repeatRow: genericRowFor(target),
      fieldSignature: elementSignature(target),
      semanticSignature: targetSemanticSignature(target),
      openers,
      openerSignatures: openers.map(controlSignature),
    },
  };
}

function targetSemanticSignature(target: HTMLInputElement): string {
  return JSON.stringify([
    ...[
      "role",
      "aria-label",
      "aria-labelledby",
      "aria-controls",
      "aria-owns",
      "title",
      "form",
    ].map((name) => target.getAttribute(name)),
    Array.from(target.labels ?? []).map((item) => [item.id, item.textContent]),
  ]);
}

export function controlSignature(element: Element): string {
  return JSON.stringify([
    elementSignature(element),
    ...[
      "role",
      "aria-label",
      "aria-labelledby",
      "aria-controls",
      "aria-owns",
      "aria-haspopup",
      "title",
      "placeholder",
      "href",
      "target",
      "form",
      "action",
      "method",
      "formaction",
      "formmethod",
      "formtarget",
      "command",
      "commandfor",
      "popovertarget",
      "data-value",
      "data-code",
      "value",
    ].map((name) => element.getAttribute(name)),
    element.textContent,
  ]);
}

/** A narrow workflow routing predicate; use observeReadonlySearch for a reason. */
export function isReadonlySearchEligible(
  handle: FieldCandidateHandle,
  document: Document,
): boolean {
  const target = targetInput(handle);
  return (
    target?.ownerDocument === document &&
    observeReadonlySearch(handle).status === "eligible"
  );
}

export function targetIsCurrent(
  document: Document,
  registry: CandidateRegistry,
  candidateId: string,
  identity: TargetIdentity,
  assertCurrent?: () => boolean,
  expectedBeforeSelection?: string | readonly string[],
  activeModal?: Element,
  ownedSurface?: Element,
):
  | {
      handle: FieldCandidateHandle;
      target: HTMLInputElement;
    }
  | ReadonlySearchFailureReason {
  if (assertCurrent?.() === false) return "stale_target";
  const lookup = registry.lookupField(candidateId);
  if (
    lookup.status !== "ready" &&
    !(
      lookup.status === "blocked" &&
      (lookup.reason === "readonly" ||
        (lookup.reason === "inert" && activeModal))
    )
  )
    return "stale_target";
  const candidate = lookup.handle.elements[0];
  const modalException =
    activeModal?.isConnected &&
    activeModal.ownerDocument === document &&
    activeModal.matches("dialog[open], [role='dialog'][aria-modal='true']") &&
    candidate &&
    !activeModal.contains(candidate);
  const target =
    modalException &&
    lookup.handle.elements.length === 1 &&
    isInputElement(candidate) &&
    candidate.type === "text" &&
    candidate.readOnly &&
    isVisible(candidate, true)
      ? candidate
      : targetInput(lookup.handle);
  if (
    !target ||
    target.ownerDocument !== document ||
    !target.isConnected ||
    target !== identity.target ||
    elementSignature(target) !== identity.fieldSignature ||
    (identity.semanticSignature !== undefined &&
      targetSemanticSignature(target) !== identity.semanticSignature) ||
    !target.readOnly
  )
    return "stale_target";
  if (
    !identity.fieldGroup.isConnected ||
    (identity.noOp
      ? target.parentElement !== identity.fieldGroup
      : !modalException &&
        fieldGroupFor(target, ownedSurface) !== identity.fieldGroup) ||
    !identity.fieldGroup.contains(target)
  )
    return "stale_field_group";
  if (
    genericRowFor(target) !== identity.repeatRow ||
    identity.repeatRow?.isConnected === false
  )
    return "stale_repeat_row";
  const openers = identity.noOp
    ? []
    : modalException
      ? identity.openers
      : searchOpeners(identity.fieldGroup, ownedSurface);
  if (
    openers.length !== identity.openers.length ||
    openers.some(
      (opener, index) =>
        opener !== identity.openers[index] ||
        !identity.fieldGroup.contains(opener) ||
        controlSignature(opener) !== identity.openerSignatures[index],
    )
  )
    return "stale_field_group";
  if (
    identity.opener &&
    (!identity.opener.isConnected ||
      controlSignature(identity.opener) !== identity.openerSignature)
  )
    return "stale_field_group";
  if (expectedBeforeSelection !== undefined) {
    const accepted = Array.isArray(expectedBeforeSelection)
      ? expectedBeforeSelection
      : [expectedBeforeSelection];
    if (
      !accepted.some((value) => normalized(target.value) === normalized(value))
    )
      return "stale_target";
  }
  return { handle: lookup.handle, target };
}

function controlOf(
  element: Element,
): InteractionCandidate["control"] | undefined {
  if (isInputElement(element)) {
    if (element.type === "text" || element.type === "search")
      return element.type;
    if (element.type === "button" || element.type === "submit")
      return element.type;
    return undefined;
  }
  if (isTextareaElement(element)) return "text";
  if (isButtonElement(element))
    return element.type === "submit" ? "submit" : "button";
  if (isAnchorElement(element)) return "button";
  return undefined;
}

function elementOf(element: Element): InteractionCandidate["element"] {
  if (isInputElement(element) || isTextareaElement(element)) return "input";
  if (isButtonElement(element)) return "button";
  if (isAnchorElement(element)) return "link";
  return "custom";
}

function candidateFor(
  candidateId: string,
  element: HTMLElement,
  relationToTarget: InteractionCandidate["relationToTarget"],
  section: Element | null,
): InteractionCandidate | undefined {
  const control = controlOf(element);
  if (!control) return undefined;
  const collected = collectActionSemanticContext(element, section);
  const title = semanticText(element.getAttribute("title"));
  const labels = [
    ...(collected.labels ?? []),
    ...(title ? [{ source: "title" as const, text: title }] : []),
  ].slice(0, 8);
  const semanticContext = {
    ...(labels.length ? { labels } : {}),
    ...(collected.required ? { required: true as const } : {}),
  };
  return {
    candidateId,
    element: elementOf(element),
    control,
    visibility: isVisible(element) ? "visible" : "hidden",
    ...(element.matches(":disabled") ? { disabled: true as const } : {}),
    ...((isInputElement(element) || isTextareaElement(element)) &&
    element.readOnly
      ? { readonly: true as const }
      : {}),
    ...(element.closest("[inert]") ? { inert: true as const } : {}),
    relationToTarget,
    ...(semanticContext.labels?.length || semanticContext.required
      ? { semanticContext }
      : {}),
  };
}

function siteOf(document: Document): InteractionDecisionRequest["site"] {
  const pathPattern = (document.location?.pathname ?? "/")
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
    host: document.location?.host ?? "",
    pathPattern: pathPattern || "/",
  };
}

export function bindCandidates<T extends HTMLElement>(
  prefix: string,
  elements: readonly T[],
  relation: InteractionCandidate["relationToTarget"],
  section: Element | null,
): readonly ElementBinding<T>[] {
  return elements.flatMap((element, index) => {
    const candidate = candidateFor(
      opaqueId(prefix, index),
      element,
      relation,
      section,
    );
    return candidate
      ? [
          {
            candidateId: candidate.candidateId,
            element,
            candidate,
            signature: controlSignature(element),
          },
        ]
      : [];
  });
}

export function decision<T extends HTMLElement>(
  decisionId: string,
  role: InteractionRole,
  candidates: readonly ElementBinding<T>[],
): DecisionBinding<T> {
  return { decisionId, role, candidates };
}

/**
 * A provider receives only this descriptor plus an opaque id. If two role
 * candidates have the same descriptor, an id selection cannot be explained
 * or independently verified, so the executor must abstain locally.
 */
export function hasIndistinguishableCandidates<T extends Element>(
  bindings: readonly ElementBinding<T>[],
): boolean {
  const descriptors = new Set<string>();
  for (const { candidate } of bindings) {
    const { candidateId: _candidateId, ...descriptor } = candidate;
    const key = JSON.stringify(descriptor);
    if (descriptors.has(key)) return true;
    descriptors.add(key);
  }
  return false;
}

export function requestFor(
  document: Document,
  canonicalFieldKey: string,
  bindings: readonly DecisionBinding<HTMLElement>[],
): InteractionDecisionRequest | undefined {
  const populated = bindings.filter(({ candidates }) => candidates.length > 1);
  if (!populated.length) return undefined;
  const candidateCount = populated.reduce(
    (count, item) => count + item.candidates.length,
    0,
  );
  if (
    populated.length > MAX_DECISIONS ||
    candidateCount > MAX_CANDIDATES ||
    populated.some(
      ({ candidates }) => candidates.length > MAX_CANDIDATES_PER_DECISION,
    )
  )
    return undefined;
  return {
    schemaVersion: 2,
    snapshotId: snapshotId(),
    site: siteOf(document),
    decisions: populated.map(({ decisionId, role, candidates }) => ({
      decisionId,
      role,
      canonicalFieldKey,
      candidates: candidates.map(({ candidate }) => candidate),
    })),
  };
}

export function selectedCandidate<T extends HTMLElement>(
  binding: DecisionBinding<T>,
  request: InteractionDecisionRequest | undefined,
  response: InteractionDecisionResponse | undefined,
): ElementBinding<T> | "abstain" | "invalid" {
  if (binding.candidates.length === 1) return binding.candidates[0]!;
  if (!request || !response) return "abstain";
  if (
    response.schemaVersion !== 2 ||
    response.snapshotId !== request.snapshotId ||
    response.status !== "COMPLETE" ||
    response.mode !== "GENERIC"
  )
    return "invalid";
  const matches = response.decisions.filter(
    (item) =>
      item.decisionId === binding.decisionId && item.role === binding.role,
  );
  if (matches.length !== 1) return "invalid";
  const match = matches[0]!;
  if (match.selection === "ABSTAINED" && match.candidateId == null)
    return "abstain";
  if (match.selection !== "SELECTED" || !match.candidateId) return "invalid";
  return (
    binding.candidates.find(
      ({ candidateId }) => candidateId === match.candidateId,
    ) ?? "invalid"
  );
}

export async function decide<T extends HTMLElement>(
  binding: DecisionBinding<T>,
  request: InteractionDecisionRequest | undefined,
  provider: InteractionDecisionProvider | undefined,
): Promise<
  ElementBinding<T> | "abstain" | "invalid" | "decision_budget_exhausted"
> {
  if (binding.candidates.length === 1) return binding.candidates[0]!;
  if (!request || !provider) return "abstain";
  try {
    return selectedCandidate(binding, request, await provider(request));
  } catch (error) {
    if (error instanceof InteractionDecisionBudgetError)
      return "decision_budget_exhausted";
    return "abstain";
  }
}

export function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function failure(
  targetCandidateId: string,
  reason: ReadonlySearchFailureReason,
): ReadonlySearchExecutionResult {
  return { status: "unsupported", targetCandidateId, reason };
}

import {
  bindCandidates,
  controlSignature,
  decision,
  hasIndistinguishableCandidates,
  HIGH_RISK_ACTION,
  isInputElement,
  requestFor,
  selectedCandidate,
  type ElementBinding,
} from "./readonly-search";
import type {
  InteractionDecisionResponse,
  InteractionRole,
} from "../api/interaction-types";
import { InteractionDecisionBudgetError } from "../api/interaction-decision-session";
import { validateInteractionDecisionResponse } from "../api/validate-interaction-response";
import { SearchFailure, type SearchSession } from "./search-session";
import type { SearchSurface } from "./search-surface";
import {
  elements,
  interactive,
  label,
  linked,
  safeActivation,
} from "./search-surface-dom";

export function queryControls(surface: SearchSurface): HTMLInputElement[] {
  const roots = [surface.root, ...surface.linkedQueries()];
  return [
    ...new Set(
      roots.flatMap((root) =>
        "tagName" in root && root.tagName === "INPUT"
          ? [root as HTMLInputElement]
          : elements<HTMLInputElement>(root, "input"),
      ),
    ),
  ].filter(
    (input) =>
      isInputElement(input) &&
      ["text", "search"].includes(input.type) &&
      !input.readOnly &&
      interactive(input) &&
      /검색|조회|찾기|query|keyword|search|school|major|region|학교|전공|소재지/i.test(
        label(input),
      ),
  );
}
export function submitControls(
  surface: SearchSurface,
): (HTMLButtonElement | HTMLInputElement)[] {
  return elements<HTMLButtonElement | HTMLInputElement>(
    surface.root,
    "button, input[type='button'], input[type='submit']",
  ).filter(
    (control) =>
      interactive(control) &&
      !HIGH_RISK_ACTION.test(label(control)) &&
      /검색|조회|찾기|search|find|lookup/i.test(label(control)) &&
      (safeActivation(control) ||
        (control.type === "submit" && !!surface.frame)),
  );
}

export function searchDestination(
  surface: SearchSurface,
  query: HTMLInputElement,
  submit: HTMLButtonElement | HTMLInputElement,
): URL | undefined {
  if (
    !interactive(query) ||
    !interactive(submit) ||
    query.readOnly ||
    query.form !== submit.form
  )
    throw new SearchFailure("unverified_search_form");
  const form = query.form;
  if (!form) {
    if (
      submit.type !== "button" ||
      !safeActivation(submit) ||
      !surface.contains(query) ||
      !surface.contains(submit)
    )
      throw new SearchFailure("unverified_search_form");
    return undefined;
  }
  const controls = Array.from(form.elements);
  // Hidden values must never be sent by a generic native submission.
  if (
    controls.some((control) => control !== query && control !== submit) ||
    controls.some((control) => !form.contains(control)) ||
    !surface.contains(form) ||
    form.parentElement?.closest("form")
  )
    throw new SearchFailure("unverified_search_form");
  if (submit.type === "button") {
    if (!safeActivation(submit))
      throw new SearchFailure("unverified_search_form");
    return undefined;
  }
  const target = (
    submit.getAttribute("formtarget") ||
    form.getAttribute("target") ||
    form.ownerDocument.querySelector("base")?.getAttribute("target") ||
    "_self"
  ).toLowerCase();
  const method = (
    submit.getAttribute("formmethod") ||
    form.getAttribute("method") ||
    "get"
  ).toLowerCase();
  const action =
    submit.getAttribute("formaction") || form.getAttribute("action");
  if (
    !surface.frame ||
    submit.type !== "submit" ||
    submit.name ||
    target !== "_self" ||
    method !== "get" ||
    !action
  )
    throw new SearchFailure("surface_navigation_unsafe");
  const destination = new URL(action, form.ownerDocument.baseURI);
  if (
    destination.origin !== surface.target.ownerDocument.location.origin ||
    !/search|lookup|find|query/i.test(destination.pathname) ||
    /save|apply|submit|delete|update|next|preview/i.test(
      destination.pathname,
    ) ||
    destination.username ||
    destination.password
  )
    throw new SearchFailure("surface_navigation_unsafe");
  return destination;
}

export function queryOnly(
  surface: SearchSurface,
  query: HTMLInputElement,
): boolean {
  return surface.resultRoots().some((root) => linked(query, root));
}

export type RoleSelection = {
  binding: ElementBinding<HTMLElement>;
  current: () => boolean;
};
export async function resolveRoles(
  session: SearchSession,
  roles: {
    role: InteractionRole;
    collect: () => HTMLElement[];
    scope: Element | null;
  }[],
): Promise<RoleSelection[]> {
  const bindings = roles.map(({ role, collect, scope }, index) => {
    const candidates = bindCandidates(
      "c" + session.providerCalls + "-" + index + "-",
      collect(),
      role === "SEARCH_POPUP_OPENER" ? "SAME_FIELD_GROUP" : "DIALOG_CONTROL",
      scope,
    );
    if (!candidates.length) throw new SearchFailure("decision_abstained");
    if (candidates.length > 8)
      throw new SearchFailure("decision_budget_exhausted");
    if (hasIndistinguishableCandidates(candidates))
      throw new SearchFailure("decision_abstained");
    return decision("d" + index, role, candidates);
  });
  session.candidateCount += bindings.reduce(
    (sum, binding) => sum + binding.candidates.length,
    0,
  );
  session.decisions += bindings.length;
  if (session.candidateCount > 24 || session.decisions > 3)
    throw new SearchFailure("decision_budget_exhausted");
  const request = requestFor(
    session.args.document,
    session.args.canonicalFieldKey,
    bindings,
  );
  let response: InteractionDecisionResponse | undefined;
  if (request) {
    if (!session.args.decisionProvider)
      throw new SearchFailure("decision_abstained");
    if (++session.providerCalls > 2)
      throw new SearchFailure("decision_budget_exhausted");
    try {
      response = validateInteractionDecisionResponse(
        request,
        await session.race(session.args.decisionProvider(request)),
      );
    } catch (error) {
      if (error instanceof SearchFailure) throw error;
      if (error instanceof InteractionDecisionBudgetError)
        throw new SearchFailure("decision_budget_exhausted");
      throw new SearchFailure("model_response_invalid");
    }
  }
  return bindings.map((binding, index) => {
    const selected = selectedCandidate(binding, request, response);
    if (typeof selected === "string")
      throw new SearchFailure(
        selected === "invalid"
          ? "model_response_invalid"
          : "decision_abstained",
      );
    const current = () => {
      const candidates = bindCandidates(
        "live",
        roles[index]!.collect(),
        binding.role === "SEARCH_POPUP_OPENER"
          ? "SAME_FIELD_GROUP"
          : "DIALOG_CONTROL",
        roles[index]!.scope,
      );
      return (
        candidates.length === binding.candidates.length &&
        candidates.every(
          (candidate, i) =>
            candidate.element === binding.candidates[i]!.element &&
            controlSignature(candidate.element) ===
              binding.candidates[i]!.signature &&
            JSON.stringify(candidate.candidate.semanticContext) ===
              JSON.stringify(binding.candidates[i]!.candidate.semanticContext),
        )
      );
    };
    if (!current()) throw new SearchFailure("surface_stale");
    return { binding: selected, current };
  });
}

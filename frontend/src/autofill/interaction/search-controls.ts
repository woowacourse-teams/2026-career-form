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

export interface SearchFormBinding {
  destination: URL;
  method: "get" | "post";
  queryName: string;
  hiddenValues: readonly (readonly [string, string])[];
  current(): boolean;
}

function hasSubmitHandler(element: Element): boolean {
  return (
    Array.from(element.attributes).some((attribute) =>
      /^on/i.test(attribute.name),
    ) ||
    ["onsubmit", "onformdata", "onclick", "oninput", "onchange"].some(
      (name) => typeof Reflect.get(element, name) === "function",
    )
  );
}

export function searchDestination(
  surface: SearchSurface,
  query: HTMLInputElement,
  submit: HTMLButtonElement | HTMLInputElement,
): SearchFormBinding | undefined {
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
  const hidden = controls.filter(
    (control): control is HTMLInputElement =>
      control.tagName === "INPUT" &&
      (control as HTMLInputElement).type === "hidden",
  );
  if (
    controls.some(
      (control) =>
        control !== query &&
        control !== submit &&
        !hidden.some((hiddenControl) => hiddenControl === control),
    ) ||
    controls.some((control) => !form.contains(control)) ||
    hidden.some(
      (control, index) =>
        !control.name ||
        control.disabled ||
        control.name === query.name ||
        hasSubmitHandler(control) ||
        hidden.some(
          (other, otherIndex) =>
            otherIndex !== index && other.name === control.name,
        ),
    ) ||
    hasSubmitHandler(form) ||
    hasSubmitHandler(query) ||
    hasSubmitHandler(submit) ||
    !surface.contains(form) ||
    form.parentElement?.closest("form")
  )
    throw new SearchFailure("unverified_search_form");
  if (submit.type === "button") {
    if (hidden.length || !safeActivation(submit))
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
    !["get", "post"].includes(method) ||
    !query.name ||
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
  const hiddenValues = hidden.map(
    (control) => [control.name, control.value] as const,
  );
  const signature = {
    method,
    action: destination.href,
    target,
    queryName: query.name,
  };
  return {
    destination,
    method: method as "get" | "post",
    queryName: query.name,
    hiddenValues,
    current: () => {
      if (
        !form.isConnected ||
        !query.isConnected ||
        !submit.isConnected ||
        query.form !== form ||
        submit.form !== form ||
        !form.contains(query) ||
        !form.contains(submit) ||
        !surface.contains(form)
      )
        return false;
      const currentMethod = (
        submit.getAttribute("formmethod") ||
        form.getAttribute("method") ||
        "get"
      ).toLowerCase();
      const currentAction = new URL(
        submit.getAttribute("formaction") || form.getAttribute("action") || "",
        form.ownerDocument.baseURI,
      ).href;
      const currentTarget = (
        submit.getAttribute("formtarget") ||
        form.getAttribute("target") ||
        form.ownerDocument.querySelector("base")?.getAttribute("target") ||
        "_self"
      ).toLowerCase();
      const currentControls = Array.from(form.elements);
      const currentHidden = currentControls.filter(
        (control): control is HTMLInputElement =>
          control.tagName === "INPUT" &&
          (control as HTMLInputElement).type === "hidden",
      );
      return (
        currentMethod === signature.method &&
        currentAction === signature.action &&
        currentTarget === signature.target &&
        query.name === signature.queryName &&
        ["text", "search"].includes(query.type) &&
        !query.readOnly &&
        interactive(query) &&
        interactive(submit) &&
        submit.type === "submit" &&
        !submit.name &&
        !hasSubmitHandler(form) &&
        !hasSubmitHandler(query) &&
        !hasSubmitHandler(submit) &&
        currentControls.length === hiddenValues.length + 2 &&
        currentControls.every(
          (control) =>
            form.contains(control) &&
            (control === query ||
              control === submit ||
              currentHidden.some((hiddenControl) => hiddenControl === control)),
        ) &&
        currentHidden.length === hiddenValues.length &&
        currentHidden.every(
          (control, index) =>
            control.isConnected &&
            control.form === form &&
            form.contains(control) &&
            control.name === hiddenValues[index]?.[0] &&
            control.value === hiddenValues[index]?.[1] &&
            !control.disabled &&
            !hasSubmitHandler(control),
        )
      );
    },
  };
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
  options: { readonly deterministicRebind?: boolean } = {},
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
  const deterministicRebind =
    options.deterministicRebind &&
    bindings.every((binding) => binding.candidates.length === 1);
  session.candidateCount += bindings.reduce(
    (sum, binding) => sum + binding.candidates.length,
    0,
  );
  // A fresh native response document has new elements, but when each role has
  // exactly one locally verified candidate there is no new selection decision
  // to make. Keep that deterministic rebind within the original session's
  // provider/decision budget.
  if (!deterministicRebind) session.decisions += bindings.length;
  if (session.candidateCount > 24 || session.decisions > 3)
    throw new SearchFailure("decision_budget_exhausted");
  const request = deterministicRebind
    ? undefined
    : requestFor(
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

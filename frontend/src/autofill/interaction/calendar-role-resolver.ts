import { AnalysisContractError } from "../api/validate-response";
import {
  calendarDiagnostic,
  type CalendarDecisionReason,
} from "./calendar-diagnostics";
import type {
  InteractionDecisionProvider,
  InteractionDecisionRequest,
  InteractionRole,
} from "../api/interaction-types";
import {
  CALENDAR_MAX_ROLE_REQUESTS,
  calendarRequestWithinBounds,
} from "../api/calendar-role-contract";
import { validateInteractionDecisionResponse } from "../api/validate-interaction-response";
import {
  calendarCandidateStructure,
  type CalendarRoleEvidence,
} from "./calendar-structure";

interface CalendarRoleArgs<T extends HTMLElement> {
  role: InteractionRole;
  candidates: readonly { candidateId: string; element: T }[];
  navigationCandidates?: readonly {
    candidateId: string;
    element: HTMLElement;
  }[];
  provider?: InteractionDecisionProvider;
  canonicalFieldKey: string;
  deadline: number;
  evidence?: CalendarRoleEvidence;
  revalidate?: () => boolean;
  now?: () => number;
  signal?: AbortSignal;
}

/** One calendar execution owns this budget; no retries or authority reuse. */
export function createCalendarRoleResolver() {
  let calls = 0;
  return <T extends HTMLElement>(args: CalendarRoleArgs<T>) => {
    if (args.provider && ++calls > CALENDAR_MAX_ROLE_REQUESTS) {
      calendarDiagnostic({
        reason: "budget-exhausted",
        role: args.role,
        candidateCount: args.candidates.length,
      });
      return Promise.resolve(undefined);
    }
    return resolveCalendarRole(args);
  };
}

/** Provider authority is limited to the exact observed role/candidate snapshot. */
export async function resolveCalendarRole<T extends HTMLElement>(
  args: CalendarRoleArgs<T>,
): Promise<{ candidateId: string; element: T } | undefined> {
  const { candidates, provider } = args;
  const now = args.now ?? Date.now;
  const stop = (reason: CalendarDecisionReason) => {
    calendarDiagnostic({
      reason,
      role: args.role,
      candidateCount: candidates.length,
    });
    return undefined;
  };
  if (args.signal?.aborted) return stop("aborted");
  if (now() >= args.deadline) return stop("timeout");
  if (args.revalidate?.() === false) return stop("stale");
  if (!provider) return candidates.length === 1 ? candidates[0] : undefined;
  if (!args.evidence) return stop("invalid-request");
  const evidence = args.evidence;
  const snapshotId = `calendar-${crypto.randomUUID()}`;
  const project = (
    entries: readonly { candidateId: string; element: HTMLElement }[],
    role: InteractionRole,
  ) =>
    entries.flatMap(({ candidateId, element }) => {
      const calendarStructure = calendarCandidateStructure(element, evidence);
      return calendarStructure
        ? [
            {
              candidateId,
              element:
                element instanceof HTMLInputElement
                  ? ("input" as const)
                  : element instanceof HTMLAnchorElement
                    ? ("link" as const)
                    : element instanceof HTMLButtonElement
                      ? ("button" as const)
                      : ("custom" as const),
              control: "button" as const,
              visibility: "visible" as const,
              relationToTarget:
                role === "CALENDAR_OPENER"
                  ? evidence.ownership === "bound-target"
                    ? ("TARGET_CONTROL" as const)
                    : ("SAME_FIELD_GROUP" as const)
                  : ("DIALOG_CONTROL" as const),
              calendarStructure,
            },
          ]
        : [];
    });
  const projected = project(candidates, args.role);
  const navigation = args.navigationCandidates ?? [];
  const projectedNavigation = project(navigation, "CALENDAR_NAVIGATION");
  const request: InteractionDecisionRequest = {
    schemaVersion: 2,
    snapshotId,
    site: { host: location.host, pathPattern: "/" },
    decisions: [
      {
        decisionId: "calendar-role",
        role: args.role,
        canonicalFieldKey: args.canonicalFieldKey,
        candidates: projected,
      },
      ...(navigation.length
        ? [
            {
              decisionId: "calendar-navigation",
              role: "CALENDAR_NAVIGATION" as const,
              canonicalFieldKey: args.canonicalFieldKey,
              candidates: projectedNavigation,
            },
          ]
        : []),
    ],
  };
  if (
    projected.length !== candidates.length ||
    projectedNavigation.length !== navigation.length ||
    !calendarRequestWithinBounds(request)
  )
    return stop("invalid-request");
  // Widgets may position these same controls while the provider is pending.
  // Only root positioning is presentation-only; all other style, class and
  // descendant markup (including options) remain part of the exact snapshot.
  const candidateHtml = (element: HTMLElement) => {
    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return element.outerHTML;
    for (const property of ["position", "top", "right", "bottom", "left"])
      clone.style.removeProperty(property);
    if (clone.getAttribute("style") === "") clone.removeAttribute("style");
    return clone.outerHTML;
  };
  // DOM source is retained locally only. Provider await cannot authorize a new snapshot.
  const snapshots = [...candidates, ...navigation].map(({ element }) => ({
    element,
    parent: element.parentElement,
    html: candidateHtml(element),
    value:
      element instanceof HTMLSelectElement ||
      element instanceof HTMLInputElement
        ? element.value
        : undefined,
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const interrupted = new Promise<undefined>((resolve) => {
      abort = () => resolve(undefined);
      args.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, Math.max(0, args.deadline - now()));
    });
    const raw = await Promise.race([provider(request), interrupted]);
    if (args.signal?.aborted) return stop("aborted");
    if (!raw || now() >= args.deadline) return stop("timeout");
    if (
      args.revalidate?.() === false ||
      snapshots.some(
        ({ element, parent, html, value }) =>
          !element.isConnected ||
          element.parentElement !== parent ||
          candidateHtml(element) !== html ||
          ((element instanceof HTMLSelectElement ||
            element instanceof HTMLInputElement) &&
            element.value !== value) ||
          !calendarCandidateStructure(element, evidence),
      )
    )
      return stop("stale");
    const response = validateInteractionDecisionResponse(request, raw);
    if (response.status !== "COMPLETE") return stop("provider-unavailable");
    for (const decision of response.decisions) {
      const count =
        request.decisions.find(
          (entry) => entry.decisionId === decision.decisionId,
        )?.candidates.length ?? 0;
      calendarDiagnostic({
        reason: decision.selection === "SELECTED" ? "selected" : "abstained",
        role: decision.role,
        candidateCount: count,
        ...(decision.selection === "SELECTED" && decision.candidateId
          ? { candidateId: decision.candidateId }
          : {}),
      });
    }
    const decision = response.decisions.find(
      (decision) => decision.decisionId === "calendar-role",
    );
    if (!decision) return stop("invalid-response");
    // Only this role authorizes the step; navigation is observed, never activated.
    if (decision.selection !== "SELECTED") return;
    return candidates.find(
      ({ candidateId }) => candidateId === decision.candidateId,
    );
  } catch (error) {
    return stop(
      error instanceof AnalysisContractError
        ? "invalid-response"
        : "provider-error",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) args.signal?.removeEventListener("abort", abort);
  }
}

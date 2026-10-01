import type { InteractionRole } from "../api/interaction-types";
import { isAutofillDebugEnabled } from "../debug/autofill-debug";

export type CalendarDecisionReason =
  | "selected"
  | "abstained"
  | "provider-error"
  | "invalid-response"
  | "stale"
  | "timeout"
  | "aborted"
  | "budget-exhausted"
  | "invalid-request"
  | "provider-unavailable";

/** Never pass raw provider errors, date values, DOM text, or request bodies here. */
export function calendarDiagnostic(detail: {
  reason: CalendarDecisionReason;
  role: InteractionRole;
  candidateCount: number;
  candidateId?: string;
}): void {
  if (isAutofillDebugEnabled())
    console.debug("[CareerForm] calendar-role", {
      reason: detail.reason,
      role: detail.role,
      candidateCount: detail.candidateCount,
      ...(detail.candidateId ? { candidateId: detail.candidateId } : {}),
    });
}

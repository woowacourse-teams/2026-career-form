import type { InteractionDecisionProvider } from "./interaction-types";
import { validateInteractionDecisionResponse } from "./validate-interaction-response";

const MAX_PROVIDER_CALLS = 4;
export class InteractionDecisionBudgetError extends Error {
  constructor(readonly maxCalls: number) {
    super("Interaction decision budget exhausted");
    this.name = "InteractionDecisionBudgetError";
  }
}
/** One run owns this closure. No candidate IDs or authority cross snapshots. */
export function createInteractionDecisionSession(
  provider: InteractionDecisionProvider,
  maxCalls = MAX_PROVIDER_CALLS,
): InteractionDecisionProvider {
  if (
    !Number.isInteger(maxCalls) ||
    maxCalls < 0 ||
    maxCalls > MAX_PROVIDER_CALLS
  )
    throw new RangeError("Invalid interaction call budget");
  let calls = 0;
  return async (request) => {
    if (calls >= maxCalls) throw new InteractionDecisionBudgetError(maxCalls);
    calls++;
    return validateInteractionDecisionResponse(
      request,
      await provider(request),
    );
  };
}

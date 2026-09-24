import type {
  InteractionDecisionProvider,
  InteractionDecisionResponse,
  InteractionDecisionRequest,
  InteractionRole,
} from "../api/interaction-types";

/** Provider authority is deliberately limited to opaque ids from this role. */
export async function resolveCalendarRole<T extends HTMLElement>(args: {
  role: InteractionRole;
  candidates: readonly { candidateId: string; element: T }[];
  provider?: InteractionDecisionProvider;
  canonicalFieldKey: string;
  deadline: number;
  now?: () => number;
  signal?: AbortSignal;
}): Promise<{ candidateId: string; element: T } | undefined> {
  const { candidates, provider } = args;
  if (args.signal?.aborted) return undefined;
  if (!provider) return candidates.length === 1 ? candidates[0] : undefined;
  if (!candidates.length || (args.now ?? Date.now)() >= args.deadline)
    return undefined;
  const snapshotId = `calendar-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  const request: InteractionDecisionRequest = {
    schemaVersion: 2 as const,
    snapshotId,
    site: { host: location.host, pathPattern: location.pathname || "/" },
    decisions: [
      {
        decisionId: "calendar-role",
        role: args.role,
        canonicalFieldKey: args.canonicalFieldKey,
        candidates: candidates.map(({ candidateId, element }) => ({
          candidateId,
          element: element instanceof HTMLInputElement ? "input" : "button",
          control: "button",
          visibility: "visible",
          relationToTarget: "DIALOG_CONTROL",
          // Calendar date text is deliberately omitted from provider labels.
        })),
      },
    ],
  };
  let response: InteractionDecisionResponse | undefined;
  try {
    response = await Promise.race([
      provider(request),
      new Promise<undefined>((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, args.deadline - (args.now ?? Date.now)()),
        ),
      ),
      new Promise<undefined>((resolve) =>
        args.signal?.addEventListener("abort", () => resolve(undefined), {
          once: true,
        }),
      ),
    ]);
  } catch {
    return undefined;
  }
  if (
    !response ||
    args.signal?.aborted ||
    (args.now ?? Date.now)() >= args.deadline
  )
    return undefined;
  const decision = response.decisions?.[0];
  if (
    response.schemaVersion !== 2 ||
    response.snapshotId !== snapshotId ||
    response.status !== "COMPLETE" ||
    response.mode !== "GENERIC" ||
    response.decisions.length !== 1 ||
    decision?.decisionId !== "calendar-role" ||
    decision.role !== args.role ||
    decision.selection !== "SELECTED" ||
    !decision.candidateId
  )
    return undefined;
  return candidates.find(
    ({ candidateId }) => candidateId === decision.candidateId,
  );
}

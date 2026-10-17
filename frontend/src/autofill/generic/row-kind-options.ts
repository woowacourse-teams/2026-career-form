import type {
  InteractionCandidate,
  InteractionDecisionProvider,
  InteractionDecisionRequest,
  TargetKind,
} from "../api/interaction-types";
import type { SiteDescriptor } from "../api/types";

export const ROW_KIND_TARGETS: readonly TargetKind[] = [
  "HIGH_SCHOOL",
  "ASSOCIATE",
  "BACHELOR",
  "MASTER",
  "DOCTOR",
];

/** Server limits for one interaction decision request. */
const MAX_CANDIDATES_PER_DECISION = 24;
const MAX_TOTAL_CANDIDATES = 96;

export interface RowKindOptionsInput {
  snapshotId: string;
  site: SiteDescriptor;
  /** Must be a server-supported profile field key. */
  canonicalFieldKey: string;
  relationToTarget: InteractionCandidate["relationToTarget"];
  options: Array<{
    optionId: string;
    visibility: InteractionCandidate["visibility"];
    semanticContext?: InteractionCandidate["semanticContext"];
  }>;
}

/**
 * Asks which option of one row-kind select matches each of the five education
 * levels. All levels are always asked so the user's own level never leaves the
 * browser. A level is null when the server abstains or cannot decide.
 */
export async function decideRowKindOptions(
  client: { decideInteractions: InteractionDecisionProvider },
  input: RowKindOptionsInput,
): Promise<Map<TargetKind, string | null>> {
  const result = new Map<TargetKind, string | null>(
    ROW_KIND_TARGETS.map((kind) => [kind, null]),
  );
  const count = input.options.length;
  if (
    count === 0 ||
    count > MAX_CANDIDATES_PER_DECISION ||
    count * ROW_KIND_TARGETS.length > MAX_TOTAL_CANDIDATES
  )
    return result;

  const optionIdByCandidateId = new Map<string, string>();
  const kindByDecisionId = new Map<string, TargetKind>();
  const request: InteractionDecisionRequest = {
    schemaVersion: 2,
    snapshotId: input.snapshotId,
    site: { host: input.site.host, pathPattern: input.site.pathPattern },
    decisions: ROW_KIND_TARGETS.map((targetKind, kindIndex) => {
      const decisionId = `rowKind${kindIndex}`;
      kindByDecisionId.set(decisionId, targetKind);
      return {
        decisionId,
        role: "ROW_KIND_OPTION" as const,
        targetKind,
        canonicalFieldKey: input.canonicalFieldKey,
        candidates: input.options.map((option, optionIndex) => {
          const candidateId = `rowKind${kindIndex}-option${optionIndex}`;
          optionIdByCandidateId.set(candidateId, option.optionId);
          return {
            candidateId,
            element: "select" as const,
            control: "option" as const,
            visibility: option.visibility,
            relationToTarget: input.relationToTarget,
            ...(option.semanticContext
              ? { semanticContext: option.semanticContext }
              : {}),
          };
        }),
      };
    }),
  };

  const response = await client.decideInteractions(request);
  if (response.status !== "COMPLETE") return result;
  for (const decision of response.decisions) {
    const kind = kindByDecisionId.get(decision.decisionId);
    if (!kind || decision.selection !== "SELECTED" || !decision.candidateId)
      continue;
    result.set(kind, optionIdByCandidateId.get(decision.candidateId) ?? null);
  }
  return result;
}

export type ApprovedWriteResult =
  | {
      candidateId: string;
      status: "written";
      outcome?: "success";
      code?: "WRITTEN";
    }
  | {
      candidateId: string;
      status: "skipped";
      reason: string;
      outcome?: "failed" | "needs-verification" | "unsupported" | "unchanged";
      code?:
        | "ALREADY_MATCHED"
        | "NOT_APPROVED"
        | "REVIEW_UNAVAILABLE"
        | "DUPLICATE_BINDING"
        | "STALE_TARGET"
        | "CONFLICT"
        | "RETAINED_VALUE_UNCONFIRMED"
        | "UNSUPPORTED_CONTROL"
        | "UNSUPPORTED_FORMAT"
        | "EXECUTION_FAILED";
    };

export function skipped(
  candidateId: string,
  outcome: "failed" | "needs-verification" | "unsupported",
  code: NonNullable<
    Extract<ApprovedWriteResult, { status: "skipped" }>["code"]
  >,
  reason: string,
): ApprovedWriteResult {
  return { candidateId, status: "skipped", outcome, code, reason };
}

export function written(candidateId: string): ApprovedWriteResult {
  return {
    candidateId,
    status: "written",
    outcome: "success",
    code: "WRITTEN",
  };
}

export function outcomeForWriteCode(
  code: Extract<ApprovedWriteResult, { status: "skipped" }>["code"],
): "failed" | "needs-verification" | "unsupported" {
  switch (code) {
    case "EXECUTION_FAILED":
      return "failed";
    case "NOT_APPROVED":
    case "DUPLICATE_BINDING":
    case "STALE_TARGET":
    case "CONFLICT":
    case "RETAINED_VALUE_UNCONFIRMED":
      return "needs-verification";
    default:
      return "unsupported";
  }
}

import { expect } from "vitest";

/**
 * Copy of the live-eval harness filter `diagnosticLine`
 * (frontend/scripts/live-eval/core.mjs on the cf177-live-harness branch).
 * SYNC: when the harness grammar changes, update this copy in the same change.
 * Product grammar tests are looser than this filter; a new diagnostic line is
 * only proven to reach live-eval reports once it passes `expectHarnessLine`.
 */
export function harnessDiagnosticLine(line: unknown): string | null {
  if (typeof line !== "string") return null;
  if (
    /^\[CareerForm\] build (?:revision[=:])[a-f0-9]{40} (?:source_state|state|sourceState)[=:]CLEAN$/.test(
      line,
    )
  )
    return line;
  if (
    /^\[CareerForm\] [1-4]\. [가-힣 A-Za-z/]+ \([가-힣 A-Za-z0-9_,/ .:-]+\)$/.test(
      line,
    )
  )
    return line;
  if (
    /^\[CareerForm\] stage name=[a-z-]+(?: (?:collected|accepted|rejected|planned|executed)=[0-9]+)+$/.test(
      line,
    )
  )
    return line;
  if (line.startsWith("[CareerForm] skip ") && /\breason=/.test(line)) {
    const fields = line.slice("[CareerForm] skip ".length).split(" ");
    const safe = fields.every((part) =>
      /^(?:candidate|candidateId|id|key|detail|stage|reason|code|failureCode|command|status|outcome|lookup|run|final|approved|selected|disabled|readonly)=[A-Za-z0-9_.:/,-]+$/.test(
        part,
      ),
    );
    if (safe) return line;
  }
  return null;
}

/**
 * Asserts that the harness keeps `line` verbatim and that no canary value
 * (synthetic profile value, label, query text) leaked into it.
 */
export function expectHarnessLine(
  line: unknown,
  canaries: readonly string[] = [],
): void {
  expect(
    harnessDiagnosticLine(line),
    `harness drops diagnostic: ${String(line)}`,
  ).toBe(line);
  for (const canary of canaries)
    expect(String(line), `diagnostic leaks a canary value`).not.toContain(
      canary,
    );
}

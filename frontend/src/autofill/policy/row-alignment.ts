export type RowAlignmentPolicy = {
  matchBy: "POSITION" | "KEY";
  mismatch: "REJECT" | "PRESERVE";
  empty: "ASSIGN" | "REJECT";
};
/** Assign existing rows before adding any missing desired rows. Null represents an empty row. */
export function alignRows(
  actual: (string | null)[],
  desired: string[],
  policy: RowAlignmentPolicy,
): { keys: string[]; pending: string[] } | undefined {
  const used = new Set<number>();
  const assigned = new Map<number, string>();
  for (let i = 0; i < actual.length; i++) {
    const key = actual[i];
    if (key === null) continue;
    const index =
      policy.matchBy === "POSITION"
        ? i
        : desired.findIndex((value, j) => !used.has(j) && value === key);
    if (index >= 0 && desired[index] === key && !used.has(index)) {
      used.add(index);
      assigned.set(i, key);
    } else if (policy.mismatch === "PRESERVE") assigned.set(i, key);
    else return undefined;
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== null) continue;
    if (policy.empty === "REJECT") return undefined;
    const index =
      policy.matchBy === "POSITION"
        ? i
        : desired.findIndex((_, j) => !used.has(j));
    if (index < 0 || index >= desired.length || used.has(index))
      return undefined;
    used.add(index);
    assigned.set(i, desired[index]);
  }
  return {
    keys: actual.map((_, i) => assigned.get(i)!),
    pending: desired.filter((_, i) => !used.has(i)),
  };
}

/**
 * Upper bound for every wait budget of a fixture policy. Policies carry
 * live-site budgets (up to 10 s per wait) that exist for slow real pages;
 * jsdom fixtures answer searches and reveal dependents within a few ticks, so
 * a test that exercises a fail-closed path would otherwise idle for the whole
 * live budget. 1 s keeps the timing-sensitive cases (500–600 ms delays) valid
 * checks on a loaded CI runner. Poll intervals and zero (disabled) budgets
 * stay as they are.
 */
export const FIXTURE_WAIT_CAP_MS = 1000;

/**
 * The staged-address contract refuses a budget under 1 s
 * (`staged-address-contract.ts`), so address descriptors keep that floor.
 */
export const FIXTURE_ADDRESS_WAIT_MS = 1000;

const WAIT_KEY = /(Ms|Timeout)$/;
const isAddressDescriptor = (record: Record<string, unknown>) =>
  typeof record.confirmSelector === "string" ||
  typeof record.commitLabel === "string";

/** Caps every `*Ms` / `*Timeout` number of a cloned policy in place. */
export function capFixtureWaits<T>(policy: T, capMs = FIXTURE_WAIT_CAP_MS): T {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const floor = isAddressDescriptor(record) ? FIXTURE_ADDRESS_WAIT_MS : 0;
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === "number" && WAIT_KEY.test(key) && !/poll/i.test(key))
        record[key] = Math.max(floor, Math.min(item, capMs));
      else visit(item);
    }
  };
  visit(policy);
  return policy;
}

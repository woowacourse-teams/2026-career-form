import type { ExecutionPolicy } from "../../workflow/execution-policy";

/**
 * Test-only wait budget for the seed policy. The seed's driver and search
 * timeouts (1000–2500 ms) are live-site budgets; jsdom fixtures answer
 * searches synchronously and enable dependents within a few ticks, so every
 * driver whose dependents never enable would otherwise idle for the whole
 * budget. The shorter budget keeps the same code paths (settle, disabled
 * timeout) and only changes how long an unanswered wait lasts. 1000 ms is the
 * seed's own lower bound and leaves room for the fixtures' 50 ms clicks and
 * 200 ms polls on a loaded CI runner.
 */
export const FIXTURE_TIMEOUT_MS = 1000;

/** Shortens every driver and search wait of a cloned seed policy in place. */
export function withFixtureTimeouts<T extends ExecutionPolicy>(policy: T): T {
  const browser = policy.browserPolicy;
  if (browser?.schemaVersion !== 2) return policy;
  for (const section of browser.nativeForm.sections)
    for (const field of section.fields) {
      if (field.driver) field.driver.timeoutMs = FIXTURE_TIMEOUT_MS;
      if (field.search) field.search.timeoutMs = FIXTURE_TIMEOUT_MS;
    }
  return policy;
}

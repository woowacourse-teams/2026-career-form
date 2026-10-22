import type { ExecutionPolicy } from "../../workflow/execution-policy";
import {
  FIXTURE_WAIT_CAP_MS,
  capFixtureWaits,
} from "../../../test/fixtures/wait-cap";

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
// Below the shared cap: MRS2 fixtures answer every driver and search within a
// few ticks, and no Hplace test asserts an ordering between two budgets.
export const FIXTURE_TIMEOUT_MS = Math.min(300, FIXTURE_WAIT_CAP_MS);

/** Caps every driver, search and address wait of a cloned seed policy in place. */
export function withFixtureTimeouts<T extends ExecutionPolicy>(policy: T): T {
  return capFixtureWaits(policy, FIXTURE_TIMEOUT_MS);
}

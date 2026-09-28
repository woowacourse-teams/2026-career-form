import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { greetingApproved, greetingUsable } from "./write";
export function control(handle: FieldCandidateHandle): HTMLElement | undefined {
  return handle.customElements?.[0] ?? handle.elements[0];
}
export function currentTrigger(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  trigger: HTMLElement,
  signal: AbortSignal,
): boolean {
  return (
    !signal.aborted &&
    greetingApproved(handle, item) &&
    control(handle) === trigger &&
    greetingUsable(trigger) &&
    trigger.getAttribute("name") === handle.candidate.domName
  );
}
export async function waitFor<T>(
  read: () => T | undefined,
  signal: AbortSignal,
  timeoutMs = 1200,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}
export async function mayMutate(
  signal: AbortSignal,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  return (
    !signal.aborted &&
    (!beforeMutation || (await beforeMutation())) &&
    !signal.aborted
  );
}

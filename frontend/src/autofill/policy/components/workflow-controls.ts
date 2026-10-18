import { componentRules } from "../runtime-rules";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { componentApproved, componentUsable } from "./write";
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
    componentApproved(handle, item) &&
    control(handle) === trigger &&
    componentUsable(trigger) &&
    trigger.getAttribute("name") === handle.candidate.domName
  );
}
export async function waitFor<T>(
  read: () => T | undefined,
  signal: AbortSignal,
  document: Document,
  timeoutMs = componentRules(document).timeouts.defaultMs,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) =>
      setTimeout(resolve, componentRules(document).timeouts.pollMs),
    );
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

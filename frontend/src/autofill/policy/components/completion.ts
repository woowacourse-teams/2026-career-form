import { componentPolicy, componentCapability } from "../component-policy";
import { componentSyntheticDomName } from "./collection";
import { executeComponentFlow } from "../../interaction/component-email-close-bridge";
import type { CompanyWriteAdapter } from "../../adapters/write";
export const componentCompletion: NonNullable<
  CompanyWriteAdapter["completion"]
> = (handle, item) => {
  const input = handle.elements[0];
  if (
    !(input instanceof HTMLInputElement) ||
    !componentCapability(input.ownerDocument, "commit") ||
    item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.valueBinding?.type !== "DIRECT"
  )
    return undefined;
  const rule = (componentPolicy(input.ownerDocument).completions ?? []).find(
    (rule) =>
      rule.enabled &&
      rule.key === item.analysis!.valueBinding!.profileFieldKey &&
      rule.name === handle.candidate.domName,
  );
  if (!rule) return undefined;
  return {
    stage: rule.stage,
    failureMessage: rule.failureMessage,
    async settle(current, beforeMutation) {
      const valid = () =>
        current() &&
        input.isConnected &&
        handle.isCurrentContext?.() !== false &&
        componentSyntheticDomName(input) === rule.name &&
        input.value === item.profileValue;
      return (
        valid() && executeComponentFlow(input, rule.plan, valid, beforeMutation)
      );
    },
  };
};

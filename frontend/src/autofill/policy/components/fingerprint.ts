import {
  executionPolicy,
  executionPolicyForSite,
} from "../../workflow/execution-policy";
import type { FieldCandidate } from "../../api/types";

export function hasComponentFieldCandidates(
  candidates: Iterable<FieldCandidate>,
  site?: { host: string; pathPattern: string },
): boolean {
  const policy = site && executionPolicyForSite(site)?.componentPolicy;
  const basicNames = policy && policy.basicNames;
  const rule = policy && policy.runtimeRules?.components?.fingerprint;
  if (!basicNames || !rule) return false;
  const fields = [...candidates];
  return basicNames.every(
    (name) =>
      fields.filter(
        (field) =>
          field.domName === name &&
          field.element === rule.element &&
          field.control === rule.control,
      ).length === rule.count,
  );
}

export function componentBasicControls(
  document: Document,
): HTMLInputElement[] | undefined {
  const basicNames = executionPolicy(document)?.componentPolicy?.basicNames;
  if (!basicNames) return undefined;
  const rule =
    executionPolicy(document)?.componentPolicy?.runtimeRules?.components
      ?.fingerprint;
  if (!rule) return undefined;
  const controls = basicNames.map((name) =>
    document.querySelectorAll<HTMLInputElement>(
      rule.selector.replaceAll("{name}", CSS.escape(name)),
    ),
  );
  return controls.every((matches) => matches.length === rule.count)
    ? controls.map(([input]) => input)
    : undefined;
}

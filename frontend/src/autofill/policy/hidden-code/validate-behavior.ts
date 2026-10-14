import type { HiddenCodeContract } from "./contract";
export function validBehaviorRelations(contract: HiddenCodeContract): boolean {
  const b = contract.behavior;
  if (
    b.address.detailWorkflow.plans[b.address.detailEntrypoint]?.realm !==
      "LOCAL" ||
    !["searchNotify", "searchConfirmed", "afterTextWrite"].every((key) =>
      Array.isArray(b.actionPlans[key]),
    ) ||
    ![
      "coded-search",
      "fixed-code-search",
      "blank",
      "option",
      "catalogOption",
    ].every((key) => Array.isArray(b.confirmations[key])) ||
    !["coded-search", "fixed-code-search"].every((key) =>
      Array.isArray(b.snapshots[key]),
    ) ||
    !Object.values(b.snapshots).every(
      (rules) =>
        rules.length <= 32 &&
        rules.every(
          (rule) =>
            rule.kind === "VALUE" ||
            (typeof rule.name === "string" &&
              /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(rule.name)),
        ),
    ) ||
    !b.settlements.every(
      (rule) => !rule.fallbackSelector || Array.isArray(rule.fallbackPlan),
    ) ||
    !Object.values(b.datasetKeys).every((key) =>
      /^[a-zA-Z][a-zA-Z0-9]*$/.test(key),
    ) ||
    !Number.isInteger(b.rowPreparation.resetOptionCount) ||
    b.rowPreparation.resetOptionCount < 0 ||
    b.rowPreparation.resetOptionCount > 8
  )
    return false;
  const unique = <T>(rows: T[], key: (row: T) => string) =>
    new Set(rows.map(key)).size === rows.length;
  if (
    !unique(b.drivers, (r) =>
      JSON.stringify([r.field, r.key, r.command, r.group]),
    ) ||
    !unique(b.conditionalStates, (r) =>
      JSON.stringify([r.driver, r.code, r.label]),
    ) ||
    !unique(b.searches, (r) => JSON.stringify([r.domName, r.group])) ||
    !unique(b.fixedCodeSearches, (r) => r.name) ||
    !unique(b.textControls, (r) => r.id) ||
    !unique(b.codedButtons, (r) => r.key) ||
    !unique(b.catalogTexts, (r) => r.name) ||
    !unique(b.settlements, (r) => r.field)
  )
    return false;
  if (
    !b.drivers.every(
      (r) =>
        Number.isInteger(r.stage) &&
        Math.abs(r.stage) <= 100 &&
        Number.isInteger(r.stride) &&
        r.stride >= 0 &&
        r.stride <= 32,
    )
  )
    return false;
  if (
    !b.textControls.every(
      (r) =>
        Number.isInteger(r.maxLength) && r.maxLength > 0 && r.maxLength <= 256,
    )
  )
    return false;
  if (
    !b.groupIdentity.rules.length ||
    !unique(b.groupIdentity.rules, (r) => JSON.stringify(r))
  )
    return false;
  const steps = b.rowPreparation;
  if (
    ![steps.selectSteps, steps.resetSteps].every(
      (list) =>
        list.length > 0 &&
        list.length <= 3 &&
        new Set(list).size === list.length,
    ) ||
    !steps.selectSteps.includes("CLICK_EXACT_OPTION") ||
    steps.selectSteps.at(-1) !== "WAIT_REVEALED" ||
    !steps.resetSteps.includes("CLICK_RESET") ||
    steps.resetSteps.at(-1) !== "WAIT_EMPTY"
  )
    return false;
  // Validate regexes and DOM selectors before any interaction uses them.
  const walk = (value: unknown, key = ""): boolean => {
    if (typeof value === "string") {
      if (key === "idPattern") new RegExp(value);
      if (
        (key.endsWith("Selector") ||
          ["scope", "ancestor", "forbiddenAncestor", "selector"].includes(
            key,
          )) &&
        typeof document !== "undefined"
      )
        document.createDocumentFragment().querySelector(value);
      return true;
    }
    if (Array.isArray(value)) return value.every((child) => walk(child, key));
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.source === "string" && typeof obj.flags === "string")
        new RegExp(obj.source, obj.flags);
      return Object.entries(obj).every(([k, v]) => walk(v, k));
    }
    return true;
  };
  try {
    return walk(b);
  } catch {
    return false;
  }
}

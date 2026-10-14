import {
  validAddressProviderPolicy,
  type AddressProviderPolicy,
} from "../address/provider-policy";
import {
  validComponentPolicy,
  type ComponentPolicy,
} from "../policy/component-policy";
import type { BrowserPolicy } from "../policy/types";
import { validBrowserPolicy } from "../policy/validate";
export interface SearchRule {
  confirmation?: { dataKey: string; value: boolean };
  invalidResultIds?: string[];
  readyCount?: number;
  fieldName: string;
  profileFieldKey: string;
  rowSelector: string;
  catalogKind: string;
  stageOffset: number;
  requireResultId: boolean;
  readySelector: string;
  standardAliases?: boolean;
  stripParentheticalLabel?: boolean;
  allowDirectInput?: boolean;
  menuTimeoutMs?: number;
  readyTimeoutMs?: number;
}
export interface ExecutionPolicy {
  providerPolicy?: AddressProviderPolicy | null;
  version: 1;
  browserPolicy?: BrowserPolicy;
  componentPolicy?: ComponentPolicy;
  searches: SearchRule[];
  failureScopes: {
    fieldName: string;
    profileFieldKey: string;
    rowSelector: string;
  }[];
  address: {
    provider: "KAKAO";
    rootSelector: string;
    triggerSelector: string;
    fieldNames: string[];
    layerSelector: string;
    closeSelector: string;
  } | null;
}
export function policyPath(path: string): string {
  return (
    path
      .split("/")
      .map((segment) =>
        /^\d+$/.test(segment) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
        segment.length > 32
          ? "*"
          : segment,
      )
      .join("/") || "/"
  );
}
const sitePolicies = new Map<string, ExecutionPolicy>();
export function executionPolicyForSite(site: {
  host: string;
  pathPattern: string;
}) {
  return sitePolicies.get(
    site.host.toLowerCase() + policyPath(site.pathPattern),
  );
}
const policies = new WeakMap<
  Document,
  { url: string; policy: ExecutionPolicy }
>();
export function installExecutionPolicy(
  document: Document,
  policy?: ExecutionPolicy,
) {
  const url = new URL(document.URL);
  const key = url.host.toLowerCase() + policyPath(url.pathname);
  if (!policy) {
    sitePolicies.delete(key);
    policies.delete(document);
    return;
  }
  sitePolicies.set(key, policy);
  policies.set(document, { url: document.URL, policy });
}
export function executionPolicy(
  document: Document,
): ExecutionPolicy | undefined {
  const entry = policies.get(document);
  return entry?.url === document.URL ? entry.policy : undefined;
}
export function searchRule(document: Document, name: string | undefined) {
  const policy = executionPolicy(document);
  const rule = policy?.searches.find((rule) => rule.fieldName === name);
  const behavior = policy?.browserPolicy?.runtimeRules?.autocomplete;
  return rule && behavior
    ? {
        ...rule,
        confirmation: {
          dataKey: behavior.confirmationDataKey,
          value: behavior.confirmationValue,
        },
        invalidResultIds: behavior.invalidResultIds,
        readyCount: behavior.readyCount,
      }
    : undefined;
}
export function validSearchRule(value: unknown): value is SearchRule {
  if (!value || typeof value !== "object") return false;
  const v = value as SearchRule;
  return (
    [v.fieldName, v.profileFieldKey, v.rowSelector, v.catalogKind].every(
      (x) => typeof x === "string" && !!x && x.length < 300,
    ) &&
    ["university", "certificate", "languageTest"].includes(v.catalogKind) &&
    typeof v.readySelector === "string" &&
    v.readySelector.length < 500 &&
    typeof v.requireResultId === "boolean" &&
    (v.readyCount === undefined ||
      (Number.isInteger(v.readyCount) &&
        v.readyCount > 0 &&
        v.readyCount <= 128)) &&
    (v.confirmation === undefined ||
      (!!v.confirmation &&
        typeof v.confirmation.dataKey === "string" &&
        /^[A-Za-z][A-Za-z0-9_-]*$/.test(v.confirmation.dataKey) &&
        typeof v.confirmation.value === "boolean")) &&
    (v.invalidResultIds === undefined ||
      (Array.isArray(v.invalidResultIds) &&
        v.invalidResultIds.length <= 64 &&
        v.invalidResultIds.every(
          (x) => typeof x === "string" && x.length <= 128,
        ))) &&
    [v.standardAliases, v.stripParentheticalLabel, v.allowDirectInput].every(
      (x) => x === undefined || typeof x === "boolean",
    ) &&
    [v.menuTimeoutMs, v.readyTimeoutMs].every(
      (x) => x === undefined || (Number.isInteger(x) && x >= 0 && x <= 10000),
    ) &&
    Number.isInteger(v.stageOffset) &&
    v.stageOffset >= 0 &&
    v.stageOffset <= 20
  );
}
export function validExecutionPolicy(value: unknown): value is ExecutionPolicy {
  if (!value || typeof value !== "object") return false;
  const p = value as ExecutionPolicy;
  const text = (x: unknown): x is string =>
    typeof x === "string" && !!x && x.length < 500;
  return (
    p.version === 1 &&
    (p.providerPolicy == null ||
      validAddressProviderPolicy(p.providerPolicy)) &&
    (p.browserPolicy == null || validBrowserPolicy(p.browserPolicy)) &&
    (p.componentPolicy == null || validComponentPolicy(p.componentPolicy)) &&
    !(p.browserPolicy && p.componentPolicy) &&
    Array.isArray(p.searches) &&
    p.searches.length <= 64 &&
    p.searches.every(validSearchRule) &&
    new Set(p.searches.map((r) => r.fieldName)).size === p.searches.length &&
    Array.isArray(p.failureScopes) &&
    p.failureScopes.length <= 64 &&
    p.failureScopes.every(
      (r) =>
        r &&
        text(r.fieldName) &&
        text(r.profileFieldKey) &&
        text(r.rowSelector),
    ) &&
    (p.address === null ||
      (!!p.address &&
        p.address.provider === "KAKAO" &&
        [
          p.address.rootSelector,
          p.address.triggerSelector,
          p.address.layerSelector,
          p.address.closeSelector,
        ].every(text) &&
        Array.isArray(p.address.fieldNames) &&
        p.address.fieldNames.length === 3 &&
        p.address.fieldNames.every(
          (n) => text(n) && /^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(n),
        )))
  );
}

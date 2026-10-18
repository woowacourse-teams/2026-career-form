import type { RuntimeRules } from "../runtime-rules";
import type {
  CatalogApproval,
  CatalogEvidence,
} from "../../profile/catalog-match";
import { normalizedCatalogLabel } from "../../profile/catalog-match";
import { CATALOG } from "../../../profile/catalog";
import type { SearchResultMatchPolicy } from "./behavior";

/** Interpret option text using server-provided data; never discard campus text. */
export function policyResultMatches(
  policy: SearchResultMatchPolicy,
  approval: CatalogApproval,
  query: string,
  evidence: CatalogEvidence,
  rules: NonNullable<RuntimeRules["hiddenCode"]>["schoolMatch"],
): boolean {
  const replace = (value: string, rules: { from: string; to: string }[]) => {
    let text = normalizedCatalogLabel(value);
    for (const rule of rules) {
      const from = normalizedCatalogLabel(rule.from);
      if (from && text.endsWith(from))
        text = text.slice(0, -from.length) + normalizedCatalogLabel(rule.to);
    }
    return text;
  };
  const name = (value: string) => replace(value, policy.nameReplacements);
  const region = (value: string) => replace(value, policy.regionReplacements);
  if (
    !policy.separator ||
    !policy.detailSeparator ||
    approval.status === "invalid"
  )
    return false;
  const split =
    rules.splitPosition === "LAST"
      ? evidence.label.lastIndexOf(policy.separator)
      : evidence.label.indexOf(policy.separator);
  const label = split < 0 ? evidence.label : evidence.label.slice(0, split);
  const detail =
    split < 0
      ? evidence.detail
      : evidence.label.slice(split + policy.separator.length);
  const labels =
    approval.status === "selected" ? approval.match.labels : [query];
  if (!labels.some((value) => name(value) === name(label))) return false;
  if (rules.mode === "NAME_ONLY" || approval.status !== "selected") return true; // caller still requires one unique result
  const expectedDetail = approval.match.requiredDetail;
  if (!expectedDetail) return !rules.requireDetail;
  const unspecified =
    !detail ||
    policy.unspecifiedRegions.some((value) => region(value) === region(detail));
  const entries = CATALOG.filter(
    (entry) =>
      entry.kind === approval.match.kind &&
      [entry.name, ...entry.aliases].some(
        (value) => name(value) === name(label),
      ),
  );
  if (unspecified)
    return (
      rules.unspecifiedRegion === "UNIQUE_CATALOG" &&
      entries.length === 1 &&
      entries[0]?.detail === expectedDetail
    );
  const detailRegion = (value: string) => {
    const parts = value.split(policy.detailSeparator);
    return policy.regionDetailIndexes.reduce((acc, index) => {
      if (!Number.isInteger(index) || index < 0) return acc;
      const part = region(parts[index] ?? "");
      return !part || acc.endsWith(part)
        ? acc
        : part.startsWith(acc)
          ? part
          : acc + part;
    }, "");
  };
  if (detailRegion(expectedDetail) !== region(detail!)) return false;
  // Same name and region must not silently choose another campus.
  const matches = entries.filter(
    (entry) => detailRegion(entry.detail) === region(detail!),
  );
  return (
    !rules.requireUniqueCampus ||
    (matches.length === 1 && matches[0]?.detail === expectedDetail)
  );
}

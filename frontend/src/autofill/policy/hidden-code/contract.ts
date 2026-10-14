import { validBehaviorRelations } from "./validate-behavior";
import schema from "./contract-schema.json";
import { validPolicyData } from "./validate-data";
import type { HiddenCodeBehavior } from "./behavior";
export interface HiddenCodeContract {
  schemaVersion: 3;
  behavior: HiddenCodeBehavior;
  engine: "HIDDEN_CODE_FORM";
  host: string;
  path: string;
  targets: Record<string, string>;
  tokens: Record<string, string>;
  messages: Record<string, string>;
  definitions: Record<string, unknown>;
  templates: Record<string, string[]>;
  patterns: Record<string, { source: string; flags: string }>;
}
export function validHiddenCodeContract(
  value: unknown,
): value is HiddenCodeContract {
  if (!value || typeof value !== "object") return false;
  const p = value as HiddenCodeContract;
  if (
    p.schemaVersion !== 3 ||
    p.engine !== "HIDDEN_CODE_FORM" ||
    typeof p.host !== "string" ||
    !/^[a-z0-9.-]+$/.test(p.host) ||
    typeof p.path !== "string" ||
    !p.path.startsWith("/") ||
    !Object.entries(schema.resources).every(([key, shape]) =>
      validPolicyData(p[key as keyof HiddenCodeContract], shape),
    ) ||
    !validPolicyData(p.behavior, schema.behavior)
  )
    return false;
  try {
    contractValue(p.definitions);
    for (const pattern of Object.values(p.patterns)) contractPattern(pattern);
    if (typeof document !== "undefined")
      for (const selector of Object.values(p.targets))
        document.createDocumentFragment().querySelector(selector);
    return validBehaviorRelations(p);
  } catch {
    return false;
  }
}
export function contractValue<T>(value: unknown): T {
  const decode = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(decode);
    if (!x || typeof x !== "object") return x;
    const o = x as Record<string, unknown>;
    if (Array.isArray(o.$map))
      return new Map(
        o.$map.map((pair) => {
          const [key, item] = pair as unknown[];
          return [decode(key), decode(item)];
        }),
      );
    if (Array.isArray(o.$set)) return new Set(o.$set.map(decode));
    if (typeof o.$regex === "string")
      return new RegExp(o.$regex, String(o.flags ?? ""));
    return Object.fromEntries(
      Object.entries(o).map(([key, item]) => [key, decode(item)]),
    );
  };
  return decode(value) as T;
}
export function contractPattern(pattern: {
  source: string;
  flags: string;
}): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}
export function contractText(parts: string[], values: unknown[]): string {
  if (parts.length !== values.length + 1)
    throw new Error("Invalid DOM contract template");
  return parts
    .map((part, i) => part + (i < values.length ? String(values[i]) : ""))
    .join("");
}

import { validFlowProgram } from "../flow-plan";
import { validDomPlan, validPlanConditions } from "../action-plan";
// Small data-schema validator; no evaluation, property access expressions or scripts.
const safeKey = (key: string) =>
  !["__proto__", "prototype", "constructor"].includes(key);
function selector(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 2000) return false;
  try {
    if (typeof document !== "undefined")
      document.createDocumentFragment().querySelector(value);
    return true;
  } catch {
    return false;
  }
}
function dom(value: unknown, depth: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 16)
    return false;
  const v = value as Record<string, unknown>;
  if ("all" in v || "any" in v) {
    const children = v.all ?? v.any;
    return (
      Object.keys(v).length === 1 &&
      Array.isArray(children) &&
      children.length > 0 &&
      children.length <= 64 &&
      children.every((child) => dom(child, depth + 1))
    );
  }
  if (
    Object.keys(v).some(
      (key) =>
        ![
          "path",
          "minCount",
          "maxCount",
          "enabled",
          "required",
          "value",
          "nonEmpty",
          "text",
          "attributes",
          "attributePatterns",
        ].includes(key),
    )
  )
    return false;
  return (
    Array.isArray(v.path) &&
    v.path.length > 0 &&
    v.path.length <= 8 &&
    v.path.every((step) => {
      if (!step || typeof step !== "object" || Object.keys(step).length !== 1)
        return false;
      return (
        ("query" in step && selector(step.query)) ||
        ("closest" in step && selector(step.closest)) ||
        ("parent" in step && step.parent === true)
      );
    }) &&
    ["enabled", "required", "nonEmpty"].every(
      (key) => v[key] === undefined || typeof v[key] === "boolean",
    ) &&
    ["minCount", "maxCount"].every(
      (key) =>
        v[key] === undefined ||
        (Number.isInteger(v[key]) &&
          Number(v[key]) >= 0 &&
          Number(v[key]) <= 256),
    ) &&
    (v.text === undefined ||
      (typeof v.text === "string" && v.text.length <= 1000)) &&
    ["attributes", "attributePatterns"].every((key) => {
      const values = v[key];
      if (values === undefined) return true;
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        Object.keys(values).length > 16
      )
        return false;
      return Object.entries(values).every(([name, val]) => {
        if (
          !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) ||
          typeof val !== "string" ||
          val.length > 1000
        )
          return false;
        try {
          if (key === "attributePatterns") new RegExp(val);
          return true;
        } catch {
          return false;
        }
      });
    }) &&
    (v.value === undefined || typeof v.value === "string") &&
    Number(v.minCount ?? 1) <= Number(v.maxCount ?? 1)
  );
}
export function validPolicyData(
  value: unknown,
  schema: unknown,
  depth = 0,
): boolean {
  if (depth > 32) return false;
  if (schema === "$flow") return validFlowProgram(value);
  if (schema === "$checks") return validPlanConditions(value);
  if (schema === "$plan") return validDomPlan(value);
  if (schema === "$dom") return dom(value, 0);
  if (typeof schema === "string")
    return schema === "null"
      ? value === null
      : typeof value === schema &&
          (typeof value !== "number" || Number.isFinite(value)) &&
          (typeof value !== "string" || value.length <= 2000);
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.$enum)) return s.$enum.includes(value);
  if (Array.isArray(s.$oneOf))
    return s.$oneOf.some((child) => validPolicyData(value, child, depth + 1));
  if (Array.isArray(s.$tuple))
    return (
      Array.isArray(value) &&
      value.length === s.$tuple.length &&
      s.$tuple.every((child, i) => validPolicyData(value[i], child, depth + 1))
    );
  if (s.$array)
    return (
      Array.isArray(value) &&
      value.length <= 256 &&
      value.every((child) => validPolicyData(child, s.$array, depth + 1))
    );
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length > 256 || entries.some(([key]) => !safeKey(key)))
    return false;
  if (s.$record)
    return entries.every(([, v]) => validPolicyData(v, s.$record, depth + 1));
  if (
    !s.$object ||
    typeof s.$object !== "object" ||
    !Array.isArray(s.$required)
  )
    return false;
  const shape = s.$object as Record<string, unknown>;
  return (
    s.$required.every(
      (key) => typeof key === "string" && Object.hasOwn(obj, key),
    ) &&
    entries.every(
      ([key, v]) =>
        Object.hasOwn(shape, key) && validPolicyData(v, shape[key], depth + 1),
    )
  );
}

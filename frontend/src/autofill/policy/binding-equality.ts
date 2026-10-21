/**
 * Compares two JSON-shaped value bindings by meaning, not serialization.
 * The server copies optionMap with Java Map.copyOf, whose key order changes
 * per JVM, so key order is ignored. Key sets, array order and primitive
 * values (including null versus undefined) must match exactly.
 */
export function sameValueBinding(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  if (Array.isArray(a))
    return (
      a.length === (b as unknown[]).length &&
      a.every((value, i) => sameValueBinding(value, (b as unknown[])[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && sameValueBinding(left[key], right[key]),
    )
  );
}

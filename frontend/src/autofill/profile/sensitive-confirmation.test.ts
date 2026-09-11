import { expect, it } from "vitest";
import { requiresSensitiveConfirmation } from "./sensitive-confirmation";

it.each([
  undefined,
  "",
  "compensation.compensation.desiredSalary",
  "military.unknown.militaryStatus",
  "veteran.veteran.unknown",
  "disability.disability.disabilityStatus.extra",
])("does not exempt unknown or unrelated field %s", (key) => {
  expect(requiresSensitiveConfirmation(key, true)).toBe(true);
  expect(requiresSensitiveConfirmation(key, false)).toBe(false);
});

import { expect, it } from "vitest";
import { requiresSensitiveConfirmation } from "./sensitive-confirmation";

it.each([
  undefined,
  "",
  "compensation.compensation.desiredSalary",
  "military.unknown.militaryStatus",
  "veteran.veteran.unknown",
  "disability.disability.disabilityStatus.extra",
])("does not add a sensitive confirmation gate for %s", (key) => {
  expect(requiresSensitiveConfirmation(key, true)).toBe(false);
  expect(requiresSensitiveConfirmation(key, false)).toBe(false);
});

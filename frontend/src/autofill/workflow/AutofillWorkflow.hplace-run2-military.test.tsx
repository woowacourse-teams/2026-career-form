import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
import { screen } from "@testing-library/react";
import {
  liveApplicant,
  liveAddress,
} from "./test-utils/hplace-run2.live-derived";
it("waits for linkedForm delayed military children before native branch collection", async () => {
  const { mountRun1, profile, run, input } =
    await import("./hplace-run1.test-fixtures");
  const { policy } = mountRun1();
  document.querySelector('[data-code="11"]')!.innerHTML = liveApplicant;
  document.querySelector('[data-row="address"]')!.outerHTML = liveAddress;
  document.head.insertAdjacentHTML(
    "beforeend",
    "<style>.hidden {display:none}</style>",
  );
  const children = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-rel-target="military"]',
    ),
  );
  document
    .querySelector('[name="military.militaryTypeCode"][value="01"]')!
    .addEventListener("click", () => {
      children.forEach((e) => (e.disabled = true));
      setTimeout(() => children.forEach((e) => (e.disabled = false)), 50);
    });
  run(policy, profile());
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(input("military.militaryBranchCode").value).toBe("01");
});
// The server builds LookupBinding with Map.copyOf, whose iteration order is
// JVM-randomized; this is one order observed from the real 8-entry 군별 map.
const serverBranchOrder = [
  "공군",
  "해군",
  "전투경찰",
  "의무소방",
  "해병대",
  "육군",
  "해양경찰",
  "의무경찰",
];
it("writes the native branch when the server reorders the LOOKUP optionMap after delayed military children", async () => {
  const { mountRun1, profile, run, input } =
    await import("./hplace-run1.test-fixtures");
  const { policy } = mountRun1();
  document.querySelector('[data-code="11"]')!.innerHTML = liveApplicant;
  document.querySelector('[data-row="address"]')!.outerHTML = liveAddress;
  document.head.insertAdjacentHTML(
    "beforeend",
    "<style>.hidden {display:none}</style>",
  );
  const children = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-rel-target="military"]',
    ),
  );
  document
    .querySelector('[name="military.militaryTypeCode"][value="01"]')!
    .addEventListener("click", () => {
      children.forEach((e) => (e.disabled = true));
      setTimeout(() => children.forEach((e) => (e.disabled = false)), 50);
    });
  run(policy, profile(), (response) => ({
    ...response,
    fields: response.fields.map((field) => {
      const binding = "valueBinding" in field ? field.valueBinding : undefined;
      if (
        binding?.type !== "LOOKUP" ||
        binding.profileFieldKey !== "military.military.militaryBranch"
      )
        return field;
      expect(Object.keys(binding.optionMap).sort()).toEqual(
        [...serverBranchOrder].sort(),
      );
      return {
        ...field,
        valueBinding: {
          type: "LOOKUP",
          profileFieldKey: binding.profileFieldKey,
          optionMap: Object.fromEntries(
            serverBranchOrder.map((k) => [k, binding.optionMap[k]]),
          ),
        },
      } as typeof field;
    }),
  }));
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(input("military.militaryBranchCode").value).toBe("01");
});

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

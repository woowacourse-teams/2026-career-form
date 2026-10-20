/**
 * CF-177 demo on two unverified tenants (2026-10-20, structure only):
 * - huonsgroup step 1: service dates are `military.militaryDate:YMD`
 *   (the verified tenants use `:YM`).
 * - com2us step 1: section 13 has no current-address row.
 * - both: no English-name order guide; the user chose family-first
 *   ("HONG GILDONG") when the company states no order.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import { input, mountRun1, profile, run } from "./hplace-run1.test-fixtures";

afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});

function demoProfile() {
  const p = profile();
  p.personal.englishFamilyName = "HONG";
  p.personal.englishGivenName = "GILDONG";
  p.personal.birthDate = "1995-01-02";
  return p;
}

const militaryValues = () => ({
  rank: input("military.militaryPositionCode").value,
  start: input("military.militaryStartDate").value,
  end: input("military.militaryEndDate").value,
  discharge: input("military.militaryDischargeCode").value,
  branch: input("military.militaryBranchCode").value,
});

it("fills the military details when the tenant uses day-precision service dates", async () => {
  const { policy } = mountRun1();
  input("military.militaryStartDate").setAttribute(
    "data-dates",
    "military.militaryDate:YMD",
  );
  run(policy, demoProfile());
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(militaryValues()).toEqual({
    rank: "04",
    start: "2020.03.01",
    end: "2021.09.30",
    discharge: "01",
    branch: "01",
  });
});

it("fills the applicant details on a tenant without a current-address row", async () => {
  const { policy } = mountRun1();
  document.querySelector('[data-row="address"]')!.closest(".subject")!.remove();
  run(policy, demoProfile());
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(
    document.querySelector<HTMLInputElement>('[name="genderFlag"]:checked')
      ?.value,
  ).toBe("M");
  // The birthday rule lives in the BE legacy factory; detail.test.ts covers it.
  expect(militaryValues()).toEqual({
    rank: "04",
    start: "2020.03",
    end: "2021.09",
    discharge: "01",
    branch: "01",
  });
});

it("writes the English name family-first when the company states no order", async () => {
  const { policy } = mountRun1();
  expect(document.querySelector(".guide.englishName")).toBeNull();
  run(policy, demoProfile());
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(input("englishName").value).toBe("HONG GILDONG");
});

it("writes the English name on a KDI-type page without birthday and gender", async () => {
  const { policy } = mountRun1();
  const english = input("englishName");
  document.querySelector('label[for="birthday"]')!.remove();
  input("birthday").remove();
  document
    .querySelectorAll('[name="genderFlag"]')
    .forEach((e) => e.closest("label")!.remove());
  english
    .closest(".subject")!
    .insertAdjacentHTML(
      "afterbegin",
      '<div class="wrapGuide"><div class="guide hasTitle englishName">* Hong, Gildong (여권상 영문성명 기재)</div></div>',
    );
  run(policy, demoProfile());
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(english.value).toBe("HONG GILDONG");
});

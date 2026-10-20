/**
 * CF-177: a Hplace step-1 field that is on the page and active but whose
 * structure the legacy detail/basic contract cannot verify must be listed as
 * "입력 불가" instead of silently staying empty (AGENTS.md adapter rule,
 * Issue #177 AC7). Fields the page does not render, conditional fields that
 * are still closed and fields without a profile value are not listed.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
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

const UNVERIFIED = "입력 불가(화면 구조 확인 불가)";

function fullProfile() {
  const p = profile();
  p.personal.englishFamilyName = "HONG";
  p.personal.englishGivenName = "GILDONG";
  p.personal.birthDate = "1995-01-02";
  return p;
}

/** Field labels listed with the unverified-structure reason. */
async function unverifiedLabels(): Promise<string[]> {
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  const tab = screen.queryByRole("tab", { name: /확인 필요/ });
  if (!tab || tab.getAttribute("aria-label") === "확인 필요 0개") return [];
  fireEvent.click(tab);
  const panel = screen.getByRole("tabpanel");
  return Array.from(panel.querySelectorAll("article"))
    .filter((row) => row.textContent?.includes(UNVERIFIED))
    .map(
      (row) =>
        row
          .querySelector('button[title="필드로 이동"] span, div > div > span')
          ?.textContent?.trim() ?? "",
    )
    .sort();
}

it("lists the visible detail fields when the detail structure cannot be verified", async () => {
  const { policy } = mountRun1();
  // A present but malformed birthday makes the whole legacy contract fail.
  input("birthday").setAttribute("data-dates", "birthday:YM");
  run(policy, fullProfile());
  const labels = await unverifiedLabels();
  expect(labels).toEqual(
    // Profile labels; the English name keeps the page label.
    [
      "병역 상태",
      "보훈 대상 여부",
      "생년월일",
      "성별",
      "영문이름",
      "장애 여부",
    ].sort(),
  );
  expect(input("englishName").value).toBe("");
});

it("lists a conditional child that opened but whose structure is unverified", async () => {
  const { policy } = mountRun1();
  input("military.militaryStartDate").setAttribute(
    "data-dates",
    "military.militaryDate:Y",
  );
  run(policy, fullProfile());
  const labels = await unverifiedLabels();
  expect(labels).toEqual(
    expect.arrayContaining(["복무 시작일", "복무 종료일"]),
  );
  expect(labels).not.toContain("계급");
});

it("does not list fields the page does not render", async () => {
  const { policy } = mountRun1();
  document.querySelector('label[for="birthday"]')!.remove();
  input("birthday").remove();
  run(policy, fullProfile());
  expect(await unverifiedLabels()).toEqual([]);
});

it("does not list unverified fields without a profile value", async () => {
  const { policy } = mountRun1();
  input("birthday").setAttribute("data-dates", "birthday:YM");
  const p = fullProfile();
  p.personal.birthDate = "";
  p.personal.englishFamilyName = "";
  run(policy, p);
  const labels = await unverifiedLabels();
  expect(labels).not.toContain("생년월일");
  expect(labels).not.toContain("영문이름");
});

it("lists nothing on a verified page", async () => {
  const { policy } = mountRun1();
  run(policy, fullProfile());
  expect(await unverifiedLabels()).toEqual([]);
});

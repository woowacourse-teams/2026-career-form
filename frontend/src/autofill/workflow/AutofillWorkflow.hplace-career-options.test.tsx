/**
 * CF-177 C9 (F8): a career whose employment type the tenant does not offer
 * (careerhyundai: seven labels, no 아르바이트·기타) is reported as
 * OPTION_UNMATCHED from the review. It never costs a driver pass and never
 * gets an added career row. Synthetic DOM, virtual Sn codes and values only.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { mountCareer } from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import { createEmptyProfile, type Profile } from "../../profile/model";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import { renderNativeWorkflow } from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

const UNMATCHED =
  "지원서 선택지에서 프로필 값과 일치하는 항목을 찾지 못했어요. 프로필 값을 확인해 주세요.";

type MutableForm = {
  sections: { fields: { driver?: { timeoutMs: number } | null }[] }[];
};
function mount(labels: "seven" | "nine" = "seven"): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountCareer(1, { labels });
  const form = (policy.browserPolicy as unknown as { nativeForm: MutableForm })
    .nativeForm;
  for (const section of form.sections)
    for (const field of section.fields)
      if (field.driver)
        field.driver.timeoutMs = Math.min(field.driver.timeoutMs, 600);
  installExecutionPolicy(document, policy);
  return policy;
}
function careers(...types: string[]): Profile {
  const profile = createEmptyProfile();
  profile.careers = types.map((employmentType, i) => ({
    id: `synthetic-career-${i}`,
    sectionId: "career",
    values: {
      companyName: `합성회사 ${i}`,
      employmentType,
      startDate: "2020-01-01",
      employmentStatus: "재직중",
    },
  }));
  return profile;
}
const rows = () => document.querySelectorAll("[data-loop=career]").length;
const selected = (row: number) =>
  document
    .querySelector<HTMLSelectElement>(
      `[name="career[${row}].careerCriteriaCodeSn"]`,
    )!
    .selectedOptions[0]?.textContent?.trim();
async function pendingPanel() {
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
  return screen.getByRole("tabpanel");
}

it("reports a sole unoffered career from the review in one analysis", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: careers("아르바이트"),
  });
  const panel = await pendingPanel();
  expect(counters.requests).toBe(1);
  expect(counters.adds).toBe(0);
  expect(counters.forbidden).toBe(0);
  expect(rows()).toBe(1);
  expect(selected(0)).not.toBe("아르바이트");
  expect(within(panel).getByText(UNMATCHED)).toBeVisible();
  expect(
    within(panel).getAllByText("아르바이트", { selector: "span" }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.queryByText(
      "조건부 선택 결과를 확인하지 못했어요. 이 항목을 직접 골라 주세요.",
    ),
  ).not.toBeInTheDocument();
}, 120_000);

it("reports several unoffered careers in one analysis without adding rows", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: careers("아르바이트", "기타"),
  });
  const panel = await pendingPanel();
  expect(counters.requests).toBe(1);
  expect(counters.adds).toBe(0);
  expect(rows()).toBe(1);
  expect(within(panel).getAllByText(UNMATCHED)).toHaveLength(2);
  for (const value of ["아르바이트", "기타"])
    expect(
      within(panel).getAllByText(value, { selector: "span" }).length,
      value,
    ).toBeGreaterThan(0);
}, 120_000);

it("adds no row for the unoffered career and still writes the offered one", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: careers("정규", "아르바이트"),
  });
  const panel = await pendingPanel();
  expect(counters.adds).toBe(0);
  expect(rows()).toBe(1);
  expect(selected(0)).toBe("정규직");
  expect(
    document.querySelector<HTMLInputElement>('[name="career[0].company"]')!
      .value,
  ).toBe("합성회사 0");
  expect(within(panel).getAllByText(UNMATCHED)).toHaveLength(1);
  expect(
    within(panel).getAllByText("아르바이트", { selector: "span" }).length,
  ).toBeGreaterThan(0);
}, 120_000);

it("keeps adding and writing every career on a tenant that offers every type", async () => {
  const policy = mount("nine");
  const { counters } = renderNativeWorkflow({
    policy,
    profile: careers("정규", "아르바이트"),
  });
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(counters.adds).toBe(1);
  expect(rows()).toBe(2);
  expect(selected(0)).toBe("정규직");
  expect(selected(1)).toBe("아르바이트");
  expect(screen.queryByText(UNMATCHED)).not.toBeInTheDocument();
}, 120_000);

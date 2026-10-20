/**
 * CF-177 C2 (F3): a site that never answers education searches still ends in
 * a result screen within the native analysis budget, lists every search row
 * for manual input and keeps the ordinary writes (score, scale).
 * Synthetic DOM and values only.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import { renderNativeWorkflow } from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";

afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});

type MutableNativeForm = {
  sections: {
    fields: {
      search?: { timeoutMs: number } | null;
      driver?: { timeoutMs: number } | null;
    }[];
  }[];
};

function fastEducation(): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(2, 1, true);
  const form = (
    policy.browserPolicy as unknown as { nativeForm: MutableNativeForm }
  ).nativeForm;
  for (const section of form.sections)
    for (const field of section.fields) {
      if (field.search) field.search.timeoutMs = 40;
      if (field.driver)
        field.driver.timeoutMs = Math.min(field.driver.timeoutMs, 300);
    }
  installExecutionPolicy(document, policy);
  return policy;
}

const value = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  )!.value;

it("reaches the result screen when no education search is answered", async () => {
  const policy = fastEducation();
  const perQuery = new Map<Element, number>();
  document.querySelector("#frm")!.addEventListener("keypress", (event) => {
    const query = event.target;
    if (query instanceof HTMLInputElement && query.type === "search")
      perQuery.set(query, (perQuery.get(query) ?? 0) + 1);
  });
  const { counters } = renderNativeWorkflow({
    policy,
    profile: educationProfile(),
  });

  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(
    screen.queryByText(/입력 분석의 진전을 확인할 수 없습니다/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("자동 기입을 진행하지 못했습니다."),
  ).not.toBeInTheDocument();
  expect(counters.requests).toBeLessThanOrEqual(5);
  // Every school and major query is tried once (one keypress batch per stage).
  const queries = document.querySelectorAll("#frm input[type=search]");
  expect(perQuery.size).toBe(queries.length);
  expect([...perQuery.values()].every((count) => count === 1)).toBe(true);
  expect(counters.keypresses).toBe(queries.length);
  expect(counters.forbidden).toBe(0);

  fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
  const panel = screen.getByRole("tabpanel");
  for (const text of [
    "합성대학 A",
    "합성대학 B",
    "합성대학원",
    "소프트웨어융합",
    "가상복수전공",
    "가상부전공",
    "가상주전공 B",
    "가상연구전공",
  ])
    expect(
      within(panel).getAllByText(text, { selector: "span" }).length,
      text,
    ).toBeGreaterThan(0);
  expect(value("college[0].score")).toBe("3.75");
  expect(value("college[0].perfectScore")).toBe("4.5");
}, 120_000);

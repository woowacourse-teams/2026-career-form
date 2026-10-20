/**
 * CF-177 C10 (F11): the site enables a major row's details (major type,
 * category, day/night) only after the major code commit, through the
 * linkedForm focus poll. The last stage-3 major search must leave those
 * details collectable, and details that never enable must not block the
 * sibling majors or the score. Synthetic values and catalog only.
 */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  educationProfile,
  highschoolEntry,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { siteSeesEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import type { Profile } from "../../profile/model";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

type MutableForm = {
  sections: {
    fields: {
      search?: { timeoutMs: number } | null;
      driver?: { timeoutMs: number } | null;
    }[];
  }[];
};
function mount(
  options: Parameters<typeof mountEducation>[3] = {},
): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(2, 1, false, { liveGating: true, ...options });
  const form = (policy.browserPolicy as unknown as { nativeForm: MutableForm })
    .nativeForm;
  for (const section of form.sections)
    for (const field of section.fields) {
      if (field.search) field.search.timeoutMs = 800;
      if (field.driver)
        field.driver.timeoutMs = Math.min(field.driver.timeoutMs, 800);
    }
  installExecutionPolicy(document, policy);
  return policy;
}

/** Standard attendance values, a major field per school and, unless `gpa`, no GPA. */
function profile({ gpa = false }: { gpa?: boolean } = {}): Profile {
  const p = educationProfile();
  for (const entry of p.education) {
    entry.values.attendanceType = "attendance:day";
    entry.values.majorField = "공학계열(컴퓨터·통신)";
    if (!gpa) {
      delete entry.values.gpaScore;
      delete entry.values.gpaScale;
    }
  }
  return p;
}
const checked = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value;
const value = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  )?.value;
const responder = () =>
  catalogResponder(exactTitleCatalog(), { accept: siteSeesEnter });

it("writes the main major details the site enables after the last major commit", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: profile(),
    searchResponder: responder(),
  });
  await screen.findByText("기입 결과", {}, { timeout: 30000 });
  const parents = ["college[0]", "college[1]", "graduateSchool[0]"];
  await waitFor(() =>
    expect(value("graduateSchool[0].collegeMajor[0].majorName")).toBe(
      "가상연구전공",
    ),
  );
  const details = (parent: string) => {
    const major = `${parent}.collegeMajor[0]`;
    return {
      type: checked(`${major}.majorTypeCode`),
      category: value(`${major}.majorCategoryCode`),
      dayOrNight: checked(`${major}.dayOrNight`),
    };
  };
  expect(Object.fromEntries(parents.map((p) => [p, details(p)]))).toEqual(
    Object.fromEntries(
      parents.map((p) => [
        p,
        { type: "01", category: "118", dayOrNight: "01" },
      ]),
    ),
  );
  expect(counters.forbidden).toBe(0);
  expect(counters.requests).toBeLessThanOrEqual(8);
}, 60000);

it("writes sibling majors and the score when the details never enable", async () => {
  const policy = mount();
  // The site never opens the details: no relation hangs off the major code.
  for (const code of document.querySelectorAll('[name$=".majorCode"]'))
    code.removeAttribute("data-rel-id");
  const respond = responder();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: profile({ gpa: true }),
    searchResponder: (query, event) => {
      respond(query, event);
      for (const code of document.querySelectorAll('[name$=".majorCode"]'))
        code.removeAttribute("data-rel-id");
    },
  });
  await screen.findByText("기입 결과", {}, { timeout: 30000 });
  await waitFor(() =>
    expect(value("college[0].collegeMajor[2].majorName")).toBe("가상부전공"),
  );
  expect(value("college[0].collegeMajor[1].majorName")).toBe("가상복수전공");
  expect(value("college[0].collegeMajor[0].majorName")).toBe("소프트웨어융합");
  expect(value("college[0].score")).toBe("3.75");
  expect(value("graduateSchool[0].collegeMajor[0].majorName")).toBe(
    "가상연구전공",
  );
  expect(checked("college[0].collegeMajor[0].majorTypeCode")).toBeUndefined();
  expect(counters.forbidden).toBe(0);
  expect(counters.requests).toBeLessThanOrEqual(8);
}, 60000);

it("writes the high school day/night from the standard attendance value", async () => {
  const policy = mount({ highschool: { dayOrNight: true } });
  const p = profile();
  const highschool = highschoolEntry();
  highschool.values.attendanceType = "attendance:day";
  p.education = [highschool, ...p.education];
  renderNativeWorkflow({ policy, profile: p, searchResponder: responder() });
  await screen.findByText("기입 결과", {}, { timeout: 30000 });
  await waitFor(() =>
    expect(value("highschool.academyName")).toBe("합성고등학교"),
  );
  expect(checked("highschool.graduationTypeCode")).toBe("01");
  expect(checked("highschool.dayOrNight")).toBe("01");
}, 60000);

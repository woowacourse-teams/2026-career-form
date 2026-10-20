/**
 * CF-177 C13: section 16 project rows (subject data-code 154) on the live
 * structure. The builder rows match the C12 sanitized fixtures
 * (hplace-mrs2-live-fidelity.test.ts): projectName drives the row
 * (`data-rel-id=project[i]`, maxlength 128), clientName/workplace are
 * required site fields without a profile key, start/end dates are YMD and
 * role is maxlength 128. abl adds an unmodelled contribution rate.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  mountCareer,
  step2Profile,
} from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import { installExecutionPolicy } from "./execution-policy";
import { renderNativeWorkflow } from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import type { Profile } from "../../profile/model";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

function projectProfile(): Profile {
  const profile = step2Profile();
  profile.projects = [
    {
      id: "project-a",
      sectionId: "project",
      values: {
        projectName: "합성 프로젝트 A",
        startDate: "2023-01-02",
        endDate: "2023-06-30",
        role: "가상 역할 A",
        activityDetails: "가상 상세 A",
      },
    },
    {
      id: "project-b",
      sectionId: "project",
      values: {
        projectName: "합성 프로젝트 B",
        startDate: "2024-01-01",
        endDate: "2024-03-31",
        role: "가상 역할 B",
      },
    },
  ];
  return profile;
}

function mount(contributionRate = false) {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  return mountCareer(1, { labels: "nine", project: { contributionRate } });
}

const value = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ??
  "<absent>";
const projectRows = () =>
  document.querySelectorAll('[data-loop="project"]').length;
function pendingRows(): string[] {
  const tab = screen.getByRole("tab", { name: /^확인 필요 \d+개$/ });
  if (tab.getAttribute("aria-label") === "확인 필요 0개") return [];
  fireEvent.click(tab);
  const list = within(screen.getByRole("tabpanel")).getByRole("region", {
    name: "확인 필요한 항목",
  });
  return Array.from(list.querySelectorAll("article"), (row) =>
    row.textContent!.replace(/\s+/g, " ").trim(),
  );
}

it.each([false, true])(
  "fills every profile project into its own row (contribution rate column: %s)",
  async (contributionRate) => {
    const policy = mount(contributionRate);
    const { counters } = renderNativeWorkflow({
      policy,
      profile: projectProfile(),
    });
    await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 60000 });

    expect.soft(pendingRows()).toEqual([]);
    expect(projectRows()).toBe(2);
    expect({
      name0: value("project[0].projectName"),
      start0: value("project[0].startDate"),
      end0: value("project[0].endDate"),
      role0: value("project[0].role"),
      name1: value("project[1].projectName"),
      start1: value("project[1].startDate"),
      end1: value("project[1].endDate"),
      role1: value("project[1].role"),
    }).toEqual({
      name0: "합성 프로젝트 A",
      start0: "2023.01.02",
      end0: "2023.06.30",
      role0: "가상 역할 A",
      name1: "합성 프로젝트 B",
      start1: "2024.01.01",
      end1: "2024.03.31",
      role1: "가상 역할 B",
    });
    // Required site fields without a profile key stay for the applicant.
    for (const name of [
      "project[0].clientName",
      "project[0].workplace",
      "project[1].clientName",
      "project[1].workplace",
    ])
      expect(value(name), name).toBe("");
    if (contributionRate) expect(value("project[0].contributionRate")).toBe("");
    expect(counters.forbidden).toBe(0);
  },
  90000,
);

it("keeps a project row the applicant already filled and adds rows for the profile", async () => {
  const policy = mount();
  const name = document.querySelector<HTMLInputElement>(
    '[name="project[0].projectName"]',
  )!;
  // The linkedForm opens the row once its driver has a value.
  name.focus();
  name.value = "지원자 입력 프로젝트";
  name.blur();
  const start = document.querySelector<HTMLInputElement>(
    '[name="project[0].startDate"]',
  )!;
  await expect.poll(() => start.disabled).toBe(false);
  start.value = "2022.05.01";

  renderNativeWorkflow({ policy, profile: projectProfile() });
  await screen.findByText("자동 기입을 마쳤어요", {}, { timeout: 60000 });

  expect(value("project[0].projectName")).toBe("지원자 입력 프로젝트");
  expect(value("project[0].startDate")).toBe("2022.05.01");
  expect(value("project[0].role")).toBe("");
  expect(projectRows()).toBe(3);
  expect([1, 2].map((i) => value(`project[${i}].projectName`))).toEqual([
    "합성 프로젝트 A",
    "합성 프로젝트 B",
  ]);
}, 90000);

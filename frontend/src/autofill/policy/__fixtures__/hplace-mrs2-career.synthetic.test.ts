import { afterEach, expect, it } from "vitest";
import {
  CAREER_LABELS_NINE,
  CAREER_LABELS_SEVEN,
  appendCareerSection,
  careerOptionCodes,
  mountCareer,
  step2Profile,
} from "./hplace-mrs2-career.synthetic";
import { mountEducation } from "./hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "./hplace-mrs2-linked-form";
import { installExecutionPolicy } from "../../workflow/execution-policy";

const named = <T extends Element = HTMLInputElement>(name: string) =>
  document.querySelector<T & Element>(`[name="${name}"]`)!;
const all = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLInputElement>(selector));
const choose = (index: number, label: string) => {
  const select = named<HTMLSelectElement>(
    `career[${index}].careerCriteriaCodeSn`,
  );
  select.value = Array.from(select.options).find(
    (o) => o.textContent === label,
  )!.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
};
afterEach(() => {
  disposeLinkedForms();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});

it("renders the 16 career rows with virtual Sn codes and gated controls", () => {
  mountCareer(2);
  const subject = document.querySelector(
    "section.writeResume[data-code='16'] > .subject[data-code='153'][data-wrap='career']",
  )!;
  expect(
    subject.querySelectorAll(":scope > .loop[data-loop='career']"),
  ).toHaveLength(2);
  const select = named<HTMLSelectElement>("career[0].careerCriteriaCodeSn");
  expect(select.getAttribute("data-rel-id")).toBe("career[0]");
  expect(Array.from(select.options, (o) => o.value).slice(1)).toEqual(
    CAREER_LABELS_NINE.map((_, i) => String(900001 + i)),
  );
  expect(Array.from(select.options, (o) => o.textContent).slice(1)).toEqual([
    ...CAREER_LABELS_NINE,
  ]);
  for (const name of [
    "company",
    "department",
    "position",
    "assignedTask",
    "retirementReason",
    "entranceDate",
  ]) {
    const e = named(`career[0].${name}`);
    expect([e.getAttribute("data-rel-target"), e.disabled]).toEqual([
      "career[0]",
      true,
    ]);
  }
  expect(
    all('[name="career[0].workingStatusCode"]').map((r) => r.value),
  ).toEqual(["WORK", "LEAVE"]);
  expect(named("career[0].entranceDate").getAttribute("data-dates")).toBe(
    "career[0].careerDate:YMD forbiddenAfterToday",
  );
  const leaving = named("career[0].leavingDate");
  expect(leaving.getAttribute("data-rel-target")).toBe(
    "career[0].workingStatusCode",
  );
  expect(leaving.getAttribute("data-dates")).toBe(
    "career[0].careerDate:END forbiddenAfterToday",
  );
  expect(all("[name$='.salary']")).toHaveLength(0);
  expect(
    subject.querySelectorAll(
      ":scope > .loop button[type='button'][data-button='add']:not([data-rel-target])",
    ),
  ).toHaveLength(2);
});

it("supports the seven-label tenant, YM dates and the salary column", () => {
  mountCareer(1, {
    labels: "seven",
    codeBase: 900101,
    dateInputFormat: "YM",
    salary: true,
  });
  const select = named<HTMLSelectElement>("career[0].careerCriteriaCodeSn");
  expect(Array.from(select.options, (o) => o.textContent).slice(1)).toEqual([
    ...CAREER_LABELS_SEVEN,
  ]);
  expect(careerOptionCodes({ labels: "seven", codeBase: 900101 })["인턴"]).toBe(
    "900107",
  );
  expect(named("career[0].salary").type).toBe("number");
  expect(named("career[0].entranceDate").getAttribute("data-dates")).toBe(
    "career[0].careerDate:YM forbiddenAfterToday",
  );
});

it("opens a row on employment type and the leaving date only for LEAVE", () => {
  mountCareer(1);
  choose(0, "정규직");
  expect(named("career[0].company").disabled).toBe(false);
  expect(named("career[0].leavingDate").disabled).toBe(true);
  named("career[0].workingStatusCode")
    .parentElement!.parentElement!.querySelector<HTMLInputElement>(
      "[value=LEAVE]",
    )!
    .click();
  expect(named("career[0].leavingDate").disabled).toBe(false);
  named<HTMLInputElement>("career[0].workingStatusCode").click();
  expect(named("career[0].leavingDate").disabled).toBe(true);
});

it("adds gated rows and composes with the education page", () => {
  mountEducation(1, 1, false, { liveGating: true });
  appendCareerSection(1);
  document
    .querySelector<HTMLButtonElement>(
      "[data-loop='career'] [data-button='add']",
    )!
    .click();
  expect(named("career[1].company").disabled).toBe(true);
  choose(1, "계약직");
  expect(named("career[1].company").disabled).toBe(false);
  expect(document.querySelectorAll("section.writeResume")).toHaveLength(3);
});

it("builds a synthetic step 2 profile", () => {
  const profile = step2Profile();
  expect(profile.education.map((e) => e.sectionId)).toEqual([
    "highSchool",
    "university",
    "university",
    "graduateSchool",
  ]);
  expect(profile.careers.map((c) => c.values.employmentStatus)).toEqual([
    "퇴사",
    "재직중",
  ]);
  expect(profile.careers[1].values.terminationReason).toBeUndefined();
});

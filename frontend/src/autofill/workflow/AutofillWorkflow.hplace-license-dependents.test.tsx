/**
 * CF-177 C11 (F7 3): when a license or exam search does not commit, its gated
 * details (issuer, acquisition date, grade or score) are never collected. The
 * result panel still lists them as manual rows with the profile preview and
 * the row-search guidance; the registration number (privacy gate) never gets
 * a row, grade and score share one row, and nothing repeats across passes.
 * Synthetic structure, codes and values only.
 */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  catalogResponder,
  renderNativeWorkflow,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import {
  mountSearch,
  siteSeesEnter,
  widget,
} from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import { createEmptyProfile, type Profile } from "../../profile/model";

afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});

const ROW_SEARCH =
  "같은 행의 검색 항목을 확정하지 못해 입력을 보류했어요. 검색 항목을 목록에서 고른 뒤 이 값을 입력해 주세요.";
const NO_RESULTS = "검색 결과가 없어요. 다른 이름으로 찾아 주세요.";

const searchWidget = (row: string, kind: string, property: string) =>
  `<div class="span"><div class="search"><label><input type="search" data-type="${kind}"></label><div class="searchResult"></div></div><input type="hidden" name="${row}.${property}Name"><span class="searchResultName"></span><input type="text" class="hidden" name="${row}.${property}Code"></div>`;
const licenseRow = `<div class="loop" data-loop="license">${searchWidget("license[0]", "license", "license")}<input type="text" name="license[0].organization" maxlength="64" data-rel-target="license[0]" disabled><div data-privateremove="true"><input type="text" name="license[0].registNumber" maxlength="64" data-rel-target="license[0]" disabled></div><input type="text" name="license[0].acquireDate" data-dates="license[0].licenseDate:YMD" data-rel-target="license[0]" disabled><button type="button" data-button="add"></button></div>`;
const examRow = `<div class="loop" data-loop="languageExam">${searchWidget("languageExam[0]", "foreignExam", "languageExam")}<div data-template="detail"><input type="hidden" name="languageExam[0].languageExamSn"></div><button type="button" data-button="add"></button></div>`;

/** Section 18 with one license row and, optionally, one exam row. */
function mountQualifications(exam: boolean): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = structuredClone(
    seed.executionPolicy,
  ) as unknown as ExecutionPolicy;
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  for (const field of policy.browserPolicy.nativeForm.sections.flatMap(
    (s) => s.fields,
  )) {
    if (field.search) field.search.timeoutMs = 300;
    if (field.driver) field.driver.timeoutMs = 300;
  }
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume"><section class="writeResume" data-code="18">${exam ? `<div class="subject" data-code="165" data-wrap="foreignExam">${examRow}</div>` : ""}<div class="subject" data-code="168" data-wrap="license">${licenseRow}</div></section></div></form>`;
  installExecutionPolicy(document, policy);
  return policy;
}

function qualificationProfile(exam: boolean): Profile {
  const profile = createEmptyProfile();
  profile.certifications = [
    {
      id: "synthetic-license",
      sectionId: "certificate",
      values: {
        name: "합성자격증 없는제목",
        issuer: "가상발급기관",
        registrationNo: "SYN-LIC-0001",
        acquisitionDate: "2022-05-01",
      },
    },
  ];
  if (exam)
    profile.languages = [
      {
        id: "synthetic-exam",
        sectionId: "languageTest",
        values: {
          testName: "합성어학시험 없는제목",
          registrationNo: "SYN-EXAM-0001",
          grade: "가상등급AL",
        },
      },
    ];
  return profile;
}

async function openPending() {
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
}

it("lists the license and exam details withheld by searches without results", async () => {
  const policy = mountQualifications(true);
  const { counters } = renderNativeWorkflow({
    policy,
    profile: qualificationProfile(true),
    searchResponder: catalogResponder(() => [], { accept: siteSeesEnter }),
  });
  await openPending();
  // The searches themselves keep their explicit C8 code.
  expect(screen.getAllByText(NO_RESULTS)).toHaveLength(2);
  // Issuer, acquisition date and one merged grade/score row, each once.
  expect(screen.getAllByText(ROW_SEARCH)).toHaveLength(3);
  expect(screen.getAllByText("가상발급기관")).toHaveLength(1);
  expect(screen.getAllByText("2022-05-01")).toHaveLength(1);
  expect(screen.getAllByText("가상등급AL")).toHaveLength(1);
  // The privacy gate keeps both registration numbers out of the panel.
  expect(document.body.textContent).not.toContain("SYN-LIC-0001");
  expect(document.body.textContent).not.toContain("SYN-EXAM-0001");
  expect(
    screen.queryByText(
      "목록 선택을 확인하지 못했어요. 항목을 직접 골라 주세요.",
    ),
  ).not.toBeInTheDocument();
  for (const name of ["organization", "registNumber", "acquireDate"])
    expect(
      document.querySelector<HTMLInputElement>(`[name="license[0].${name}"]`)!
        .value,
    ).toBe("");
  expect(counters.forbidden).toBe(0);
}, 30000);

it("does not report the details of a saved license whose tuple equals the profile", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  // An ungated (non-row) search section reaches the existing-value exit.
  const policy = mountSearch("license", (section) => {
    section.fields[0].driver.dependencies = [
      "synthetic.license.organization",
      "synthetic.license.acquireDate",
    ];
    section.fields.push(
      ...[
        ["organization", "발급기관", "issuer"],
        ["acquireDate", "취득일", "acquisitionDate"],
      ].map(([field, label, key]) => ({
        name: `synthetic.license.${field}`,
        rawName: `entry.${field}`,
        type: "text",
        label,
        binding: {
          type: "DIRECT",
          profileFieldKey: `certifications.certificate.${key}`,
        },
        gate: { search: "synthetic.search.name", mode: "COMMITTED" },
      })),
    );
  });
  document
    .querySelector("#synthetic-row")!
    .insertAdjacentHTML(
      "beforeend",
      '<input type="text" name="entry.organization" disabled><input type="text" name="entry.acquireDate" disabled>',
    );
  const saved = widget();
  saved.name.value = "합성자격증 없는제목";
  saved.code.value = "900001";
  saved.display.textContent = "합성자격증 없는제목";
  const { counters } = renderNativeWorkflow({
    policy,
    profile: qualificationProfile(false),
    searchResponder: catalogResponder(() => [], { accept: siteSeesEnter }),
  });
  await openPending();
  expect(
    screen.getByText(
      "보이는 값은 프로필과 같지만 사이트가 목록 선택 상태를 보여 주지 않아 확인하지 못했어요. 필요하면 목록에서 다시 골라 주세요.",
    ),
  ).toBeVisible();
  expect(screen.queryAllByText(ROW_SEARCH)).toHaveLength(0);
  expect(
    screen.queryAllByText(
      "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.",
    ),
  ).toHaveLength(0);
  expect(screen.queryByText("가상발급기관")).not.toBeInTheDocument();
  expect(counters.keypresses).toBe(0);
}, 30000);

it("lists the details a committed license search never enabled", async () => {
  const policy = mountQualifications(false);
  const { counters } = renderNativeWorkflow({
    policy,
    profile: qualificationProfile(false),
    searchResponder: catalogResponder(
      (query) => [
        {
          title: query,
          code: "900001",
          data: { usescore: "false", privateinfo: "true" },
        },
      ],
      { accept: siteSeesEnter },
    ),
  });
  await openPending();
  expect(
    document.querySelector<HTMLInputElement>('[name="license[0].licenseName"]')!
      .value,
  ).toBe("합성자격증 없는제목");
  // The commit stays; its never-enabled details are listed once each.
  expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument();
  expect(screen.getAllByText(ROW_SEARCH)).toHaveLength(2);
  expect(screen.getAllByText("가상발급기관")).toHaveLength(1);
  expect(screen.getAllByText("2022-05-01")).toHaveLength(1);
  expect(document.body.textContent).not.toContain("SYN-LIC-0001");
  expect(counters.forbidden).toBe(0);
}, 30000);

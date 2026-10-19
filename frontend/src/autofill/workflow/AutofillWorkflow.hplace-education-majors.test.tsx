/**
 * CF-177 C2 (F6): a partially successful school stage still prepares the
 * additional major rows of its committed schools, and a failed school reports
 * its additional majors as manual rows without clicking add under it.
 * Synthetic DOM, catalog and values only.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { siteSeesEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import type { FieldCandidateHandle } from "../dom/types";
import type { Profile } from "../../profile/model";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
  type SearchResponder,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";

const settle = vi.hoisted(() => ({
  /** Raw school name whose first committed settle check reports false. */
  failOnce: undefined as string | undefined,
}));

vi.mock("../policy/committed-search", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../policy/committed-search")>();
  return {
    ...actual,
    committedSearchMatches: (
      ...args: Parameters<typeof actual.committedSearchMatches>
    ) => {
      const matches = actual.committedSearchMatches(...args);
      if (
        matches &&
        settle.failOnce !== undefined &&
        hiddenName(args[0]) === settle.failOnce
      ) {
        settle.failOnce = undefined;
        return false;
      }
      return matches;
    },
  };
});

function hiddenName(handle: FieldCandidateHandle): string | undefined {
  const element = handle.elements[0];
  return (
    element?.getAttribute("name") ??
    element
      ?.closest("div.span")
      ?.querySelector(':scope > input[type="hidden"][name$="Name"]')
      ?.getAttribute("name") ??
    undefined
  );
}

beforeEach(() => {
  settle.failOnce = undefined;
});

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

function mount(): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(2, 1, false);
  const form = (
    policy.browserPolicy as unknown as { nativeForm: MutableNativeForm }
  ).nativeForm;
  for (const section of form.sections)
    for (const field of section.fields) {
      if (field.search) field.search.timeoutMs = 300;
      if (field.driver)
        field.driver.timeoutMs = Math.min(field.driver.timeoutMs, 300);
    }
  installExecutionPolicy(document, policy);
  return policy;
}

/**
 * Exact-title site catalog; `missing` school queries get the site's
 * no-result box. A committed school opens its major search and, unless
 * `addDisabled`, its nested add button (gs-writeResume school commit).
 */
function responder(
  missing: readonly string[],
  { addDisabled = false }: { addDisabled?: boolean } = {},
): SearchResponder {
  const exact = exactTitleCatalog();
  const base = catalogResponder(
    (query, kind) => (missing.includes(query) ? [] : exact(query, kind)),
    { accept: siteSeesEnter },
  );
  return (query, event) => {
    base(query, event);
    if (query.dataset.type !== "college") return;
    const row = query.closest("[data-loop=college],[data-loop=graduateSchool]");
    for (const button of query
      .closest("div.span")!
      .querySelectorAll<HTMLButtonElement>("button.ellipsis")) {
      const commit = button.onclick;
      button.onclick = (e) => {
        commit?.call(button, e);
        for (const control of row!.querySelectorAll<
          HTMLInputElement | HTMLButtonElement
        >(
          "[data-loop=collegeMajor] input[type=search],[data-loop=collegeMajor] button[data-button=add]",
        ))
          control.disabled =
            control instanceof HTMLButtonElement && addDisabled;
      };
    }
  };
}

const named = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`);
const majorRows = (index: number) =>
  document.querySelectorAll(
    `[data-loop=college][data-index="${index}"] [data-loop=collegeMajor]`,
  );

async function pendingPanel() {
  await screen.findByText("기입 결과", {}, { timeout: 20000 });
  fireEvent.click(screen.getByRole("tab", { name: /확인 필요/ }));
  return screen.getByRole("tabpanel");
}

async function expectCollegeMajorsPrepared() {
  await screen.findByText("기입 결과", {}, { timeout: 20000 });
  expect(majorRows(0)).toHaveLength(3);
  expect(named("college[0].collegeMajor[2].majorName")?.value).toBe(
    "가상부전공",
  );
  expect(named("college[0].collegeMajor[1].majorName")?.value).toBe(
    "가상복수전공",
  );
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="college[0].collegeMajor[2].majorTypeCode"]:checked',
    )?.value,
  ).toBe("03");
}

it("prepares the committed school's majors when another school in the stage fails", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: responder(["합성대학 B"]),
  });

  await expectCollegeMajorsPrepared();
  const panel = await pendingPanel();
  expect(
    within(panel).getAllByText("합성대학 B", { selector: "span" }).length,
  ).toBeGreaterThan(0);
  expect(counters.forbidden).toBe(0);
  expect(counters.requests).toBeLessThanOrEqual(8);
}, 40000);

it("prepares the college majors when only the graduate school fails", async () => {
  const policy = mount();
  renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: responder(["합성대학원"]),
  });

  await expectCollegeMajorsPrepared();
}, 40000);

it("prepares majors when every school was written but one settle check failed", async () => {
  const policy = mount();
  settle.failOnce = "graduateSchool[0].academyName";
  renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: responder([]),
  });

  await expectCollegeMajorsPrepared();
  expect(settle.failOnce).toBeUndefined();
}, 40000);

it("lists the prepared school's majors when its nested add stays disabled in a mixed stage", async () => {
  const policy = mount();
  const { counters } = renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: responder(["합성대학 B"], { addDisabled: true }),
  });

  const panel = await pendingPanel();
  expect(
    within(panel).queryAllByText("입력 불가(학교 확정 후 다시 실행)"),
  ).toHaveLength(2);
  expect(majorRows(0)).toHaveLength(1);
  expect(counters.adds).toBe(0);
}, 40000);

it("reports a failed school's additional major as a manual row without adding under it", async () => {
  const policy = mount();
  const profile: Profile = educationProfile();
  profile.education[1].values.doubleMajorStatus = "있음";
  profile.education[1].values.additionalMajorName = "가상복수전공 B";
  let failedSchoolAdds = 0;
  document.querySelector("#frm")!.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.matches("[data-button=add]") &&
        target.closest('[data-loop=college][data-index="1"]')
      )
        failedSchoolAdds++;
    },
    true,
  );
  renderNativeWorkflow({
    policy,
    profile,
    searchResponder: responder(["합성대학 B"]),
  });

  await expectCollegeMajorsPrepared();
  const panel = await pendingPanel();
  // Other rows may preview every saved entry; the failed school's own major
  // row carries the row-search guidance.
  const rows = within(panel)
    .getAllByText("가상복수전공 B", { selector: "span" })
    .map((value) => value.closest("article")!.textContent ?? "");
  expect(
    rows.filter((text) =>
      text.includes("같은 행의 검색 항목을 확정하지 못해 입력을 보류했어요."),
    ),
  ).toHaveLength(1);
  expect(
    within(panel).queryAllByText("입력 불가(학교 확정 후 다시 실행)"),
  ).toHaveLength(0);
  expect(failedSchoolAdds).toBe(0);
  expect(majorRows(1)).toHaveLength(1);
}, 40000);

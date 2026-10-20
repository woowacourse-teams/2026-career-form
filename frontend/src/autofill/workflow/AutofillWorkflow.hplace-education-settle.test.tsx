/**
 * CF-177 C3 (F2): an education stage-1 driver (degree) lists the school search
 * as a dependency. Its hidden `academyName` input never becomes visible, so the
 * driver must settle on the search query instead. Otherwise every row's dates,
 * location and admission/graduation types stay deferred behind a correctly
 * checked degree radio. Synthetic values only.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
  type SearchResponder,
} from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { siteSeesEnter } from "../policy/__fixtures__/hplace-mrs2-search.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

const value = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;

/** Exact-title site search that, like the existing education test, opens majors after a commit. */
function educationResponder(enabled: boolean): SearchResponder {
  const respond = catalogResponder(exactTitleCatalog(), {
    accept: siteSeesEnter,
  });
  return (query, event) => {
    respond(query, event);
    const widget = query.closest("div.span")!;
    widget
      .querySelector(".searchResultList button")
      ?.addEventListener("click", () => {
        if (query.dataset.type === "college")
          for (const e of widget
            .closest("[data-loop=college],[data-loop=graduateSchool]")!
            .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
              "[data-loop=collegeMajor] input[type=search],[data-loop=collegeMajor] button[data-button=add]",
            ))
            e.disabled = e instanceof HTMLButtonElement && !enabled;
        for (const e of widget
          .closest("[data-loop=collegeMajor]")
          ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            "input[type=radio],select",
          ) ?? [])
          e.disabled = false;
      });
  };
}

// The two ends of the parent/enabled/initial matrix; the middle combinations
// only repeat these paths and cost a full workflow run each (CF-304).
it.each([
  { count: 2, enabled: true, initialMajorEnabled: false },
  { count: 1, enabled: false, initialMajorEnabled: true },
])(
  "writes row dates once the degree driver settles on the school query (parents=$count, enabled=$enabled, initial=$initialMajorEnabled)",
  async ({ count, enabled, initialMajorEnabled }) => {
    setHplacePage(
      "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
    );
    const policy = mountEducation(count, 1, initialMajorEnabled);
    if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
    for (const f of policy.browserPolicy.nativeForm.sections.flatMap(
      (s) => s.fields,
    ))
      if (f.driver) f.driver.timeoutMs = 300;
    installExecutionPolicy(document, policy);
    for (const e of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >(
      "[data-loop=collegeMajor] input[type=radio],[data-loop=collegeMajor] select",
    ))
      e.disabled = true;
    const { counters } = renderNativeWorkflow({
      policy,
      profile: educationProfile(),
      searchResponder: educationResponder(enabled),
    });
    await screen.findByText("기입 결과", {}, { timeout: 120_000 });
    await waitFor(() =>
      expect(value("graduateSchool[0].academyName")).toBe("합성대학원"),
    );
    expect(value("college[0].entranceDate")).toBe("2020.03");
    expect(value("college[1].entranceDate")).toBe("2021.03");
    expect(value("graduateSchool[0].entranceDate")).toBe("2023.03");
    const review = screen.queryByRole("tab", { name: /확인 필요/ });
    if (review) fireEvent.click(review);
    expect(
      screen.queryAllByText(
        "목록 선택을 확인하지 못했어요. 항목을 직접 골라 주세요.",
      ),
    ).toHaveLength(0);
    expect(
      screen.queryAllByText(/같은 행의 검색 항목을 확정하지 못해/),
    ).toHaveLength(0);
    expect(counters.forbidden).toBe(0);
    expect(counters.requests).toBeLessThanOrEqual(8);
  },
  120_000,
);

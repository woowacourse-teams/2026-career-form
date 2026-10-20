import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  catalogResponder,
  exactTitleCatalog,
  renderNativeWorkflow,
} from "./hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./hplace.fixture";
import { installExecutionPolicy } from "../execution-policy";
import {
  educationProfile,
  mountEducation,
} from "../../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "../../policy/__fixtures__/hplace-mrs2-linked-form";

afterEach(() => {
  cleanup();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

const named = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const query = () =>
  document.querySelector<HTMLInputElement>(
    '[data-loop="college"] input[type=search][data-type="college"]',
  )!;
const enter = (key = "Enter") =>
  new KeyboardEvent("keypress", { key, bubbles: true });

it("answers like the site: exact results, commit tuple and code focus", () => {
  mountEducation(1);
  const respond = catalogResponder(exactTitleCatalog());
  query().value = "합성대학 A";
  respond(query(), enter("a"));
  expect(document.querySelector(".searchResultList")).toBeNull();
  respond(query(), enter());
  const button = document.querySelector<HTMLButtonElement>(
    ".searchResultList > li > button.ellipsis[data-code][title]",
  )!;
  expect([button.title, button.dataset.code]).toEqual(["합성대학 A", "900001"]);
  button.click();
  const code = named("college[0].academyCode");
  expect(named("college[0].academyName").value).toBe("합성대학 A");
  expect(code.value).toBe("900001");
  expect(document.activeElement).toBe(code);
  expect(
    query()
      .closest("div.span")!
      .querySelector("span.searchResultName")!
      .textContent!.trim(),
  ).toBe("합성대학 A");
});

it("models no-result and no-response sites", () => {
  mountEducation(1);
  const results = query().closest("div.span")!.querySelector(".searchResult")!;
  catalogResponder(() => undefined)(query(), enter());
  expect(results.innerHTML).toBe("");
  catalogResponder(() => [])(query(), enter());
  expect(results.querySelector(".noResult")).not.toBeNull();
});

it("renders the native workflow and counts requests and site actions", async () => {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(1, 1, true);
  const { counters, requests } = renderNativeWorkflow({
    policy,
    profile: educationProfile(),
    searchResponder: catalogResponder(exactTitleCatalog()),
  });
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  await waitFor(() =>
    expect(named("college[0].academyName").value).toBe("합성대학 A"),
  );
  expect(counters.requests).toBeGreaterThan(0);
  expect(counters.requests).toBeLessThanOrEqual(8);
  expect(counters.preparations).toBeGreaterThan(0);
  expect(counters.keypresses).toBeGreaterThan(0);
  expect(counters.parentAdds).toBe(1);
  expect(counters.forbidden).toBe(0);
}, 30000);

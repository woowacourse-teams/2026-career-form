import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
import { mountLive } from "./hplace-run2.test-fixtures";
import {
  liveApplicant,
  liveAddress,
} from "./test-utils/hplace-run2.live-derived";
import { collectFieldsSnapshot } from "../dom/collect";
import { createEmptyProfile } from "../../profile/model";
import { basicAnalysis } from "../adapters/hplace/basic.test-fixtures";
const fields = () =>
  collectFieldsSnapshot(document).request.sections.flatMap((s) => s.fields);
it.each([false, true])(
  "collects live gender with the wrapping option label (date initialized=%s)",
  (initialized) => {
    mountLive(initialized);
    expect(
      document.querySelector<HTMLInputElement>('[name="genderFlag"]')!
        .labels![0].textContent,
    ).toBe("성별");
    expect(
      fields().find((f) => f.domName === "hplace.detail.gender")?.options,
    ).toEqual([
      { optionId: "M", displayName: "남" },
      { optionId: "F", displayName: "여" },
    ]);
  },
);

it.each(["남성", "여성"])(
  "writes and reads back live gender %s despite the preceding title label",
  async (gender) => {
    mountLive();
    const p = createEmptyProfile();
    p.personal.gender = gender;
    const snapshot = collectFieldsSnapshot(document);
    const { buildReviewPlan } = await import("../review/review-plan");
    const item = buildReviewPlan({
      registry: snapshot.registry,
      profile: p,
      analysis: basicAnalysis(snapshot.request),
    }).items.find((i) => i.fieldLabel === "성별")!;
    const lookup = snapshot.registry.lookupField(item.candidateId);
    if (lookup.status !== "ready") throw Error("live gender missing");
    item.selected = true;
    const { writeBasic, basicValue } =
      await import("../adapters/hplace/basic-write");
    expect(await writeBasic(lookup.handle, item, () => true)).toBe(true);
    expect(basicValue(lookup.handle)).toBe(gender === "남성" ? "남" : "여");
  },
);

it.each(["wrapper-for", "wrong-option", "multiple-inputs"])(
  "rejects live gender when option ownership changes: %s",
  (fault) => {
    mountLive();
    const input = document.querySelector<HTMLInputElement>(
      '[name="genderFlag"]',
    )!;
    const wrapper = input.closest("label")!;
    if (fault === "wrapper-for") wrapper.htmlFor = "birthday";
    if (fault === "wrong-option")
      wrapper.querySelector("span")!.textContent = "여";
    if (fault === "multiple-inputs") wrapper.append(input.cloneNode(true));
    expect(fields().some((f) => f.domName === "hplace.detail.gender")).toBe(
      false,
    );
  },
);

it.each([
  "patriot.patriotYn",
  "handicap.handicapYn",
  "military.militaryTypeCode",
])("collects legacy %s with an additional row-title label", async (name) => {
  const { mountRun1 } = await import("./hplace-run1.test-fixtures");
  mountRun1();
  document.querySelector('[data-code="11"]')!.innerHTML = liveApplicant;
  document.querySelector('[data-row="address"]')!.outerHTML = liveAddress;
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  input.id = "live-driver";
  input
    .closest(".subject")!
    .insertAdjacentHTML(
      "afterbegin",
      '<label for="live-driver">항목 제목</label>',
    );
  expect(input.labels![0].textContent).toBe("항목 제목");
  const expected = name.startsWith("military")
    ? "militaryStatus"
    : name.startsWith("patriot")
      ? "veteranStatus"
      : "disabilityStatus";
  expect(fields().some((f) => f.domName === `hplace.detail.${expected}`)).toBe(
    true,
  );
});

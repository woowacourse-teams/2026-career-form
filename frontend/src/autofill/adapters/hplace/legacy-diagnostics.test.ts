/** CF-177 C6: Hplace legacy anchor diagnostics on the MRS2 writeResume page
 * with the native policy installed (the legacy adapters run first). Only an
 * absent detail section (11 or 13, e.g. on steps 2/3) is reported as a missing
 * section; every other reject keeps its ownership reason. Synthetic DOM only. */
import { afterEach, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../../dom/collect";
import { setAutofillDebugEnabled } from "../../debug/autofill-debug";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { expectHarnessLine } from "../../workflow/test-utils/harness-diagnostic-line";
import { mountDetail } from "./detail.test-fixtures";
import { mountHplaceRegistration } from "./registration.test-fixtures";
import seed from "../../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../workflow/execution-policy";

afterEach(() => {
  setAutofillDebugEnabled(false);
  installExecutionPolicy(document);
  resetHplacePage();
  vi.restoreAllMocks();
});

function withPolicy(mount: () => void) {
  mount();
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as unknown as ExecutionPolicy,
  );
}
function skips() {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  collectFieldsSnapshot(document);
  const all = log.mock.calls.map(([line]) => line as string);
  for (const line of all) expectHarnessLine(line, ["영문이름", "생년월일"]);
  return all.filter((line) => line.startsWith("[CareerForm] skip"));
}
const detail = (lines: string[]) =>
  lines.filter((line) => line.includes("key=hplace-detail-basic "));
const section = (code: string) =>
  document.querySelector(`section.writeResume[data-code="${code}"]`)!;

it.each(["11", "13"])(
  "reports an absent detail section %s as a missing section",
  (code) => {
    withPolicy(mountDetail);
    section(code).remove();
    expect(detail(skips())).toEqual([
      "[CareerForm] skip stage=collect key=hplace-detail-basic reason=section-missing detail=legacy-detail-section",
    ]);
  },
);

it("keeps a duplicated detail section an owner mismatch", () => {
  withPolicy(mountDetail);
  section("11").insertAdjacentHTML("afterend", section("11").outerHTML);
  expect(detail(skips())).toEqual([
    "[CareerForm] skip stage=collect key=hplace-detail-basic reason=owner-mismatch detail=legacy-detail-anchors",
  ]);
});

it("keeps other detail anchor rejects an owner mismatch", () => {
  withPolicy(mountDetail);
  document
    .querySelector<HTMLInputElement>('[name="englishName"]')!
    .setAttribute("maxlength", "32");
  expect(detail(skips())).toEqual([
    "[CareerForm] skip stage=collect key=hplace-detail-basic reason=owner-mismatch detail=legacy-detail-anchors",
  ]);
});

it("reports a step page without detail sections as a missing section", () => {
  withPolicy(mountDetail);
  section("11").remove();
  section("13").remove();
  expect(detail(skips())).toEqual([
    "[CareerForm] skip stage=collect key=hplace-detail-basic reason=section-missing detail=legacy-detail-section",
  ]);
});

it("keeps the detail pathname reject unchanged on the registration page", () => {
  withPolicy(mountHplaceRegistration);
  expect(detail(skips())).toEqual([
    "[CareerForm] skip stage=collect key=hplace-detail-basic reason=owner-mismatch detail=legacy-detail-anchors",
  ]);
});

it("keeps the registration pathname reject unchanged on a step page", () => {
  withPolicy(mountDetail);
  section("11").remove();
  section("13").remove();
  expect(
    skips().filter((line) => line.includes("key=hplace-registration ")),
  ).toEqual([
    "[CareerForm] skip stage=collect key=hplace-registration reason=owner-mismatch detail=legacy-registration-anchors",
  ]);
});

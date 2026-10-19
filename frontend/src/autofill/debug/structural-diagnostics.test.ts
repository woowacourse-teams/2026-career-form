import { afterEach, expect, it, vi } from "vitest";
import { mountLive } from "../workflow/hplace-run2.test-fixtures";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { resetHplacePage } from "../workflow/test-utils/hplace.fixture";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { setAutofillDebugEnabled } from "./autofill-debug";
afterEach(() => {
  setAutofillDebugEnabled(false);
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
const capture = () => vi.spyOn(console, "info").mockImplementation(() => {});
it("keeps collection unchanged and emits nothing with debug off", () => {
  mountLive();
  setAutofillDebugEnabled(false);
  const log = capture();
  const first = collectFieldsSnapshot(document).request.sections;
  const second = collectFieldsSnapshot(document).request.sections;
  expect(second).toEqual(first);
  expect(log).not.toHaveBeenCalled();
});
it.each([
  ["label", "hplace.detail.gender", "label-mismatch"],
  ["guide", "hplace.detail.englishName", "guide-missing"],
  ["zip", "hplace.mrs2.currentAddress.search", "zip-companion"],
  ["asset", "hplace-mrs2", "asset-path"],
] as const)(
  "explains a rejected %s as one plain structural string",
  (kind, id, reason) => {
    mountLive();
    setAutofillDebugEnabled(true);
    const log = capture();
    if (kind === "label")
      document
        .querySelector('[name="genderFlag"]')!
        .closest("label")!
        .querySelector("span")!.textContent = "잘못된 라벨";
    if (kind === "guide") document.querySelector(".wrapGuide")!.remove();
    if (kind === "zip")
      document.querySelector('[name="currentAddress.zipCode"]')!.className =
        "text";
    if (kind === "asset")
      document.querySelector<HTMLScriptElement>("script")!.src =
        "https://foreign.example/mrs2/release/js/applicant/writeResume/writeResume.js";
    collectFieldsSnapshot(document);
    collectPreparationSnapshot(document);
    expect(
      log.mock.calls.some(
        (args) =>
          args.length === 1 &&
          typeof args[0] === "string" &&
          args[0].startsWith(
            `[CareerForm] skip stage=collect key=${id} reason=${reason} detail=`,
          ),
      ),
    ).toBe(true);
  },
);
it("prints counts without profile, page values or session/query data", () => {
  mountLive();
  setAutofillDebugEnabled(true);
  const log = capture();
  document.querySelector<HTMLInputElement>('[name="englishName"]')!.value =
    "CANARY_CURRENT";
  document.querySelector<HTMLInputElement>(
    '[name="currentAddress.detailAddress"]',
  )!.value = "CANARY_PROFILE";
  document.body.dataset.session = "CANARY_SESSION";
  document.querySelector<HTMLScriptElement>("script")!.src +=
    "&session=CANARY_QUERY";
  collectFieldsSnapshot(document);
  collectPreparationSnapshot(document);
  expect(
    log.mock.calls.some(([line]) =>
      /^\[CareerForm\] stage name=fields collected=\d+ accepted=\d+ rejected=\d+ planned=0 executed=0$/.test(
        line,
      ),
    ),
  ).toBe(true);
  expect(
    log.mock.calls.some(([line]) =>
      /^\[CareerForm\] stage name=preparation collected=\d+ accepted=\d+ rejected=\d+ planned=0 executed=0$/.test(
        line,
      ),
    ),
  ).toBe(true);
  for (const args of log.mock.calls) {
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe("string");
    expect(args[0]).not.toMatch(/CANARY_|https?:|session=|Gildong|Hong/);
  }
});
it("logs the immutable installed build once per run, behind the same flag", async () => {
  const path = "./structural-diagnostics";
  const { debugRunBuild } = await import(/* @vite-ignore */ path);
  const read = vi.fn(async () => ({
    schema_version: "1.0",
    revision: "a".repeat(40),
    source_state: "CLEAN",
  }));
  const log = capture();
  setAutofillDebugEnabled(false);
  await debugRunBuild(read);
  expect(read).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  setAutofillDebugEnabled(true);
  await debugRunBuild(read);
  await debugRunBuild(read);
  expect(log.mock.calls).toEqual([
    [`[CareerForm] build revision=${"a".repeat(40)} source_state=CLEAN`],
    [`[CareerForm] build revision=${"a".repeat(40)} source_state=CLEAN`],
  ]);
});
it("explains legacy linked-control timeout as a plain stable code", async () => {
  const { mountRun1, profile, input } =
    await import("../workflow/hplace-run1.test-fixtures");
  const { basicAnalysis } =
    await import("../adapters/hplace/basic.test-fixtures");
  const { buildReviewPlan } = await import("../review/review-plan");
  const { settleBasicStateDriver } =
    await import("../adapters/hplace/basic-write");
  mountRun1();
  document.querySelector<HTMLInputElement>(
    '[name="military.militaryTypeCode"][value="01"]',
  )!.checked = true;
  input("military.militaryPositionCode").disabled = true;
  const s = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: s.registry,
    profile: profile(),
    analysis: basicAnalysis(s.request),
  }).items.find((i) => i.fieldLabel === "병역사항")!;
  item.selected = true;
  const lookup = s.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw Error("driver missing");
  setAutofillDebugEnabled(true);
  const log = capture();
  expect(await settleBasicStateDriver(lookup.handle, undefined, item)).toBe(
    false,
  );
  expect(log).toHaveBeenCalledWith(
    "[CareerForm] skip stage=write key=hplace.detail.militaryStatus reason=disabled-timeout detail=legacy-linked-controls",
  );
});
it("records real preparation execution counts without page data", async () => {
  const { executeApprovedPreparationPlans } =
    await import("../preparation/executor");
  mountLive();
  setAutofillDebugEnabled(true);
  const log = capture();
  const snapshot = collectPreparationSnapshot(document);
  await executeApprovedPreparationPlans({
    approvedPlans: [],
    initialSnapshot: snapshot,
  } as unknown as Parameters<typeof executeApprovedPreparationPlans>[0]);
  expect(log).toHaveBeenCalledWith(
    "[CareerForm] stage name=preparation collected=0 accepted=0 rejected=0 planned=0 executed=0",
  );
});
it("never echoes review profile/current values or malformed build data", async () => {
  const { debugReviewDecisions, debugRunBuild } =
    await import("./structural-diagnostics");
  mountLive();
  const s = collectFieldsSnapshot(document);
  const candidate = s.request.sections
    .flatMap((s) => s.fields)
    .find((f) => f.domName === "hplace.detail.gender")!;
  const log = capture();
  setAutofillDebugEnabled(true);
  debugReviewDecisions(
    {
      status: "partial",
      items: [
        {
          candidateId: candidate.candidateId,
          fieldLabel: "CANARY_LABEL",
          profileValue: "CANARY_PROFILE",
          currentValue: "CANARY_CURRENT",
          previewValue: "CANARY_PREVIEW",
          status: "conflict",
          selected: false,
          disabled: true,
          revealed: true,
          reason: "CANARY_REASON",
        },
      ],
    },
    s.registry,
  );
  await debugRunBuild(async () => ({
    revision: "CANARY_REVISION",
    source_state: "CANARY_SESSION",
  }));
  expect(log).toHaveBeenCalledWith(
    "[CareerForm] skip stage=result key=hplace.detail.gender reason=existing-value detail=review-decision",
  );
  expect(log).toHaveBeenCalledWith(
    "[CareerForm] skip stage=prepare key=extension-build reason=build-unavailable detail=installed-snapshot",
  );
  expect(log.mock.calls.flat().join(" ")).not.toContain("CANARY_");
});

import { afterEach, describe, expect, it } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";
import {
  educationItem,
  educationProfile,
  highschoolEntry,
  mountEducation,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";
import type { ExecutionPolicy } from "../workflow/execution-policy";
import type { FieldCandidateHandle } from "../dom/types";
import { buildReviewPlan, type ReviewPlanItem } from "../review/review-plan";
import { collectFieldsSnapshot } from "../dom/collect";
import { nativeOwnership } from "./native-form-collection";
import type { FieldsAnalyzeResponse } from "../api/types";
afterEach(() => installExecutionPolicy(document));
describe("nativeForm drivers", () => {
  it.each([50, 200])(
    "settles a select after %sms and re-reads replaced dependent nodes",
    async (delay) => {
      mountSyntheticNative();
      installExecutionPolicy(document, syntheticNativePolicy());
      const company = document.querySelector<HTMLInputElement>(
        '[name="career[0].company"]',
      )!;
      company.disabled = true;
      const { handle, item } = nativeTestItem(
        "careerCriteriaCodeSn",
        "정규직",
        "SELECT_OPTION",
      );
      handle.elements[0].addEventListener("change", () =>
        setTimeout(() => {
          const replacement = company.cloneNode(true) as HTMLInputElement;
          replacement.disabled = false;
          company.replaceWith(replacement);
        }, delay),
      );
      const adapter = getWorkflowAdapter(document);
      expect(adapter.stateDriverStage?.(item, handle)).toBe(1);
      expect(
        await adapter.executeStateDriver?.(
          document,
          handle,
          item,
          new AbortController().signal,
        ),
      ).toBe(true);
      expect(
        await adapter.settleStateDriver?.(document, handle, undefined, {
          item,
          signal: new AbortController().signal,
        }),
      ).toBe(true);
    },
  );
  it("checks current profile authorization before writing", async () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem(
      "careerCriteriaCodeSn",
      "정규직",
      "SELECT_OPTION",
    );
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
        undefined,
        async () => false,
      ),
    ).toBe(false);
    expect(handle.elements[0].value).toBe("");
  });
});

it("skips an absent optional dependency but does not accept removal of an existing one", async () => {
  mountSyntheticNative();
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const driver = policy.browserPolicy.nativeForm.sections[1].fields[0].driver!;
  driver.dependencies.push("hplace.mrs2.career.entranceDate");
  driver.settled.push({
    field: "hplace.mrs2.career.entranceDate",
    state: "enabled",
  });
  document.querySelector('[name="career[0].entranceDate"]')!.remove();
  installExecutionPolicy(document, policy);
  const { handle, item } = nativeTestItem(
    "careerCriteriaCodeSn",
    "정규직",
    "SELECT_OPTION",
  );
  const adapter = getWorkflowAdapter(document),
    signal = new AbortController().signal;
  expect(
    await adapter.executeStateDriver?.(document, handle, item, signal),
  ).toBe(true);
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
    }),
  ).toBe(true);
  document.querySelector('[name="career[0].company"]')!.remove();
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
    }),
  ).toBe(false);
});

it("rejects a profile change while the driver settles", async () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  const company = document.querySelector<HTMLInputElement>(
    '[name="career[0].company"]',
  )!;
  company.disabled = true;
  const { handle, item } = nativeTestItem(
    "careerCriteriaCodeSn",
    "정규직",
    "SELECT_OPTION",
  );
  const adapter = getWorkflowAdapter(document),
    signal = new AbortController().signal;
  let current = true;
  handle.elements[0].addEventListener("change", () =>
    setTimeout(() => {
      current = false;
      company.disabled = false;
    }, 50),
  );
  expect(
    await adapter.executeStateDriver?.(
      document,
      handle,
      item,
      signal,
      undefined,
      async () => current,
    ),
  ).toBe(true);
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
      beforeMutation: async () => current,
    }),
  ).toBe(false);
});

describe("education stage-1 drivers resolve a search dependency to its query (CF-177 C3)", () => {
  afterEach(() => disposeLinkedForms());
  const signal = () => new AbortController().signal;
  const shortDrivers = (policy: ExecutionPolicy) => {
    if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
    for (const f of policy.browserPolicy.nativeForm.sections.flatMap(
      (s) => s.fields,
    ))
      if (f.driver) f.driver.timeoutMs = 300;
    installExecutionPolicy(document, policy);
  };
  const query = (scope: string) =>
    document.querySelector<HTMLInputElement>(
      `${scope} input[type=search][data-type]`,
    )!;
  // educationReview analyses repeating rows only; section 140 is a flat section.
  const highschoolItem = () => {
    const profile = educationProfile();
    profile.education.unshift(highschoolEntry());
    const snapshot = collectFieldsSnapshot(document);
    const field = snapshot.request.sections
      .find((s) => s.sectionId === "hplace-mrs2-highschool")
      ?.fields.find(
        (f) => f.domName === "hplace.mrs2.highschool.graduationTypeCode",
      );
    if (!field) throw new Error("missing highschool graduationTypeCode");
    const l = snapshot.registry.lookupField(field.candidateId);
    if (!("handle" in l)) throw new Error();
    const analysis: FieldsAnalyzeResponse = {
      snapshotId: snapshot.request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: field.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: nativeOwnership(l.handle)!.field.binding,
          writePlan: { command: "CHECK_RADIO" },
        },
      ],
    };
    const review = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis,
    });
    return { handle: l.handle, item: review.items[0] };
  };
  const drive = async (handle: FieldCandidateHandle, item: ReviewPlanItem) => {
    const adapter = getWorkflowAdapter(document);
    expect(
      await adapter.executeStateDriver?.(document, handle, item, signal()),
    ).toBe(true);
    return adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal: signal(),
    });
  };

  it.each([false, true])(
    "settles the degree driver although the hidden academyName never becomes visible (liveGating=%s)",
    async (liveGating) => {
      shortDrivers(mountEducation(1, 1, false, { liveGating }));
      const { handle, item } = educationItem("degreeTypeCode");
      await expect(drive(handle, item)).resolves.toBe(true);
      expect(query("[data-loop=college]").disabled).toBe(false);
    },
  );

  it("settles the high-school graduation driver once the site enables the query", async () => {
    shortDrivers(mountEducation(1, 1, false, { highschool: {} }));
    expect(query("[data-code='140']").disabled).toBe(true);
    const { handle, item } = highschoolItem();
    await expect(drive(handle, item)).resolves.toBe(true);
    expect(query("[data-code='140']").disabled).toBe(false);
  });

  it("does not settle while the school query stays disabled even if the dates open", async () => {
    shortDrivers(mountEducation(1, 1, false, { highschool: {} }));
    query("[data-code='140']").removeAttribute("data-rel-target");
    const { handle, item } = highschoolItem();
    await expect(drive(handle, item)).resolves.toBe(false);
    expect(
      document.querySelector<HTMLInputElement>(
        '[name="highschool.entranceDate"]',
      )!.disabled,
    ).toBe(false);
  });

  it("does not settle while the search tuple code input stays disabled", async () => {
    shortDrivers(mountEducation(1, 1, false, { liveGating: true }));
    document
      .querySelector('[name="college[0].academyCode"]')!
      .removeAttribute("data-rel-target");
    const { handle, item } = educationItem("degreeTypeCode");
    await expect(drive(handle, item)).resolves.toBe(false);
    expect(query("[data-loop=college]").disabled).toBe(false);
  });

  it.each(["missing", "duplicate"])(
    "fails closed without throwing when the search widget is unrecognised (%s query)",
    async (shape) => {
      shortDrivers(mountEducation(1));
      const { handle, item } = educationItem("degreeTypeCode");
      const adapter = getWorkflowAdapter(document);
      expect(
        await adapter.executeStateDriver?.(document, handle, item, signal()),
      ).toBe(true);
      const q = query("[data-loop=college]");
      if (shape === "missing") q.remove();
      else q.after(q.cloneNode(true));
      await expect(
        adapter.settleStateDriver?.(document, handle, undefined, {
          item,
          signal: signal(),
        }),
      ).resolves.toBe(false);
    },
  );

  it("defers the school search with the other dependents when the degree driver fails", () => {
    shortDrivers(mountEducation(1));
    const { handle, item } = educationItem("degreeTypeCode");
    const targets =
      getWorkflowAdapter(document).stateDriverFailureTargets?.(item, handle) ??
      [];
    expect(targets).toContain(query("[data-loop=college]"));
    expect(targets).toContain(
      document.querySelector('[name="college[0].entranceDate"]'),
    );
  });
});

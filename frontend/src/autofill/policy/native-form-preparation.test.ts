import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPreparationSnapshot } from "../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  nativeCareerRow,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { mountEducation } from "./__fixtures__/hplace-mrs2-education.synthetic";
import { mountCareer } from "./__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
afterEach(() => installExecutionPolicy(document));
function collect() {
  const c = collectPreparationSnapshot(document);
  return {
    registry: c.registry,
    isTargetSectionVisible: c.isSectionVisible,
    countRepeatableGroups: (p) => c.countRepeatableGroups(p.actionCandidateId),
    repeatableGroupState: (p) => c.repeatableGroupState(p.actionCandidateId),
  } satisfies PreparationSnapshot;
}
it.each([1])("adds exactly one owned row from %s", async (count) => {
  mountSyntheticNative(count);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    if (count === 0) root.querySelector("button")!.remove();
    root.insertAdjacentHTML("beforeend", nativeCareerRow(count));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: count + 1,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({ status: "completed", executedPlanCount: 1 });
});
it.each([0, 2])("rejects a row delta of %s", async (delta) => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    for (let i = 0; i < delta; i++)
      root.insertAdjacentHTML("beforeend", nativeCareerRow(i + 1));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({
    status: "failed",
    reason: "group-count-not-incremented",
  });
});
it("rejects an existing row edit made by an add handler", async () => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    (
      root.querySelector('[name="career[0].company"]') as HTMLInputElement
    ).value = "unexpected";
    root.insertAdjacentHTML("beforeend", nativeCareerRow(1));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({
    status: "failed",
    reason: "existing-group-value-changed",
  });
});
it("never collects a disabled add, existYn or submit control", () => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  document.querySelector<HTMLButtonElement>('[data-button="add"]')!.disabled =
    true;
  document
    .querySelector(".subject")!
    .insertAdjacentHTML(
      "beforeend",
      '<label><input type="radio" name="career.existYn" value="false">없음</label><button type="submit" data-button="add">다음</button>',
    );
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toEqual([]);
});

it("never offers native ADD when an existing section has no collected rows", () => {
  mountSyntheticNative(0);
  installExecutionPolicy(document, syntheticNativePolicy());
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toEqual([]);
});

/** CF-177 C6: neutral preparation diagnostics (live-eval harness grammar). */
describe("preparation diagnostics", () => {
  afterEach(() => {
    setAutofillDebugEnabled(false);
    disposeLinkedForms();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });
  const lines = () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    return () => {
      const all = log.mock.calls.map(([line]) => line as string);
      for (const line of all) expectHarnessLine(line, ["합성", "전공 추가"]);
      return all.filter((line) => line.startsWith("[CareerForm] skip"));
    };
  };
  const nestedAdds = () =>
    document.querySelectorAll<HTMLButtonElement>(
      '[data-loop="college"] [data-wrap="major"] button[data-button="add"]',
    );
  it("reports a single owned but disabled major add as disabled", () => {
    mountEducation(1, 1, false);
    expect(nestedAdds()).toHaveLength(1);
    expect(nestedAdds()[0].disabled).toBe(true);
    const read = lines();
    const actions = collectPreparationSnapshot(document)
      .request.sections.flatMap((s) => s.items ?? [])
      .flatMap((i) => i.actionCandidates);
    expect(actions).toEqual([]);
    const skips = read();
    expect(skips.join("\n")).toContain(
      "[CareerForm] skip stage=prepare key=hplace-mrs2-college reason=disabled detail=nested-add-disabled",
    );
    expect(skips.join("\n")).not.toContain("nested-add-button-count");
  });
  it("keeps two owned major adds an owner mismatch", () => {
    mountEducation(1, 1, true);
    const add = nestedAdds()[0];
    add.insertAdjacentHTML("afterend", add.outerHTML);
    const read = lines();
    collectPreparationSnapshot(document);
    const skips = read();
    expect(skips).toContain(
      "[CareerForm] skip stage=prepare key=hplace-mrs2-college reason=owner-mismatch detail=nested-add-button-count",
    );
    expect(skips.join("\n")).not.toContain("nested-add-disabled");
  });
  it("reports a disabled section before its zero rows", () => {
    const policy = mountCareer(1);
    if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
    // Any disabled section; the seed project section is enabled since C13.
    const project = policy.browserPolicy.nativeForm.sections.find(
      (section) => section.id === "hplace-mrs2-project",
    )!;
    project.enabled = false;
    project.reason = "테스트용 비활성";
    installExecutionPolicy(document, policy);
    document
      .querySelector('section[data-code="16"]')!
      .insertAdjacentHTML(
        "beforeend",
        '<div class="subject" data-code="154" data-wrap="project"><button type="button" data-button="add"></button></div>',
      );
    const read = lines();
    collectPreparationSnapshot(document);
    const skips = read();
    expect(skips.join("\n")).toContain(
      "[CareerForm] skip stage=prepare key=hplace.mrs2.project.add reason=row-add-guard detail=section-disabled",
    );
    expect(
      skips.filter((line) => line.includes("key=hplace.mrs2.project.add")),
    ).toHaveLength(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import {
  installExecutionPolicy,
  validExecutionPolicy,
} from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { mountEducation } from "./__fixtures__/hplace-mrs2-education.synthetic";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";

afterEach(() => installExecutionPolicy(document));
describe("nativeForm single-depth contract", () => {
  it("accepts the bounded v2 contract without changing wire schema 2", () => {
    expect(validExecutionPolicy(syntheticNativePolicy())).toBe(true);
  });
  it("collects canonical fields with private row ownership and no values", () => {
    mountSyntheticNative(2);
    installExecutionPolicy(document, syntheticNativePolicy());
    const snapshot = collectFieldsSnapshot(document);
    expect(snapshot.request.schemaVersion).toBe(2);
    expect(snapshot.request.sections.map((s) => s.sectionId)).toEqual([
      "hplace-mrs2-basic-extra",
      "hplace-mrs2-career",
    ]);
    const items = snapshot.request.sections[1].items!;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.itemGroupId)).toEqual([
      "hplace.mrs2.career",
      "hplace.mrs2.career",
    ]);
    expect(items[0].fields.map((f) => f.domName)).toEqual([
      "hplace.mrs2.career.careerCriteriaCodeSn",
      "hplace.mrs2.career.company",
      "hplace.mrs2.career.entranceDate",
      "hplace.mrs2.career.leavingDate",
    ]);
    expect(JSON.stringify(snapshot.request)).not.toContain("careerSn");
    expect(JSON.stringify(snapshot.request)).not.toContain('"value"');
  });
  it.each([0, 1, 2])(
    "offers one owned icon add only when %s rows were collected",
    (rows) => {
      mountSyntheticNative(rows);
      installExecutionPolicy(document, syntheticNativePolicy());
      const snapshot = collectPreparationSnapshot(document);
      const actions = snapshot.request.sections.flatMap(
        (s) => s.actionCandidates,
      );
      expect(actions.map((a) => a.domId)).toEqual(
        rows > 0 ? ["hplace.mrs2.career.add"] : [],
      );
      if (rows > 0)
        expect(snapshot.countRepeatableGroups(actions[0].candidateId)).toBe(
          rows,
        );
    },
  );
  it("rejects discontinuous indices instead of mapping a matching suffix", () => {
    mountSyntheticNative(2);
    document.querySelector<HTMLInputElement>(
      '[name="career[1].company"]',
    )!.name = "career[3].company";
    installExecutionPolicy(document, syntheticNativePolicy());
    expect(
      collectFieldsSnapshot(document).request.sections.some(
        (s) => s.sectionId === "hplace-mrs2-career",
      ),
    ).toBe(false);
  });
  it("blocks the contract on wrong document and does not collect generic fields", () => {
    mountSyntheticNative();
    document.querySelector("#frm")!.id = "other";
    installExecutionPolicy(document, syntheticNativePolicy());
    expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
  });
});

it.each(["unknown-native-key", "missing-base", "unbounded"])(
  "rejects invalid v2 %s without throwing",
  (mutation) => {
    const p = syntheticNativePolicy();
    if (p.browserPolicy?.schemaVersion !== 2) throw new Error();
    if (mutation === "unknown-native-key")
      Object.assign(p.browserPolicy.nativeForm, { script: "danger" });
    if (mutation === "missing-base")
      Reflect.deleteProperty(p.browserPolicy, "fields");
    if (mutation === "unbounded")
      p.browserPolicy.nativeForm.maxFieldsRequests = 999999;
    expect(() => validExecutionPolicy(p)).not.toThrow();
    expect(validExecutionPolicy(p)).toBe(false);
  },
);

it("refuses circular driver dependencies and an unsupported operation", () => {
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const fields = policy.browserPolicy.nativeForm.sections[1].fields;
  fields[1].driver = {
    stage: 1,
    timeoutMs: 100,
    dependencies: [fields[0].name],
    settled: [],
  };
  expect(validExecutionPolicy(policy)).toBe(false);
  delete fields[1].driver;
  Object.assign(policy.browserPolicy, { operation: "SUBMIT" });
  expect(validExecutionPolicy(policy)).toBe(false);
});

it("omits disabled native dependents and recollects them only after enabling", () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  const company = document.querySelector<HTMLInputElement>(
    '[name="career[0].company"]',
  )!;
  const names = () =>
    collectFieldsSnapshot(document).request.sections.flatMap(
      (s) => s.items?.flatMap((i) => i.fields.map((f) => f.domName)) ?? [],
    );
  company.disabled = true;
  expect(names()).not.toContain("hplace.mrs2.career.company");
  company.disabled = false;
  expect(names()).toContain("hplace.mrs2.career.company");
});

/** CF-177 C6: a nested field whose child row is not rendered yet is a missing
 * control, not an ownership failure. */
describe("nested field diagnostics", () => {
  afterEach(() => {
    setAutofillDebugEnabled(false);
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });
  const skips = (collect: () => void) => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    collect();
    const all = log.mock.calls.map(([line]) => line as string);
    for (const line of all) expectHarnessLine(line, ["합성"]);
    return all
      .filter((line) => line.startsWith("[CareerForm] skip"))
      .join("\n");
  };
  it("reports an absent second major row as a missing control", () => {
    mountEducation(1, 1, true);
    const lines = skips(() => collectFieldsSnapshot(document));
    expect(lines).toContain(
      "[CareerForm] skip stage=collect key=hplace.mrs2.college.major1.majorName reason=control-missing detail=nested-row-absent",
    );
    expect(lines).not.toMatch(
      /key=hplace\.mrs2\.college\.major1\.\S+ reason=owner-mismatch/,
    );
    expect(lines).not.toContain("key=hplace.mrs2.college.major0.majorName");
  });
  it("keeps an unowned major wrapper an owner mismatch", () => {
    mountEducation(1, 1, true);
    document
      .querySelector('[data-loop="college"] [data-wrap="major"]')!
      .replaceChildren();
    const lines = skips(() => collectFieldsSnapshot(document));
    expect(lines).toContain(
      "[CareerForm] skip stage=collect key=hplace.mrs2.college.major0.majorName reason=owner-mismatch detail=nested-row",
    );
    expect(lines).not.toMatch(
      /key=hplace\.mrs2\.college\.\S+ reason=control-missing detail=nested-row-absent/,
    );
  });
});

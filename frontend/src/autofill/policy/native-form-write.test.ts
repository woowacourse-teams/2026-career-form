import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { getWriteAdapter } from "../adapters/write";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";

import { nativeTestItem } from "./__fixtures__/native-test-item";
afterEach(() => installExecutionPolicy(document));
describe("nativeForm writes", () => {
  it("writes a bounded integer using native number events", () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem("hopeSalary", "4100");
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(
      (document.querySelector('[name="hopeSalary"]') as HTMLInputElement).value,
    ).toBe("4100");
  });
  it("writes only the owned row and verifies the exact option label and code", () => {
    mountSyntheticNative(2);
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem(
      "careerCriteriaCodeSn",
      "정규직",
      "SELECT_OPTION",
    );
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(
      (
        document.querySelector(
          '[name="career[1].careerCriteriaCodeSn"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("");
  });
  it.each(["-1", "1.5", "210000001", "NaN"])(
    "rejects invalid salary %s",
    (value) => {
      mountSyntheticNative();
      installExecutionPolicy(document, syntheticNativePolicy());
      const { handle, item } = nativeTestItem("hopeSalary", value);
      expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
        handled: true,
        written: false,
      });
    },
  );
  it("rejects an option whose label survived a code substitution", () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem(
      "careerCriteriaCodeSn",
      "정규직",
      "SELECT_OPTION",
    );
    (handle.elements[0] as HTMLSelectElement).options[1].value = "SPOOF";
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  });
  it("preserves user edits and never falls back after owner replacement", () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem("company", "합성회사");
    handle.elements[0].value = "사용자 값";
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    handle.elements[0].replaceWith(handle.elements[0].cloneNode(true));
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  });
});

it.each(["205586", "66392"])(
  "selects a tenant Sn %s by exact approved label and pins the observed code",
  (code) => {
    mountSyntheticNative();
    const policy = syntheticNativePolicy();
    if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
    const field = policy.browserPolicy.nativeForm.sections[1].fields[0];
    delete field.options;
    Object.assign(field, {
      dynamicOptions: {
        labels: ["정규직", "계약직"],
        codeFormat: "POSITIVE_INTEGER",
      },
    });
    const select = document.querySelector<HTMLSelectElement>(
      '[name="career[0].careerCriteriaCodeSn"]',
    )!;
    select.options[1].value = code;
    select.options[2].value = String(Number(code) + 1);
    installExecutionPolicy(document, policy);
    expect(collectFieldsSnapshot(document).request.sections).toHaveLength(2);
    const { handle, item } = nativeTestItem(
      "careerCriteriaCodeSn",
      "정규직",
      "SELECT_OPTION",
    );
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(select.value).toBe(code);
    select.value = "";
    select.options[1].value = "999999";
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  },
);

it("writes an explicitly declared textarea and never overwrites it on replay", () => {
  mountSyntheticNative();
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const rule = policy.browserPolicy.nativeForm.sections[1].fields[1];
  rule.type = "textarea";
  document.querySelector('[name="career[0].company"]')!.outerHTML =
    '<textarea name="career[0].company" maxlength="128"></textarea>';
  installExecutionPolicy(document, policy);
  const { handle, item } = nativeTestItem("company", "합성 여러 줄\n둘째 줄");
  expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
    handled: true,
    written: true,
  });
  expect(handle.elements[0].value).toBe("합성 여러 줄\n둘째 줄");
  item.profileValue = "다른 값";
  expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
});

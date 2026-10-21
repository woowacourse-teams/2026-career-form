import { afterEach, describe, expect, it } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
import type { ValueBinding as Binding } from "../api/types";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";

// Policy order; the server's Map.copyOf returns the same entries in a
// JVM-randomized order, so the analysis binding arrives reordered.
const policyMap = {
  정규직: "정규직",
  계약직: "계약직",
  인턴: "인턴",
  파견직: "파견직",
};
const lookup = (optionMap: Record<string, string>): Binding => ({
  type: "LOOKUP",
  profileFieldKey: "careers.career.employmentType",
  optionMap,
});
function mountLookupDriver() {
  mountSyntheticNative();
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  policy.browserPolicy.nativeForm.sections[1].fields[0].binding =
    lookup(policyMap);
  installExecutionPolicy(document, policy);
  const { handle, item } = nativeTestItem(
    "careerCriteriaCodeSn",
    "정규직",
    "SELECT_OPTION",
  );
  return { handle, item };
}
afterEach(() => installExecutionPolicy(document));
describe("native LOOKUP binding equality", () => {
  it("accepts a server-reordered optionMap as the same career driver binding", async () => {
    const { handle, item } = mountLookupDriver();
    item.analysis!.valueBinding = lookup({
      파견직: "파견직",
      인턴: "인턴",
      정규직: "정규직",
      계약직: "계약직",
    });
    const adapter = getWorkflowAdapter(document);
    expect(
      adapter.isStateDriver(item, handle.candidate.domName ?? undefined),
    ).toBe(true);
    expect(
      await adapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(true);
    expect(handle.elements[0].value).toBe("TEST_REGULAR");
  });
  it.each([
    ["a changed option value", { ...policyMap, 인턴: "계약직" }],
    ["a missing option", { 정규직: "정규직", 계약직: "계약직", 인턴: "인턴" }],
    ["an extra option", { ...policyMap, 기타: "기타" }],
  ])("still rejects %s", (_name, optionMap) => {
    const { handle, item } = mountLookupDriver();
    item.analysis!.valueBinding = lookup(optionMap);
    expect(
      getWorkflowAdapter(document).isStateDriver(
        item,
        handle.candidate.domName ?? undefined,
      ),
    ).toBe(false);
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(handle.elements[0].value).toBe("");
  });
});

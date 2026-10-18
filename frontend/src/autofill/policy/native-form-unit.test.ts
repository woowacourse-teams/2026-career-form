import { afterEach, expect, it, vi } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import { mountSyntheticNative } from "./__fixtures__/hplace-mrs2-native.synthetic";
import { collectFieldsSnapshot } from "../dom/collect";
import { getWriteAdapter } from "../adapters/write";
import { nativeOwnership } from "./native-form-collection";
import type { ReviewPlanItem } from "../review/review-plan";
afterEach(() => {
  vi.restoreAllMocks();
  installExecutionPolicy(document);
});
function target(content: string, classes = "label money", parent = "label") {
  mountSyntheticNative(0);
  document.querySelectorAll("script").forEach((s, i) => {
    s.src = seed.executionPolicy.browserPolicy.nativeForm.assetPaths[i];
  });
  const input = document.querySelector<HTMLInputElement>(
    '[name="hopeSalary"]',
  )!;
  const owner = document.createElement(parent);
  owner.className = classes;
  input.replaceWith(owner);
  owner.append(input);
  const native = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
    pseudo === "::after"
      ? ({ content } as CSSStyleDeclaration)
      : native(element, pseudo),
  );
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as ExecutionPolicy,
  );
  const snapshot = collectFieldsSnapshot(document),
    field = snapshot.request.sections
      .flatMap((s) => s.fields)
      .find((f) => f.domName?.endsWith("hopeSalary"))!;
  const lookup = snapshot.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error();
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: "4500",
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: nativeOwnership(lookup.handle)!.field.binding,
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  } as ReviewPlanItem;
  return { input, owner, lookup, item, snapshot };
}
it.each(["none", '"원"', '"억원"', ""])(
  "blocks salary when live pseudo unit is %s",
  (content) => {
    const { input, lookup, item } = target(content);
    expect(getWriteAdapter(document).tryWrite(lookup.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(input.value).toBe("");
    expect(lookup.status).not.toBe("ready");
  },
);
it.each([
  ["label money million", "label"],
  ["label money", "span"],
  ["money", "label"],
])("requires the exact observed owning label %s / %s", (classes, parent) => {
  const { lookup, item } = target('"만원"', classes, parent);
  expect(getWriteAdapter(document).tryWrite(lookup.handle, item)).toEqual({
    handled: true,
    written: false,
  });
});
it("writes and reads back only while the owning label keeps the verified unit", () => {
  const { input, owner, lookup, item } = target('"만원"');
  expect(lookup.status).toBe("ready");
  expect(getWriteAdapter(document).tryWrite(lookup.handle, item)).toEqual({
    handled: true,
    written: true,
  });
  expect(input.value).toBe("4500");
  owner.classList.add("million");
  expect(getWriteAdapter(document).verifyRetained?.(lookup.handle, item)).toBe(
    false,
  );
});

import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  installExecutionPolicy,
  validExecutionPolicy,
} from "./execution-policy";
import { resolveDocumentCompany } from "../adapters/company";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "../policy/__fixtures__/hplace-mrs2-native.synthetic";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import type { ExecutionPolicy } from "./execution-policy";
afterEach(() => {
  window.history.replaceState({}, "", "/");
  installExecutionPolicy(document);
});
it("accepts the shipped provider contract without a tenant host list", () => {
  expect(validExecutionPolicy(seed.executionPolicy)).toBe(true);
});
it("never downgrades after policy loss", () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  installExecutionPolicy(document);
  expect(resolveDocumentCompany(document)).not.toBe("generic");
  expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
});
it("blocks policy on wrong path", () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  window.history.replaceState({}, "", "/mrs2/applicant/resume/preview");
  installExecutionPolicy(document, syntheticNativePolicy());
  expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
});
it("marks inactive section controls unavailable without generic fallback", () => {
  mountSyntheticNative();
  const policy = syntheticNativePolicy() as ExecutionPolicy;
  if (policy.browserPolicy!.schemaVersion !== 2) throw new Error();
  policy.browserPolicy!.nativeForm.sections[1].enabled = false;
  policy.browserPolicy!.nativeForm.sections[1].reason =
    "실DOM 확인 대기: 구조 미확인";
  installExecutionPolicy(document, policy);
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections[1].items![0].fields[0];
  expect(snapshot.registry.lookupField(field.candidateId)).toMatchObject({
    status: "blocked",
    reason: "unsupported",
    handle: { unsupportedReason: "실DOM 확인 대기: 구조 미확인" },
  });
  expect(resolveDocumentCompany(document)).toBe("policy");
});

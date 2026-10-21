import { afterEach, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  mountBasicDetail,
  activateBasicDetails,
  basicAnalysis,
} from "../adapters/hplace/basic.test-fixtures";
import {
  isUnsupportedHplace,
  resolveDocumentCompany,
} from "../adapters/company";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
afterEach(() => installExecutionPolicy(document));
it.each(["root", "asset"])(
  "keeps independently verified legacy controls after a native %s mismatch",
  async (fault) => {
    mountBasicDetail();
    activateBasicDetails();
    const policy = structuredClone(seed.executionPolicy) as ExecutionPolicy;
    if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
    if (fault === "root")
      policy.browserPolicy.nativeForm.rootSelector = "#unobserved-root";
    else policy.browserPolicy.nativeForm.assetPaths.push("/unobserved.js");
    document.body.insertAdjacentHTML(
      "beforeend",
      '<label>Unknown generic field<input name="untrusted"></label>',
    );
    installExecutionPolicy(document, policy);
    expect(isUnsupportedHplace(document)).toBe(false);
    expect(resolveDocumentCompany(document)).toBe("policy");
    const snapshot = collectFieldsSnapshot(document);
    expect(snapshot.request.sections.map((s) => s.sectionId)).toEqual([
      "hplace-detail-basic",
    ]);
    expect(
      snapshot.request.sections[0].fields.every((f) =>
        f.domName?.startsWith("hplace.detail."),
      ),
    ).toBe(true);
    const profile = createEmptyProfile();
    profile.personal.gender = "남성";
    const items = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis: basicAnalysis(snapshot.request),
    }).items.filter((i) => i.profileValue);
    items.forEach((i) => {
      i.selected = true;
    });
    const result = await executeApprovedWritesAfterPageSettles({
      items,
      registry: snapshot.registry,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
      document,
    });
    expect(result.map((r) => r.status)).toEqual(["written"]);
    installExecutionPolicy(document);
    expect(snapshot.registry.lookupField(items[0].candidateId).status).toBe(
      "stale",
    );
  },
);

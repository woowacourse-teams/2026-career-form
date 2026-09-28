import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldsAnalyzeResponse } from "../api/types";
import { validateFieldsResponse } from "../api/validate-response";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { prepareCjSchoolClose } from "./cj-major-close-bridge";
import { executeReadonlySearch } from "./readonly-search-executor";

vi.mock("./cj-major-close-bridge", () => ({
  prepareCjMajorClose: vi.fn(),
  prepareCjSchoolClose: vi.fn(),
}));

// Synthetic education section mirroring the observed structure: titled
// high-school and university boxes without `*-item` identifiers, each owning
// one repeat-marked row, and a shared add action under the section.
const PAGE = `<!doctype html><html><body>
<div class="apply-block">
  <div class="block-title"><h4>학력사항</h4></div>
  <div class="entry-list">
    <div class="entry-box kind-high">
      <div class="entry-head"><h5>고등학교</h5></div>
      <div id="sectionHighSch" class="entry-fields" ismultirow="true">
        <dl><dt>학교명</dt><dd>
          <input type="text" readonly id="high-school-name" name="high_school_nm" aria-label="학교명">
          <button type="button" name="bt_high_school_nm">검색</button>
        </dd></dl>
        <dl><dt>졸업년월</dt><dd><input type="text" id="high-end" aria-label="졸업년월"></dd></dl>
      </div>
    </div>
    <div class="entry-box kind-univ">
      <div class="entry-head"><h5>대학교</h5></div>
      <div id="sectionNormalUniversity0" class="entry-fields" ismultirow="true">
        <dl><dt>학교명</dt>
          <dd><input type="text" readonly id="zz_school_nm2_0" name="zz_school_nm" aria-label="학교명"><input type="hidden" name="school_code" value=""><button type="button" name="bt_zz_school_nm" data-popup-show="" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo?num=2_0">검색</button></dd>
          <dd><input type="text" readonly id="zz_state_nm5_0" name="zz_state_nm" aria-label="학교소재지"><input type="hidden" name="zz_state" value=""><input type="hidden" name="reg_region" value="KOR"><input type="hidden" name="new_country" value="KOR"><button type="button" name="bt_zz_state_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0">검색</button></dd>
        </dl>
        <p class="btn-right"><button type="button">삭제</button></p>
      </div>
    </div>
  </div>
  <div class="block-bottom">
    <select aria-label="학력 구분"><option>고등학교</option><option>대학교</option></select>
    <button type="button">항목추가</button>
  </div>
</div>
</body></html>`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(prepareCjSchoolClose).mockReset();
});

it("collects, plans and reaches the university school search opener once", async () => {
  const dom = new JSDOM(PAGE, {
    url: "https://recruit.cj.net/recruit/ko/resume/apply.fo",
  });
  const doc = dom.window.document;
  for (const name of [
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "HTMLElement",
    "Element",
    "Node",
  ] as const)
    vi.stubGlobal(name, dom.window[name]);
  const fetcher = vi.fn(async () => {
    throw new Error("unexpected request");
  });
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(prepareCjSchoolClose).mockResolvedValue({
    check: async () => true,
    close: async () => true,
  });

  const target = doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!;
  const opener = doc.querySelector<HTMLButtonElement>(
    '[name="bt_zz_school_nm"]',
  )!;
  const snapshot = collectFieldsSnapshot(doc);
  const allCandidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items?.flatMap((item) => item.fields) ?? []),
  ]);
  const candidate = allCandidates.find((field) => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    return lookup.status === "blocked" && lookup.handle.elements[0] === target;
  });
  expect(candidate).toBeDefined();
  expect(candidate!.semanticContext?.repeat).toMatchObject({
    rowIndex: 0,
    rowCount: 1,
  });

  const response: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: candidate!.candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "education.university.schoolName",
        },
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        autofillPolicy: "CONDITIONAL",
        writePlan: { command: "SEARCH_SELECTION" },
      },
      ...allCandidates
        .filter((field) => field.candidateId !== candidate!.candidateId)
        .map((field) => ({
          candidateId: field.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "LLM_SUGGESTED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
        })),
    ],
  };
  const profile: Profile = {
    ...createEmptyProfile(),
    education: [
      {
        id: "high-entry",
        sectionId: "highSchool",
        values: { schoolName: "합성고등학교" },
      },
      {
        id: "university-entry",
        sectionId: "university",
        values: { schoolName: "합성대학교" },
      },
    ],
  };
  const { items } = buildReviewPlan({
    analysis: validateFieldsResponse(snapshot.request, response),
    registry: snapshot.registry,
    profile,
  });
  expect(items[0]).toMatchObject({
    disabled: false,
    itemIndex: 0,
    profileEntryId: "university-entry",
    profileValue: "합성대학교",
  });

  // Stop the run at the first opener click; popup behaviour is out of scope.
  const controller = new AbortController();
  const clicked = vi.fn(() => controller.abort());
  opener.addEventListener("click", clicked);
  await executeReadonlySearch({
    document: doc,
    registry: snapshot.registry,
    targetCandidateId: candidate!.candidateId,
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: items[0]!.profileValue!,
    expectedCurrentValue: "",
    signal: controller.signal,
  });

  expect(prepareCjSchoolClose).toHaveBeenCalledTimes(1);
  expect(clicked).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  expect(target.value).toBe("");
  dom.window.close();
});

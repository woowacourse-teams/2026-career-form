import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type { FieldsAnalyzeResponse, PreparationPlan } from "../../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../../dom/collect";
import { executeApprovedPreparationPlans } from "../../preparation/executor";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";

function setUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

afterEach(() => {
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

it("adds two Hyundai certificate rows, writes three distinct entries, and does not add again", async () => {
  setUrl("https://talent.hyundai.com/apply/applyWrite.hc");
  document.body.innerHTML = `<article id="licence" class="field-form-apply">
    <div class="field-header"><h3>자격</h3></div>
    <div class="field-footer"><button class="btn-group-add" type="button">추가</button></div>
  </article><article class="field-form-apply">
    <div class="field-content"><input name="adrRes" /></div>
    <button class="btn-group-add" type="button">추가</button>
  </article>`;
  const article = document.querySelector("article")!;
  let rowCount = 0;
  let clicks = 0;
  const appendRow = () => {
    rowCount += 1;
    const row = document.createElement("div");
    row.className = "field-content";
    row.innerHTML = `<input id="nationLicNm_${rowCount}" name="nationLicNm" />
      <input id="regNo_${rowCount}" name="regNo" />
      <input type="button" id="grade_${rowCount}" aria-label="등급" value="등급" />`;
    article.insertBefore(row, article.querySelector(".field-footer"));
  };
  appendRow();
  article.querySelector("button")!.addEventListener("click", () => {
    clicks += 1;
    appendRow();
  });
  const profile = createEmptyProfile();
  profile.certifications = [1, 2, 3].map((index) => ({
    id: `certificate-${index}`,
    sectionId: "certificate",
    values: {
      name: `Fixture certificate ${index}`,
      registrationNo: `FIXTURE-${index}`,
    },
  }));

  const review = () => {
    const snapshot = collectFieldsSnapshot(document);
    const fields: FieldsAnalyzeResponse["fields"] = snapshot.request.sections
      .flatMap(
        (section) =>
          section.items?.flatMap((item) => item.fields) ?? section.fields,
      )
      .filter(
        (candidate) =>
          candidate.control === "text" &&
          ["nationLicNm", "regNo"].includes(candidate.domName ?? ""),
      )
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey:
            candidate.domName === "nationLicNm"
              ? "certifications.certificate.name"
              : "certifications.certificate.registrationNo",
        },
        autofillPolicy: "ALLOWED",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
      }));
    return {
      snapshot,
      plan: buildReviewPlan({
        analysis: {
          snapshotId: snapshot.request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          fields,
        },
        profile,
        registry: snapshot.registry,
      }),
    };
  };
  expect(
    review().plan.items.every((item) => item.status === "unavailable"),
  ).toBe(true);

  const prepare = async () => {
    const collect = () => {
      const snapshot = collectPreparationSnapshot(document);
      return {
        registry: snapshot.registry,
        isTargetSectionVisible: snapshot.isSectionVisible,
        countRepeatableGroups: (
          plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
        ) => snapshot.countRepeatableGroups(plan.actionCandidateId),
      };
    };
    const initial = collectPreparationSnapshot(document);
    const candidate = initial.request.sections
      .flatMap((section) => section.actionCandidates)
      .find((action) => action.domId === "hyundai:add:licence")!;
    return executeApprovedPreparationPlans({
      approvedPlans: [
        {
          approved: true,
          localItemCount: profile.certifications.length,
          plan: {
            actionCandidateId: candidate.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["nationLicNm"],
          },
        },
      ],
      initialSnapshot: {
        registry: initial.registry,
        isTargetSectionVisible: initial.isSectionVisible,
        countRepeatableGroups: (plan) =>
          initial.countRepeatableGroups(plan.actionCandidateId),
      },
      refreshSnapshot: async () => collect(),
      waitForExpectedFields: async () => true,
      countRepeatableGroups: (snapshot, plan) =>
        snapshot.countRepeatableGroups?.(plan) ?? -1,
    });
  };
  expect(await prepare()).toMatchObject({ status: "completed" });
  expect(clicks).toBe(2);
  expect(rowCount).toBe(3);
  const { snapshot, plan } = review();
  expect(plan.items).toHaveLength(6);
  expect(plan.items.every((item) => item.status === "available")).toBe(true);
  const results = executeApprovedWrites({
    items: plan.items,
    approvedCandidateIds: new Set(plan.items.map((item) => item.candidateId)),
    registry: snapshot.registry,
  });
  expect(results.every((result) => result.status === "written")).toBe(true);
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>('[name="nationLicNm"]'),
      (input) => input.value,
    ),
  ).toEqual([
    "Fixture certificate 1",
    "Fixture certificate 2",
    "Fixture certificate 3",
  ]);
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>('[name="regNo"]'),
      (input) => input.value,
    ),
  ).toEqual(["FIXTURE-1", "FIXTURE-2", "FIXTURE-3"]);
  expect(await prepare()).toMatchObject({ status: "completed" });
  expect(clicks).toBe(2);
});

import { afterEach, describe, expect, it } from "vitest";

import type { FieldsAnalyzeResponse } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { createEmptyProfile } from "../../../profile/model";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function setHyundaiForm(): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `
    <article id="language" class="field-form-apply">
      <div class="field-content"><input id="acqDtForeLang_1" name="acqDt" maxlength="10" /></div>
      <div class="field-content"><input id="acqDtForeLang_2" name="acqDt" maxlength="10" /></div>
    </article>
    <article id="certificate" class="field-form-apply">
      <div class="field-content">
        <input id="acqDt_1" name="acqDt" maxlength="10" />
        <input id="regNo_1" name="regNo" />
        <input id="issueOrg_1" name="issueOrg" />
      </div>
      <div class="field-content">
        <input id="acqDt_2" name="acqDt" maxlength="10" />
        <input id="regNo_2" name="regNo" />
        <input id="issueOrg_2" name="issueOrg" />
      </div>
    </article>
  `;
}

function matchedFields(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
): FieldsAnalyzeResponse["fields"] {
  const candidates = snapshot.request.sections.flatMap(
    (section) =>
      section.items?.flatMap((item) => item.fields) ?? section.fields,
  );
  const bindingByDomId = {
    acqDtForeLang_1: "languages.languageTest.acquisitionDate",
    acqDtForeLang_2: "languages.languageTest.acquisitionDate",
    acqDt_1: "certifications.certificate.acquisitionDate",
    acqDt_2: "certifications.certificate.acquisitionDate",
    regNo_1: "certifications.certificate.registrationNo",
    regNo_2: "certifications.certificate.registrationNo",
    issueOrg_1: "certifications.certificate.issuer",
    issueOrg_2: "certifications.certificate.issuer",
  } as const;

  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    matchType: "MATCH" as const,
    valueBinding: {
      type: "DIRECT" as const,
      profileFieldKey:
        bindingByDomId[candidate.domId as keyof typeof bindingByDomId],
    },
    autofillPolicy: "ALLOWED" as const,
    mappingStatus: "ADAPTER_VERIFIED" as const,
    interactionStatus: "READY" as const,
    writePlan: { command: "SET_TEXT" as const },
  }));
}

function response(
  snapshotId: string,
  fields: FieldsAnalyzeResponse["fields"],
): FieldsAnalyzeResponse {
  return {
    snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields,
  };
}

describe("Hyundai language and certificate date fields", () => {
  it("keeps same-name language and certificate dates in their own repeated rows", () => {
    setHyundaiForm();
    const snapshot = collectFieldsSnapshot(document);
    const profile = createEmptyProfile();
    profile.languages.push(
      {
        id: "language-1",
        sectionId: "languageTest",
        values: { acquisitionDate: "2024-01-15" },
      },
      {
        id: "language-2",
        sectionId: "languageTest",
        values: { acquisitionDate: "2025-02-16" },
      },
    );
    profile.certifications.push(
      {
        id: "certificate-1",
        sectionId: "certificate",
        values: {
          acquisitionDate: "2020-03-17",
          registrationNo: "CERT-001",
          issuer: "기관 A",
        },
      },
      {
        id: "certificate-2",
        sectionId: "certificate",
        values: {
          acquisitionDate: "2021-04-18",
          registrationNo: "CERT-002",
          issuer: "기관 B",
        },
      },
    );

    const plan = buildReviewPlan({
      analysis: response(snapshot.request.snapshotId, matchedFields(snapshot)),
      profile,
      registry: snapshot.registry,
    });
    const approvedCandidateIds = new Set(
      plan.items
        .filter((item) => item.status === "available")
        .map((item) => item.candidateId),
    );

    expect(
      snapshot.request.sections.map((section) => section.items?.length),
    ).toEqual([2, 2]);
    expect(
      snapshot.request.sections.flatMap(
        (section) =>
          section.items?.flatMap((item) =>
            item.fields.map((field) => [field.domId, field.domName]),
          ) ?? [],
      ),
    ).toEqual([
      ["acqDtForeLang_1", "acqDt"],
      ["acqDtForeLang_2", "acqDt"],
      ["acqDt_1", "acqDt"],
      ["regNo_1", "regNo"],
      ["issueOrg_1", "issueOrg"],
      ["acqDt_2", "acqDt"],
      ["regNo_2", "regNo"],
      ["issueOrg_2", "issueOrg"],
    ]);
    expect(plan.items.every((item) => item.status === "available")).toBe(true);

    const writes = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds,
      registry: snapshot.registry,
    });

    expect(writes.every((result) => result.status === "written")).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>("#acqDtForeLang_1")?.value,
    ).toBe("2024-01-15");
    expect(
      document.querySelector<HTMLInputElement>("#acqDtForeLang_2")?.value,
    ).toBe("2025-02-16");
    expect(document.querySelector<HTMLInputElement>("#acqDt_1")?.value).toBe(
      "2020-03-17",
    );
    expect(document.querySelector<HTMLInputElement>("#acqDt_2")?.value).toBe(
      "2021-04-18",
    );
    expect(document.querySelector<HTMLInputElement>("#regNo_1")?.value).toBe(
      "CERT-001",
    );
    expect(document.querySelector<HTMLInputElement>("#regNo_2")?.value).toBe(
      "CERT-002",
    );
    expect(document.querySelector<HTMLInputElement>("#issueOrg_1")?.value).toBe(
      "기관 A",
    );
    expect(document.querySelector<HTMLInputElement>("#issueOrg_2")?.value).toBe(
      "기관 B",
    );
  });

  it("does not write a language date when the analysis has no mapping", () => {
    setHyundaiForm();
    const snapshot = collectFieldsSnapshot(document);
    const languageDate = snapshot.request.sections[0]!.items![0]!.fields[0]!;
    const profile = createEmptyProfile();
    profile.languages.push({
      id: "language-1",
      sectionId: "languageTest",
      values: { acquisitionDate: "2024-01-15" },
    });
    const plan = buildReviewPlan({
      analysis: response(snapshot.request.snapshotId, [
        {
          candidateId: languageDate.candidateId,
          matchType: "NO_MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        },
      ]),
      profile,
      registry: snapshot.registry,
    });

    const writes = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set([languageDate.candidateId]),
      registry: snapshot.registry,
    });

    expect(plan.items[0]?.status).toBe("unavailable");
    expect(writes).toEqual([
      {
        candidateId: languageDate.candidateId,
        status: "skipped",
        reason: "사용자가 승인한 입력 항목이 아닙니다.",
      },
    ]);
    expect(
      document.querySelector<HTMLInputElement>("#acqDtForeLang_1")?.value,
    ).toBe("");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldsAnalyzeResponse } from "../api/types";
import { validateFieldsResponse } from "../api/validate-response";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "./review-plan";

const COUNT_MISMATCH =
  "반복 입력 행과 저장된 프로필 항목의 개수가 달라 안전하게 연결할 수 없습니다.";

function entryBox(kind: string, title: string, id: string): string {
  return `<div class="entry-box ${kind}">
    <div class="entry-head"><h5>${title}</h5></div>
    <div class="entry-fields" ismultirow="true">
      <dl><dt>학교명</dt><dd>
        <input type="text" id="${id}-name" aria-label="학교명" readonly>
        <button type="button">검색</button>
      </dd></dl>
      <dl><dt>입학년월</dt><dd>
        <input type="text" id="${id}-start" aria-label="입학년월">
      </dd></dl>
    </div>
  </div>`;
}

function educationSection(boxes: string): string {
  return `<div class="apply-block">
    <div class="block-title"><h4>학력사항</h4></div>
    <div class="entry-list">${boxes}</div>
    <div class="block-bottom"><button type="button">항목추가</button></div>
  </div>`;
}

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function profileWith(sections: ReadonlyArray<string>): Profile {
  return {
    ...createEmptyProfile(),
    education: sections.map((sectionId, index) => ({
      id: `entry-${index}`,
      sectionId,
      values: { schoolName: `합성학교${index}` },
    })),
  };
}

/** Collect the page and map each listed input id to a school-name search. */
function plan(
  targets: ReadonlyArray<[string, "highSchool" | "university"]>,
  profile: Profile,
) {
  const snapshot = collectFieldsSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items?.flatMap((item) => item.fields) ?? []),
  ]);
  const candidateFor = (id: string) =>
    candidates.find((candidate) => {
      const lookup = snapshot.registry.lookupField(candidate.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0]?.id === id
      );
    })!;
  const response: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [
      ...targets.map(([id, section]) => ({
        candidateId: candidateFor(id).candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: `education.${section}.schoolName`,
        },
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        autofillPolicy: "CONDITIONAL" as const,
        writePlan: { command: "SEARCH_SELECTION" as const },
      })),
      ...candidates
        .filter(
          (candidate) =>
            !targets.some(
              ([id]) => candidateFor(id).candidateId === candidate.candidateId,
            ),
        )
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "LLM_SUGGESTED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
        })),
    ],
  };
  const { items } = buildReviewPlan({
    analysis: validateFieldsResponse(snapshot.request, response),
    registry: snapshot.registry,
    profile,
  });
  return (id: string) =>
    items.find((item) => item.candidateId === candidateFor(id).candidateId)!;
}

describe("review plan with ownership-based repeated groups", () => {
  beforeEach(() => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = "";
  });

  it("links a university search when the high-school row belongs to another group", () => {
    document.body.innerHTML = educationSection(
      entryBox("kind-high", "고등학교", "h0") +
        entryBox("kind-univ", "대학교", "u0"),
    );
    const item = plan(
      [
        ["h0-name", "highSchool"],
        ["u0-name", "university"],
      ],
      profileWith(["highSchool", "university"]),
    );

    expect(item("u0-name")).toMatchObject({
      disabled: false,
      itemIndex: 0,
      profileEntryId: "entry-1",
      profileValue: "합성학교1",
    });
    expect(item("h0-name")).toMatchObject({
      disabled: false,
      profileEntryId: "entry-0",
    });
  });

  it("links each university row to its own profile entry", () => {
    document.body.innerHTML = educationSection(
      entryBox("kind-high", "고등학교", "h0") +
        entryBox("kind-univ", "대학교", "u0") +
        entryBox("kind-univ", "대학교", "u1"),
    );
    const item = plan(
      [
        ["u0-name", "university"],
        ["u1-name", "university"],
      ],
      profileWith(["highSchool", "university", "university"]),
    );

    expect(item("u0-name")).toMatchObject({
      disabled: false,
      profileEntryId: "entry-1",
    });
    expect(item("u1-name")).toMatchObject({
      disabled: false,
      itemIndex: 1,
      profileEntryId: "entry-2",
    });
  });

  it("keeps blocking when the profile and group row counts differ", () => {
    document.body.innerHTML = educationSection(
      entryBox("kind-high", "고등학교", "h0") +
        entryBox("kind-univ", "대학교", "u0"),
    );
    const item = plan(
      [["u0-name", "university"]],
      profileWith(["highSchool", "university", "university"]),
    );

    expect(item("u0-name")).toMatchObject({
      disabled: true,
      status: "unavailable",
      reason: COUNT_MISMATCH,
    });
  });

  it("blocks a repeated row whose group boundary is ambiguous even with one profile entry", () => {
    const row = (id: string) => `<div class="entry-fields" ismultirow="true">
      <dl><dt>학교명</dt><dd>
        <input type="text" id="${id}-name" aria-label="학교명" readonly>
        <button type="button">검색</button>
      </dd></dl>
      <dl><dt>입학년월</dt><dd>
        <input type="text" id="${id}-start" aria-label="입학년월">
      </dd></dl>
    </div>`;
    document.body.innerHTML = `<div class="apply-block"><h4>학력사항</h4>
      <h5>고등학교</h5>${row("h0")}
      <h5>대학교</h5>${row("u0")}
      <button type="button">항목추가</button></div>`;
    const item = plan([["u0-name", "university"]], profileWith(["university"]));

    expect(item("u0-name")).toMatchObject({
      disabled: true,
      status: "unavailable",
      reason: COUNT_MISMATCH,
    });
  });
});

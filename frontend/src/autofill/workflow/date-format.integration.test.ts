import { afterEach, describe, expect, it } from "vitest";
import fixtureHtml from "../../../fixtures/date-format/synthetic-cj-shaped.html?raw";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  buildReviewPlan,
  revealSensitiveReviewItem,
} from "../review/review-plan";
import type { ReviewPlan, ReviewPlanItem } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";
import type { Profile } from "../../profile/model";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
} from "../write/executor";

const bindings: Record<string, string> = {
  eduhgStart: "education.highSchool.startDate",
  eduhgEnd: "education.highSchool.endDate",
  eduhgEqual: "education.highSchool.startDate",
  eduhgAmbiguous: "education.highSchool.startDate",
  eduhgLengthConflict: "education.highSchool.startDate",
  eduStartDate: "education.university.startDate",
  eduEndMonth: "education.university.endDate",
  eduStartFull: "education.university.startDate",
  eduEndEqual: "education.university.endDate",
  eduEndDifferent: "education.university.endDate",
};
function install(): void {
  const body = fixtureHtml.match(/<body>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error("synthetic fixture body not found");
  document.body.innerHTML = body;
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://date-format.synthetic.test/application",
  });
}
function profileData(): Profile {
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "synthetic-high-0",
      sectionId: "highSchool",
      values: { startDate: "2016-03-02", endDate: "2020-02-29" },
    },
    {
      id: "synthetic-high-1",
      sectionId: "highSchool",
      values: { startDate: "2015-03-01", endDate: "2019-02-28" },
    },
    {
      id: "synthetic-univ-0",
      sectionId: "university",
      values: { startDate: "2020-03-15", endDate: "2024-02-29" },
    },
    {
      id: "synthetic-univ-1",
      sectionId: "university",
      values: { startDate: "2015-03-01", endDate: "2019-02-28" },
    },
  ];
  profile.personal.birthDate = "2000-01-02";
  profile.health = [
    {
      id: "synthetic-health-0",
      sectionId: "health",
      values: { healthDate: "2021-04-05", healthItemName: "synthetic check" },
    },
  ];
  return profile;
}
type Snapshot = ReturnType<typeof collectFieldsSnapshot>;
function candidates(snapshot: Snapshot) {
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}
function indexOf(snapshot: Snapshot, candidateId: string): number | undefined {
  const result = snapshot.registry.lookupField(candidateId);
  return result.status === "ready" ? result.handle.itemIndex : undefined;
}
function response(
  snapshot: Snapshot,
  names: readonly string[],
  special: Record<string, string> = {},
): FieldsAnalyzeResponse {
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: candidates(snapshot)
      .filter((candidate) => names.includes(candidate.domName ?? ""))
      .map((candidate) => {
        const profileFieldKey =
          special[candidate.domName ?? ""] ?? bindings[candidate.domName ?? ""];
        if (!profileFieldKey)
          throw new Error(
            `no explicit synthetic mapping for ${candidate.domName}`,
          );
        return {
          candidateId: candidate.candidateId,
          matchType: "MATCH" as const,
          valueBinding: { type: "DIRECT" as const, profileFieldKey },
          autofillPolicy:
            candidate.domName === "healthDate"
              ? ("SENSITIVE_CONFIRMATION" as const)
              : ("ALLOWED" as const),
          mappingStatus: "LLM_SUGGESTED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SET_TEXT" as const },
        };
      }),
  };
}
function planFor(
  snapshot: Snapshot,
  profile: Profile,
  names: readonly string[],
  special: Record<string, string> = {},
): ReviewPlan {
  return buildReviewPlan({
    analysis: response(snapshot, names, special),
    profile,
    registry: snapshot.registry,
  });
}
function itemFor(
  snapshot: Snapshot,
  plan: ReviewPlan,
  name: string,
  row?: number,
): ReviewPlanItem {
  const id = candidates(snapshot).find(
    (candidate) =>
      candidate.domName === name &&
      (row === undefined || indexOf(snapshot, candidate.candidateId) === row),
  )?.candidateId;
  const item = plan.items.find((entry) => entry.candidateId === id);
  if (!item) throw new Error(`missing review item ${name} row ${row}`);
  return item;
}
function approve(items: readonly ReviewPlanItem[], ids: readonly string[]) {
  const approvedCandidateIds = new Set(ids);
  return {
    items: items.map((item) =>
      approvedCandidateIds.has(item.candidateId)
        ? { ...item, selected: true, disabled: false }
        : item,
    ),
    approvedCandidateIds,
  };
}
function eventLog(element: Element): string[] {
  const events: string[] = [];
  element.addEventListener("input", () => events.push("input"));
  element.addEventListener("change", () => events.push("change"));
  return events;
}
function cleanup(): void {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
}
afterEach(cleanup);

describe("synthetic date-format approved-write workflow", () => {
  it("collects repeated school rows and associates actual candidates with profileEntryId and itemIndex", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const starts = candidates(snapshot).filter(
      (candidate) => candidate.domName === "eduhgStart",
    );
    expect(
      starts.map((candidate) => indexOf(snapshot, candidate.candidateId)),
    ).toEqual([0, 1]);
    const plan = planFor(snapshot, profileData(), [
      "eduhgStart",
      "eduStartDate",
    ]);
    expect(itemFor(snapshot, plan, "eduhgStart", 0)).toMatchObject({
      profileEntryId: "synthetic-high-0",
      itemIndex: 0,
    });
    expect(itemFor(snapshot, plan, "eduhgStart", 1)).toMatchObject({
      profileEntryId: "synthetic-high-1",
      itemIndex: 1,
    });
  });

  it("shows converted previews without mutating the page, then writes only the approved item", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), ["eduhgStart", "eduhgEnd"]);
    const start = itemFor(snapshot, plan, "eduhgStart", 0);
    const startNode =
      document.querySelector<HTMLInputElement>("#high-start-0")!;
    const endNode = document.querySelector<HTMLInputElement>("#high-end-0")!;
    const startEvents = eventLog(startNode);
    const endEvents = eventLog(endNode);
    expect(start.previewValue).toBe("2016.03");
    expect(itemFor(snapshot, plan, "eduhgEnd", 0).previewValue).toBe("2020.02");
    expect([startNode.value, endNode.value]).toEqual(["", "2020.02"]);
    const result = executeApprovedWrites({
      ...approve(plan.items, [start.candidateId]),
      registry: snapshot.registry,
    });
    expect(
      result.find((entry) => entry.candidateId === start.candidateId)?.status,
    ).toBe("written");
    expect([startNode.value, endNode.value]).toEqual(["2016.03", "2020.02"]);
    expect(startEvents).toEqual(["input", "change"]);
    expect(endEvents).toEqual([]);
  });

  it("previews native date, native month, and dotted full-date outputs without changing DOM", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), [
      "eduStartDate",
      "eduEndMonth",
      "eduStartFull",
    ]);
    expect(itemFor(snapshot, plan, "eduStartDate", 0).previewValue).toBe(
      "2020-03-15",
    );
    expect(itemFor(snapshot, plan, "eduEndMonth", 0).previewValue).toBe(
      "2024-02",
    );
    expect(itemFor(snapshot, plan, "eduStartFull", 0).previewValue).toBe(
      "2020.03.15",
    );
    expect(
      document.querySelector<HTMLInputElement>("#univ-start-date")!.value,
    ).toBe("");
    expect(
      document.querySelector<HTMLInputElement>("#univ-end-month")!.value,
    ).toBe("");
  });

  it("distinguishes empty, equal, and different current values", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const profile = profileData();
    const emptyPlan = planFor(snapshot, profile, ["eduhgStart"]);
    const equalPlan = planFor(snapshot, profile, ["eduEndEqual"]);
    const differentPlan = planFor(snapshot, profile, ["eduEndDifferent"]);
    expect(itemFor(snapshot, emptyPlan, "eduhgStart", 0)).toMatchObject({
      currentValue: "",
      previewValue: "2016.03",
    });
    expect(itemFor(snapshot, equalPlan, "eduEndEqual", 0)).toMatchObject({
      currentValue: "2024.02",
      previewValue: "2024.02",
    });
    expect(
      itemFor(snapshot, differentPlan, "eduEndDifferent", 0),
    ).toMatchObject({
      currentValue: "2023.08",
      previewValue: "2024.02",
      status: "conflict",
      selected: false,
    });
  });

  it.each([
    [
      "ambiguous format",
      "high-ambiguous",
      "eduhgAmbiguous",
      "2016-03-02",
      "education.highSchool.startDate",
    ],
    [
      "maxlength conflict",
      "high-length-conflict",
      "eduhgLengthConflict",
      "2016-03-02",
      "education.highSchool.startDate",
    ],
    [
      "pattern conflict",
      "pattern-conflict",
      "patternConflict",
      "2000-01-02",
      "personal.personal.birthDate",
    ],
    [
      "partial source date without fallback",
      "bad-month-source",
      "badMonthSource",
      "2023-02",
      "personal.personal.birthDate",
    ],
    [
      "invalid month source",
      "bad-month-source",
      "badMonthSource",
      "2023-13-01",
      "personal.personal.birthDate",
    ],
    [
      "invalid day even for month target",
      "invalid-day-month-source",
      "invalidDayMonthSource",
      "2023-02-29",
      "personal.personal.birthDate",
    ],
  ])(
    "blocks %s before selection or events",
    (_label, id, name, source, key) => {
      install();
      const profile = profileData();
      if (key === "personal.personal.birthDate")
        profile.personal.birthDate = source as string;
      const snapshot = collectFieldsSnapshot(document);
      const special =
        key === "personal.personal.birthDate"
          ? { [name as string]: key as string }
          : {};
      const plan = planFor(snapshot, profile, [name as string], special);
      const item = itemFor(snapshot, plan, name as string);
      const target = document.getElementById(id as string) as HTMLInputElement;
      const events = eventLog(target);
      expect(item).toMatchObject({
        status: "unavailable",
        selected: false,
        disabled: true,
      });
      const result = executeApprovedWrites({
        ...approve(plan.items, [item.candidateId]),
        registry: snapshot.registry,
      });
      expect(result[0]?.status).toBe("skipped");
      expect(target.value).toBe("");
      expect(events).toEqual([]);
    },
  );

  it.each([
    ["type", "email"],
    ["placeholder", "YYYY.MM.DD"],
    ["maxlength", "5"],
    ["pattern", "\\d{4}-\\d{2}"],
  ])("rejects approval after %s changes", (attribute, value) => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), ["eduhgStart"]);
    const item = itemFor(snapshot, plan, "eduhgStart", 0);
    const target = document.querySelector<HTMLInputElement>("#high-start-0")!;
    const events = eventLog(target);
    const decision = approve(plan.items, [item.candidateId]);
    target.setAttribute(attribute, value);
    const result = executeApprovedWrites({
      ...decision,
      registry: snapshot.registry,
    });
    expect(result[0]?.status).toBe("skipped");
    expect(target.value).toBe("");
    expect(events).toEqual([]);
  });

  it("rejects same-id element replacement after review", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), ["eduhgStart"]);
    const item = itemFor(snapshot, plan, "eduhgStart", 0);
    const old = document.querySelector<HTMLInputElement>("#high-start-0")!;
    const events = eventLog(old);
    const decision = approve(plan.items, [item.candidateId]);
    const replacement = old.cloneNode(true) as HTMLInputElement;
    old.replaceWith(replacement);
    const result = executeApprovedWrites({
      ...decision,
      registry: snapshot.registry,
    });
    expect(result[0]?.status).toBe("skipped");
    expect(replacement.value).toBe("");
    expect(events).toEqual([]);
  });

  it("preserves user edits made after review", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), ["eduhgStart"]);
    const item = itemFor(snapshot, plan, "eduhgStart", 0);
    const target = document.querySelector<HTMLInputElement>("#high-start-0")!;
    const events = eventLog(target);
    const decision = approve(plan.items, [item.candidateId]);
    target.value = "2017.01";
    const result = executeApprovedWrites({
      ...decision,
      registry: snapshot.registry,
    });
    expect(result[0]?.status).toBe("skipped");
    expect(target.value).toBe("2017.01");
    expect(events).toEqual([]);
  });

  it("does not report a site-reverted value as a successful settled write", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const plan = planFor(snapshot, profileData(), ["eduhgStart"]);
    const item = itemFor(snapshot, plan, "eduhgStart", 0);
    const target = document.querySelector<HTMLInputElement>("#high-start-0")!;
    const events = eventLog(target);
    target.addEventListener("input", () => {
      target.value = "2017.01";
    });
    const decision = approve(plan.items, [item.candidateId]);
    const results = await executeApprovedWritesAfterPageSettles({
      ...decision,
      registry: snapshot.registry,
      document,
    });
    expect(target.value).toBe("2017.01");
    expect(results[0]?.status).not.toBe("written");
    expect(events).toContain("input");
  });

  it("does not emit duplicate value events on an equivalent rerun", () => {
    install();
    const profile = profileData();
    const firstSnapshot = collectFieldsSnapshot(document);
    const firstPlan = planFor(firstSnapshot, profile, ["eduhgStart"]);
    const first = itemFor(firstSnapshot, firstPlan, "eduhgStart", 0);
    const target = document.querySelector<HTMLInputElement>("#high-start-0")!;
    const events = eventLog(target);
    expect(
      executeApprovedWrites({
        ...approve(firstPlan.items, [first.candidateId]),
        registry: firstSnapshot.registry,
      })[0]?.status,
    ).toBe("written");
    expect(target.value).toBe("2016.03");
    expect(events).toEqual(["input", "change"]);
    const secondSnapshot = collectFieldsSnapshot(document);
    const secondPlan = planFor(secondSnapshot, profile, ["eduhgStart"]);
    const second = itemFor(secondSnapshot, secondPlan, "eduhgStart", 0);
    expect(second.currentValue).toBe("2016.03");
    const result = executeApprovedWrites({
      ...approve(secondPlan.items, [second.candidateId]),
      registry: secondSnapshot.registry,
    });
    expect(result[0]?.status).toBeDefined();
    expect(target.value).toBe("2016.03");
    expect(events).toEqual(["input", "change"]);
  });

  it("requires health-date reveal and individual selection before the approved write", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const profile = profileData();
    const plan = planFor(snapshot, profile, ["healthDate"], {
      healthDate: "health.health.healthDate",
    });
    const masked = itemFor(snapshot, plan, "healthDate");
    const target = document.querySelector<HTMLInputElement>("#health-date")!;
    const events = eventLog(target);
    expect(masked).toMatchObject({
      status: "sensitive",
      previewValue: "••••••••",
      selected: false,
      revealed: false,
    });
    const unapproved = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set(),
      registry: snapshot.registry,
    });
    expect(unapproved[0]?.status).toBe("skipped");
    expect(target.value).toBe("");
    const revealed = revealSensitiveReviewItem(masked);
    expect(revealed).toMatchObject({
      revealed: true,
      previewValue: "2021.04.05",
      disabled: false,
    });
    const result = executeApprovedWrites({
      ...approve([revealed], [revealed.candidateId]),
      registry: snapshot.registry,
    });
    expect(result[0]?.status).toBe("written");
    expect(target.value).toBe("2021.04.05");
    expect(events).toEqual(["input", "change"]);
    expect(JSON.stringify(snapshot.request)).not.toContain("dateApproval");
  });
});

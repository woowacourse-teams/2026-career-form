import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../../profile/model";
import { collectFieldsSnapshot } from "../../dom/collect";
import { validateFieldsResponse } from "../../api/validate-response";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
import {
  captureGreetingResultTargets,
  recollectGreetingResultRegistry,
} from "../../workflow/greeting-result-registry";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://jobs.example.test/ko/o/1/apply" });
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이름<input name="basicInformation.name"></label></div>
    <div data-scope="field" data-part="root"><label>연락처<input name="basicInformation.phoneNumber.nationalNumber" type="tel"></label></div>
    <div data-scope="field" data-part="root"><label>영문이름<input name="basicInformation.englishName"></label></div>`;
});
afterEach(() => document.body.replaceChildren());

function plan(given = "Min Su", family = "Kim", currentValue = "") {
  const input = document.querySelector<HTMLInputElement>(
    '[name="basicInformation.englishName"]',
  )!;
  input.value = currentValue;
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => section.fields);
  const analysis = validateFieldsResponse(snapshot.request, {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fields.map((field) =>
      field.domName === "basicInformation.englishName"
        ? {
            candidateId: field.candidateId,
            matchType: "MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: {
              type: "DERIVED",
              recipe: "ENGLISH_FULL_NAME_GIVEN_FIRST",
            },
            writePlan: { command: "SET_TEXT" },
          }
        : {
            candidateId: field.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
    ),
  });
  const profile = createEmptyProfile();
  profile.personal.englishGivenName = given;
  profile.personal.englishFamilyName = family;
  const items = buildReviewPlan({
    analysis,
    profile,
    registry: snapshot.registry,
  }).items;
  const captured = captureGreetingResultTargets(snapshot.registry, items);
  return {
    input,
    items,
    snapshot,
    captured,
    write: () =>
      executeApprovedWritesAfterPageSettles({
        document,
        items,
        registry: snapshot.registry,
        approvedCandidateIds: new Set(
          items
            .filter((item) => item.selected && !item.disabled)
            .map((item) => item.candidateId),
        ),
        settledRegistry: () =>
          recollectGreetingResultRegistry(document, captured, items),
      }),
  };
}

it("writes given name then surname with one separating space through the existing derived binding", async () => {
  const { input, items, snapshot, captured, write } = plan(
    "  Min Su  ",
    "  Kim  ",
  );
  const item = items.find(
    (candidate) => candidate.analysis?.matchType === "MATCH",
  )!;
  expect(item.profileValue).toBe("Min Su Kim");
  const results = await write();
  expect(
    results.find((result) => result.candidateId === item.candidateId)?.status,
  ).toBe("written");
  expect(input.value).toBe("Min Su Kim");
  input.outerHTML =
    '<input name="basicInformation.englishName" value="Min Su Kim">';
  const refreshed = recollectGreetingResultRegistry(document, captured, items);
  expect(refreshed.lookupField(item.candidateId).status).toBe("ready");
  expect(snapshot.registry.lookupField(item.candidateId).status).toBe("stale");
});

it.each([
  ["", "Kim"],
  ["Min Su", ""],
  ["   ", "Kim"],
])("does not invent a missing component (%s / %s)", async (given, family) => {
  const { input, write } = plan(given, family);
  expect((await write()).every((result) => result.status === "skipped")).toBe(
    true,
  );
  expect(input.value).toBe("");
});

it("preserves an existing English name", async () => {
  const { input, write } = plan("Min Su", "Kim", "Existing Name");
  expect((await write()).every((result) => result.status === "skipped")).toBe(
    true,
  );
  expect(input.value).toBe("Existing Name");
});

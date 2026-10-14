import { afterEach, expect, it, vi } from "vitest";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { createStaticFieldsSession } from "./static-fields-session";
afterEach(() => document.body.replaceChildren());
function setup() {
  document.body.innerHTML =
    '<label>이름<input id="person" name="person"></label>';
  const analyzeFields = vi.fn(
    async (request: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse> => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: request.sections
        .flatMap((section) => [
          ...section.fields,
          ...(section.items ?? []).flatMap((item) => item.fields),
        ])
        .map((field) => ({
          candidateId: field.candidateId,
          matchType: "MATCH",
          profileFieldKey: "personal.name",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          writePlan: { command: "SET_TEXT" },
        })),
    }),
  );
  const client = { analyzeFields } as unknown as AnalysisApiClient;
  return { client, analyzeFields, analyze: createStaticFieldsSession(client) };
}
it("reuses the first mapping with a fresh snapshot", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  const next = collectFieldsSnapshot(document);
  const result = await run.analyze(next);
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
  expect(result.snapshotId).toBe(next.request.snapshotId);
  expect(result.fields[0]).toMatchObject({
    matchType: "MATCH",
    profileFieldKey: "personal.name",
  });
});
it("defers a replacement even with identical attributes", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  const input = document.querySelector("input")!;
  input.replaceWith(input.cloneNode(true));
  const result = await run.analyze(collectFieldsSnapshot(document));
  expect(result.fields[0]).toMatchObject({
    matchType: "NO_MATCH",
    interactionStatus: "BLOCKED",
  });
  expect(result.analysisStatus).toBe("PARTIAL");
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
});
it("defers changed and new fields without another request", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  document.querySelector("input")!.name = "different";
  document.body.insertAdjacentHTML(
    "beforeend",
    '<label>추가<input id="extra"></label>',
  );
  const result = await run.analyze(collectFieldsSnapshot(document));
  expect(result.fields.map((field) => field.matchType)).toEqual([
    "NO_MATCH",
    "NO_MATCH",
  ]);
  expect(result.warningCodes).toContain("UNRESOLVED_FIELD");
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
});
it("shares in-flight analysis and isolates a new run", async () => {
  const run = setup();
  await Promise.all([
    run.analyze(collectFieldsSnapshot(document)),
    run.analyze(collectFieldsSnapshot(document)),
  ]);
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
  await createStaticFieldsSession(run.client)(collectFieldsSnapshot(document));
  expect(run.analyzeFields).toHaveBeenCalledTimes(2);
});
it("does not retry a failed first request", async () => {
  const run = setup();
  run.analyzeFields.mockRejectedValue(new Error("unavailable"));
  await expect(run.analyze(collectFieldsSnapshot(document))).rejects.toThrow(
    "unavailable",
  );
  await expect(run.analyze(collectFieldsSnapshot(document))).rejects.toThrow(
    "unavailable",
  );
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
});

it("refreshes changed fields only after a write pass and supports later changes", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  const input = document.querySelector("input")!;
  input.name = "second";
  expect(
    (await run.analyze(collectFieldsSnapshot(document))).fields[0]?.matchType,
  ).toBe("NO_MATCH");
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(true);
  expect(
    (await run.analyze(collectFieldsSnapshot(document))).fields[0]?.matchType,
  ).toBe("MATCH");
  input.name = "third";
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(true);
  expect(run.analyzeFields).toHaveBeenCalledTimes(3);
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(false);
});

it("stops repeated replacement of the same structure instead of looping", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  let input = document.querySelector("input")!;
  input.replaceWith(input.cloneNode(true));
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(true);
  input = document.querySelector("input")!;
  input.replaceWith(input.cloneNode(true));
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(false);
  expect(
    (await run.analyze(collectFieldsSnapshot(document))).fields[0]?.matchType,
  ).toBe("NO_MATCH");
  expect(run.analyzeFields).toHaveBeenCalledTimes(2);
});

it("does not refresh for value-only changes or hidden or ineligible fields", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  const input = document.querySelector("input")!;
  input.value = "already entered";
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(false);
  input.hidden = true;
  expect(
    await run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).toBe(false);
  input.hidden = false;
  input.name = "changed";
  expect(
    await run.analyze.refreshAfterPass(
      collectFieldsSnapshot(document),
      () => false,
    ),
  ).toBe(false);
  expect(run.analyzeFields).toHaveBeenCalledTimes(1);
});

it("does not retry failed refresh requests during the same run", async () => {
  const run = setup();
  await run.analyze(collectFieldsSnapshot(document));
  document.querySelector("input")!.name = "changed";
  run.analyzeFields.mockRejectedValue(new Error("unavailable"));
  await expect(
    run.analyze.refreshAfterPass(collectFieldsSnapshot(document)),
  ).rejects.toThrow("unavailable");
  await expect(run.analyze(collectFieldsSnapshot(document))).rejects.toThrow(
    "unavailable",
  );
  expect(run.analyzeFields).toHaveBeenCalledTimes(2);
});

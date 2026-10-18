import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { getWorkflowAdapter } from "../adapters/workflow";
import type { FieldsAnalyzeRequest } from "../api/types";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { createAnalyzeFields } from "../workflow/workflow-analysis";
import type { WorkflowAnalysisContext } from "../workflow/workflow-analysis-types";

afterEach(() => {
  installExecutionPolicy(document);
  document.body.replaceChildren();
});

describe("the omitted workflow collector injection", () => {
  it.each([
    ["lg-ai-research-birth-split-email", false],
    ["sk-careers-application-form", true],
  ] as const)(
    "keeps the default request bytes and registry for %s",
    async (name, policy) => {
      document.body.innerHTML = readFileSync(
        join(process.cwd(), "fixtures/dom-snapshots", name, "sanitized.html"),
        "utf8",
      );
      if (policy) installExecutionPolicy(document, fixturePolicy("sk"));
      const expected = await collectFieldsSnapshotWithDropdowns(document);
      const profile = createEmptyProfile();
      let request: FieldsAnalyzeRequest | undefined;
      let actual: typeof expected | undefined;
      const context: WorkflowAnalysisContext = {
        adapter: getWorkflowAdapter(document),
        apiClient: {
          analyzePreparation: async () => {
            throw new Error("not a preparation test");
          },
          analyzeFields: async (snapshot) => {
            request = snapshot;
            return {
              snapshotId: snapshot.snapshotId,
              mode: "ADAPTER",
              analysisStatus: "COMPLETE",
              fields: [],
            };
          },
        },
        addressRun: { current: { controller: new AbortController() } },
        addressSearch: async () => false,
        pageDocument: document,
        repository: { load: async () => profile },
        approvedSensitiveValues: { current: new Map() },
        consideredSensitiveValues: { current: new Map() },
        freshDefaultControls: { current: new WeakSet() },
        completedDriverKeys: { current: new Set() },
        completedGenericStateDrivers: { current: new Map() },
        deferredDriverGroups: { current: new Set() },
        setAddressResult: () => undefined,
        setExceptionTitle: () => undefined,
        setStage: () => undefined,
        setFieldsSnapshot: (next) => {
          if (typeof next !== "function") actual = next;
        },
        setReviewItems: () => undefined,
        setPartial: () => undefined,
        setWarnings: () => undefined,
        setResults: () => undefined,
      };
      // No collectFields or genericStructure is supplied.
      await createAnalyzeFields(context)(profile);
      const bytes = (value: unknown) =>
        JSON.stringify(value, (key, item) =>
          key === "snapshotId" ? "snapshot" : item,
        );
      expect(request).toBeDefined();
      expect(bytes(request)).toBe(bytes(expected.request));
      expect(actual).toBeDefined();
      const handles = (snapshot: typeof expected) =>
        snapshot.request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .map(({ candidateId }) => {
            const lookup = snapshot.registry.lookupField(candidateId);
            if (!("handle" in lookup)) return [candidateId, lookup.status];
            return [
              candidateId,
              lookup.status,
              lookup.handle.itemIndex,
              lookup.handle.itemGroupId,
              !!lookup.handle.mixedSectionRow,
              snapshot.registry.fieldItemCount(candidateId),
            ];
          });
      expect(bytes(handles(actual!))).toBe(bytes(handles(expected)));
    },
    180_000,
  );
});

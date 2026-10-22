import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../interaction", () => ({
  executeReadonlySearch: vi.fn(),
}));

import { executeReadonlySearch } from "../interaction";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";
import { executeApprovedSearchWrites } from "./search-executor";
import type { ApprovedWriteResult } from "./write-result";

afterEach(() => {
  vi.mocked(executeReadonlySearch).mockReset();
  document.body.innerHTML = "";
});

describe("search follow-up hold scope", () => {
  it.each([
    "closed",
    "open",
    "same-group",
    "same-row",
    "unknown-effect",
    "value-observed",
    "unknown-boundary",
    "changed-boundary",
    "unverified-selection",
    "no-later-entry",
    "later-conflict",
  ] as const)(
    "continues fifteen unrelated approved controls after an unsupported search is safely closed: %s",
    async (scenario) => {
      document.body.innerHTML = `
      <section><dl><dt>Lookup field</dt><dd>
        <input aria-label="Lookup field" readonly data-target>
        <button type="button" aria-controls="lookup-layer" data-open>Search</button>
      </dd></dl></section>
      <div id="lookup-layer" role="dialog" style="display:none">
        <input type="search" aria-label="Search query">
        <button type="button" data-search>Search</button>
        <button type="button" data-close>Close</button>
      </div>
      ${Array.from(
        { length: 15 },
        (_, index) =>
          `<section><label>Neutral field ${index + 1}<input data-later></label></section>`,
      ).join("")}`;
      if (scenario === "same-group" || scenario === "same-row") {
        const group = document.querySelector("section")!;
        if (scenario === "same-row") {
          const row = document.createElement("div");
          row.setAttribute("data-repeater-item", "");
          row.append(...group.childNodes);
          group.append(row);
          row.append(document.querySelector("[data-later]")!.closest("label")!);
        } else {
          group.append(
            document.querySelector("[data-later]")!.closest("label")!,
          );
        }
      }
      if (scenario === "unknown-boundary") {
        document
          .querySelector("section")!
          .replaceWith(...document.querySelector("section")!.childNodes);
      }
      const layer = document.querySelector<HTMLElement>("#lookup-layer")!;
      const target = document.querySelector<HTMLInputElement>("[data-target]")!;
      document.querySelector("[data-open]")!.addEventListener("click", () => {
        layer.style.display = "block";
      });
      document.querySelector("[data-close]")!.addEventListener("click", () => {
        layer.style.display = "none";
      });

      const snapshot = collectFieldsSnapshot(document);
      const fields = snapshot.request.sections.flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ]);
      const inputs = [
        target,
        ...document.querySelectorAll<HTMLInputElement>("[data-later]"),
      ];
      const items: ReviewPlanItem[] = inputs.map((input, index) => {
        const candidateId = fields.find((field) => {
          const lookup = snapshot.registry.lookupField(field.candidateId);
          return "handle" in lookup && lookup.handle.elements[0] === input;
        })!.candidateId;
        return {
          candidateId,
          fieldLabel: `Neutral field ${index}`,
          // Singleton controls do not necessarily have a repeated profile entry.
          ...(index && scenario !== "no-later-entry"
            ? { profileEntryId: `independent-entry-${index}` }
            : {}),
          currentValue: "",
          profileValue: `synthetic-${index}`,
          previewValue: `synthetic-${index}`,
          status: "needs-review",
          selected: true,
          disabled: false,
          revealed: true,
          reason: "",
          analysis: {
            candidateId,
            matchType: "MATCH",
            mappingStatus: "LLM_SUGGESTED",
            autofillPolicy: "CONDITIONAL",
            interactionStatus: "READY",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: index
                ? "languages.languageTest.registrationNo"
                : "contact.contact.addressLine1",
            },
            writePlan: { command: index ? "SET_TEXT" : "SEARCH_SELECTION" },
          },
        };
      });
      const approvedCandidateIds = new Set(
        items.map((item) => item.candidateId),
      );
      const results: ApprovedWriteResult[] = items.map(({ candidateId }) => ({
        candidateId,
        status: "skipped",
        reason: "pending",
      }));
      // Isolate the scope decision, not the search engine: a search started,
      // could not verify its query, and safely closed without selecting a result.
      vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
        document.querySelector<HTMLButtonElement>("[data-open]")!.click();
        if (scenario !== "open")
          document.querySelector<HTMLButtonElement>("[data-close]")!.click();
        if (scenario === "changed-boundary")
          document.querySelectorAll("section")[1]!.append(target);
        if (scenario === "later-conflict")
          inputs[1]!.value = "existing-synthetic";
        return {
          status: "failed",
          targetCandidateId: args.targetCandidateId,
          reason:
            scenario === "unverified-selection"
              ? "selection_effect_unverified"
              : "search_query_not_found",
          effect:
            scenario === "unknown-effect"
              ? undefined
              : scenario === "value-observed"
                ? "value-observed"
                : "interaction-started",
          ...(scenario === "open" ? { surfaceLeftOpen: true as const } : {}),
        };
      });
      await executeApprovedSearchWrites({
        items,
        approvedCandidateIds,
        registry: snapshot.registry,
        results,
        followUpHaltScope: "row",
        writeOrdinary: (item) =>
          executeApprovedWrites({
            items: [item],
            approvedCandidateIds,
            registry: snapshot.registry,
          })[0]!,
      });

      expect(executeReadonlySearch).toHaveBeenCalledTimes(1);
      expect(results[0]).toMatchObject({ code: "UNSUPPORTED_CONTROL" });
      if (
        [
          "open",
          "unknown-effect",
          "value-observed",
          "unknown-boundary",
          "changed-boundary",
          "unverified-selection",
        ].includes(scenario)
      ) {
        expect(results.slice(1)).toEqual(
          Array.from({ length: 15 }, () =>
            expect.objectContaining({
              code: "STALE_TARGET",
              failureCode: "SEARCH_FOLLOWUP_HALTED",
            }),
          ),
        );
        expect(inputs.slice(1).map((input) => input.value)).toEqual(
          Array(15).fill(""),
        );
        if (scenario === "open") {
          expect(results[0]).toHaveProperty("surfaceLeftOpen", true);
          expect(layer.style.display).toBe("block");
        }
        return;
      }
      expect(results[0]).not.toHaveProperty("surfaceLeftOpen");
      expect(layer.style.display).toBe("none");
      expect(target.value).toBe("");
      if (scenario === "later-conflict") {
        expect(results[1]).toMatchObject({ code: "CONFLICT" });
        expect(inputs[1]!.value).toBe("existing-synthetic");
        expect(results.slice(2).map((result) => result.code)).toEqual(
          Array(14).fill("WRITTEN"),
        );
        return;
      }
      if (scenario === "same-group" || scenario === "same-row") {
        expect(results[1]).toMatchObject({
          code: "STALE_TARGET",
          failureCode: "SEARCH_FOLLOWUP_HALTED",
        });
        expect(inputs[1]!.value).toBe("");
        expect(results.slice(2).map((result) => result.code)).toEqual(
          Array(14).fill("WRITTEN"),
        );
        return;
      }
      const failureCodes = results
        .slice(1)
        .map((result) =>
          result.status === "skipped" ? result.failureCode : undefined,
        );
      expect(
        results.slice(1).map((result) => result.code),
        `Later failure codes: ${JSON.stringify(failureCodes)}`,
      ).toEqual(Array(15).fill("WRITTEN"));
    },
  );
});

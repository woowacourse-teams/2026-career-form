import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FieldCandidate } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { gradeGenericField } from "./field-grading";

afterEach(() => document.body.replaceChildren());

function grade(
  candidate: FieldCandidate,
  key: string,
  confidence = 0.95,
  hints: { title?: string; placeholder?: string } = {},
) {
  return gradeGenericField({
    ...candidate.semanticContext,
    ...hints,
    displayName: candidate.displayName,
    profileFieldKey: key,
    confidence,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: candidate.control,
    options: candidate.options,
  });
}

const sites = ["lg-ai-research-birth-split-email", "ahnlab-write-resume-form"];

function fixtureField(site: string, mutate?: (element: HTMLInputElement) => void) {
  document.body.innerHTML = readFileSync(
    join(process.cwd(), `fixtures/dom-snapshots/${site}/sanitized.html`),
    "utf8",
  );
  const element = document.querySelector<HTMLInputElement>('input[type="text"]')!;
  mutate?.(element);
  const snapshot = collectFieldsSnapshot(document);
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]).find((candidate) => {
    const lookup = snapshot.registry.lookupField(candidate.candidateId);
    return "handle" in lookup && lookup.handle.elements.includes(element);
  })!;
}

// Independent sanitized structures with in-memory semantic/format mutations.
// These are code-check evidence, not predictions of a live backend's mapping.
describe.each(sites)("generic context and format checks: %s", (site) => {
  it.each([
    ["title", "ZIP code"],
    ["placeholder", "우편번호"],
  ])("checks postal text in its own %s", (source, text) => {
    const candidate = fixtureField(site);
    expect(grade(candidate, "contact.contact.addressLine1", 0.95, {
      [source]: text,
    })).toEqual({ grade: "BLOCKED", reason: "FORMAT_KEY_MISMATCH" });
    expect(grade(candidate, "contact.contact.postalCode", 0.95, {
      [source]: text,
    }).grade).toBe("AUTO");
  });

  it("never AUTO-selects a high-confidence candidate after all name and context evidence is removed", () => {
    const candidate = fixtureField(site);
    const unnamed = {
      ...candidate,
      displayName: undefined,
      semanticContext: { ...candidate.semanticContext, labels: [] },
    };
    expect(grade(unnamed, "personal.personal.koreanFamilyName")).toEqual({
      grade: "REVIEW",
      reason: "NO_FIELD_CONTEXT",
    });
    expect(grade(unnamed, "personal.personal.koreanFamilyName", 0.4)).toEqual({
      grade: "BLOCKED",
      reason: "LOW_CONFIDENCE",
    });
    expect(grade(candidate, "personal.personal.koreanFamilyName").grade).toBe("AUTO");
    expect(grade({
      ...unnamed,
      semanticContext: {
        ...unnamed.semanticContext,
        labels: [{ source: "section-heading", text: "지원자" }],
      },
    }, "personal.personal.koreanFamilyName").grade).toBe("AUTO");
  });

  it.each(["autocomplete", "numeric-length"])(
    "rejects address lines on a postal-format field identified by %s",
    (hint) => {
      const candidate = fixtureField(site, (element) => {
        if (hint === "autocomplete") element.autocomplete = "postal-code";
        else {
          element.maxLength = 6;
          element.inputMode = "numeric";
        }
      });
      for (const key of [
        "contact.contact.addressLine1",
        "contact.contact.addressLine2",
        "contact.contact.residenceCountry",
      ]) {
        expect(grade(candidate, key)).toEqual({
          grade: "BLOCKED",
          reason: "FORMAT_KEY_MISMATCH",
        });
      }
      expect(grade(candidate, "contact.contact.postalCode").grade).toBe("AUTO");
    },
  );

  it.each([
    ["email", "contact.contact.phoneNumber", "contact.contact.secondaryEmail"],
    ["tel", "contact.contact.email", "contact.contact.emergencyPhoneNumber"],
  ])("checks %s inputs against the profile field's actual type", (type, wrong, right) => {
    const candidate = fixtureField(site, (element) => { element.type = type; });
    expect(grade(candidate, wrong)).toEqual({
      grade: "BLOCKED",
      reason: "FORMAT_KEY_MISMATCH",
    });
    expect(grade(candidate, right).grade).toBe("AUTO");
  });
});

describe("postal hint boundaries", () => {
  it.each([
    [7, "numeric"],
    [6, "text"],
    [undefined, "numeric"],
  ] as const)("does not infer postal format from length %s and mode %s", (maxLength, inputMode) => {
    expect(grade({
      candidateId: "plain",
      element: "input",
      control: "text",
      visibility: "visible",
      displayName: "기본주소",
      semanticContext: { maxLength, inputMode },
    }, "contact.contact.addressLine1").grade).toBe("AUTO");
  });
});

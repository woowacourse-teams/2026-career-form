import { afterEach, expect, it } from "vitest";
import type { MatchedFieldAnalysis } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { createStructuralSignature } from "../../dom/candidate-registry";
import type { ActionCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { skWorkflowAdapter as adapter } from "./workflow";
import { skWriteAdapter } from "./write";

const cases = [
  { name: "prsVeteranBenefitYN", key: "veteran.veteran.veteranStatus" },
  { name: "prsDisabledYN", key: "disability.disability.disabilityStatus" },
].flatMap((field) => ["대상", "비대상"].map((value) => ({ ...field, value })));
afterEach(() => document.body.replaceChildren());

function setup(name: string, key: string, value: string) {
  const code = value === "대상" ? "1" : "0";
  document.body.innerHTML =
    '<section><label><input type="radio" name="' +
    name +
    '" value="0">비대상</label><label><input type="radio" name="' +
    name +
    '" value="1">대상</label></section>';
  const target = document.querySelector<HTMLInputElement>(
    '[value="' + code + '"]',
  )!;
  const opposite = document.querySelector<HTMLInputElement>(
    '[value="' + (code === "1" ? "0" : "1") + '"]',
  )!;
  opposite.checked = true;
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((field) => field.domName === name)!;
  const found = snapshot.registry.lookupField(field.candidateId);
  if (found.status !== "ready") throw new Error("Fixture field unavailable");
  const analysis: MatchedFieldAnalysis = {
    candidateId: field.candidateId,
    matchType: "MATCH",
    valueBinding: {
      type: "DERIVED",
      recipe: "BOOLEAN_YN",
      profileFieldKey: key,
      trueLabel: "대상",
      falseLabel: "비대상",
    },
    autofillPolicy: "ALLOWED",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command: "CHECK_RADIO" },
  };
  const item: ReviewPlanItem = {
    candidateId: field.candidateId,
    fieldLabel: name,
    currentValue: opposite.value,
    profileValue: value,
    previewValue: value,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis,
  };
  const action: ActionCandidateHandle = {
    kind: "action",
    candidateId: "target",
    sectionId: "section",
    element: target,
    signature: createStructuralSignature([target]),
    candidate: {
      candidateId: "target",
      element: "input",
      control: "radio",
      visibility: "visible",
      domName: name,
      displayName: value,
    },
  };
  return { target, opposite, handle: found.handle, analysis, item, action };
}

it.each(cases)(
  "prepares and reveals $name using profile $value over the existing opposite",
  ({ name, key, value }) => {
    const { target, action } = setup(name, key, value);
    expect(adapter.canSelectProfileOption?.(action, value)).toBe(true);
    expect(
      adapter.selectReveal(
        document,
        { domName: name, profileFieldKey: key, itemIndex: 0 },
        value,
      ),
    ).toEqual({ code: "SELECTED", count: 1 });
    expect(target.checked).toBe(true);
  },
);

it.each(cases)(
  "writes verified $name as $value and does not repeat its change event",
  ({ name, key, value }) => {
    const { target, handle, analysis, item } = setup(name, key, value);
    expect(adapter.prefersProfileValue?.(handle, analysis)).toBe(true);
    let changes = 0;
    target.addEventListener("change", () => changes++);
    expect(skWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(target.checked).toBe(true);
    expect(skWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(changes).toBe(1);
  },
);

it.each(["LLM_SUGGESTED", "UNVERIFIED"] as const)(
  "does not authorize override with %s mapping",
  (mappingStatus) => {
    const { target, handle, analysis, item } = setup(
      "prsVeteranBenefitYN",
      "veteran.veteran.veteranStatus",
      "대상",
    );
    const unverified = { ...analysis, mappingStatus } as MatchedFieldAnalysis;
    expect(adapter.prefersProfileValue?.(handle, unverified)).not.toBe(true);
    expect(
      skWriteAdapter.tryWrite(handle, { ...item, analysis: unverified }),
    ).toEqual({ handled: true, written: false });
    expect(target.checked).toBe(false);
  },
);

it.each(["name", "label", "code", "removed"])(
  "rejects a radio group changed during click: %s",
  (mutation) => {
    const { target, handle, item } = setup(
      "prsDisabledYN",
      "disability.disability.disabilityStatus",
      "대상",
    );
    target.addEventListener("change", () => {
      if (mutation === "name") target.name = "changed";
      if (mutation === "code") target.value = "9";
      if (mutation === "label") target.labels![0].append("wrong");
      if (mutation === "removed") target.remove();
    });
    expect(skWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  },
);

it.each(cases)(
  "does not use a different profile field to replace $name",
  ({ name, key, value }) => {
    const { target, action } = setup(name, key, value);
    expect(
      adapter.canSelectProfileOption?.(action, value, "contact.contact.email"),
    ).toBe(false);
    expect(
      adapter.selectReveal(
        document,
        {
          domName: name,
          profileFieldKey: "contact.contact.email",
          itemIndex: 0,
        },
        value,
      ),
    ).toEqual({ code: "PROFILE_NOT_SELECTED", count: 1 });
    expect(target.checked).toBe(false);
  },
);

import { describe, expect, it } from "vitest";

import type { TargetIdentity } from "./readonly-search";
import {
  bindSelectionEffects,
  verifySelectionEffects,
} from "./search-selection-effects";

function setup(
  candidateMarkup = '<button data-code="code-1">합성 자격</button>',
) {
  document.body.innerHTML = `
    <div id="application">
    <div data-repeater-item>
      <input id="target" readonly value="">
      <input id="code" type="hidden" value="">
      <input id="date" value="2026.01.01">
    </div>
    <div id="results">${candidateMarkup}</div>
    </div>
  `;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const row = target.closest("[data-repeater-item]")!;
  const candidate = document.querySelector<HTMLElement>("#results > *")!;
  const identity: TargetIdentity = {
    target,
    fieldGroup: row,
    repeatRow: row,
    fieldSignature: "synthetic",
    openers: [],
    openerSignatures: [],
  };
  return {
    target,
    code: document.querySelector<HTMLInputElement>("#code")!,
    date: document.querySelector<HTMLInputElement>("#date")!,
    candidate,
    identity,
  };
}

function addOtherFormSection(test: ReturnType<typeof setup>): HTMLElement {
  const formerParent = test.identity.repeatRow!.parentElement!;
  const form = document.createElement("form");
  formerParent.replaceWith(form);
  form.append(formerParent);
  const section = document.createElement("section");
  form.append(section);
  return section;
}

describe("generic search selection effects", () => {
  it("refuses a result click when a related hidden value cannot be bound before selection", () => {
    const test = setup("<button>합성 자격</button>");
    expect(() =>
      bindSelectionEffects(test.identity, test.candidate, ["합성 자격"]),
    ).toThrowError(
      expect.objectContaining({ reason: "selection_effect_unverified" }),
    );
  });

  it("verifies the reflected name and explicitly bound hidden code without changing peers", () => {
    const test = setup();
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";

    expect(() => verifySelectionEffects(binding)).not.toThrow();
  });

  it("rejects an unexpected peer-field change after the allowed click", () => {
    const test = setup();
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);
    test.target.value = "합성 자격";
    test.code.value = "code-1";
    test.date.value = "변경됨";

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("continues to protect an empty text peer while reserving only selects for follow-up", () => {
    const test = setup();
    const emptyIssuer = document.createElement("input");
    emptyIssuer.value = "";
    test.identity.repeatRow!.append(emptyIssuer);
    const deferredGrade = document.createElement("select");
    deferredGrade.disabled = true;
    deferredGrade.append(new Option("선택", ""));
    test.identity.repeatRow!.append(deferredGrade);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    emptyIssuer.value = "예상 밖 기관";
    deferredGrade.disabled = false;
    deferredGrade.append(new Option("기사", "기사"));

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("allows an existing disabled text control to become available without changing its value", () => {
    const test = setup();
    const issuer = document.createElement("input");
    issuer.disabled = true;
    test.identity.repeatRow!.append(issuer);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    issuer.disabled = false;

    expect(() => verifySelectionEffects(binding)).not.toThrow();
  });

  it("still rejects an existing textarea value mutation during result selection", () => {
    const test = setup();
    const textarea = document.createElement("textarea");
    test.identity.repeatRow!.append(textarea);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    textarea.value = "unexpected value";

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("rejects availability changes to controls in another row", () => {
    const test = setup();
    const otherRow = document.createElement("div");
    const external = document.createElement("input");
    external.disabled = true;
    otherRow.append(external);
    test.identity.repeatRow!.after(otherRow);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    external.disabled = false;

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("protects values in another section of the same application form", () => {
    const test = setup();
    const otherSection = addOtherFormSection(test);
    const external = document.createElement("input");
    external.value = "기존 지원서 값";
    otherSection.append(external);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    external.value = "변경된 지원서 값";

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("rejects disabled changes in another section of the same application form", () => {
    const test = setup();
    const otherSection = addOtherFormSection(test);
    const external = document.createElement("input");
    external.disabled = true;
    otherSection.append(external);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    external.disabled = false;

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });

  it("allows option and disabled changes on an initially empty enabled same-row select", () => {
    const test = setup();
    const grade = document.createElement("select");
    grade.append(new Option("선택", ""), new Option("기사", "engineer"));
    test.identity.repeatRow!.append(grade);
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    grade.disabled = true;
    grade.replaceChildren(new Option("급수 선택", ""), new Option("1급", "1"));

    expect(() => verifySelectionEffects(binding)).not.toThrow();
  });

  it("continues to reject changes to an existing nonempty same-row select value", () => {
    const test = setup();
    const grade = document.createElement("select");
    grade.append(
      new Option("기사", "engineer"),
      new Option("산업기사", "industrial"),
    );
    test.identity.repeatRow!.append(grade);
    grade.value = "engineer";
    const binding = bindSelectionEffects(test.identity, test.candidate, [
      "합성 자격",
    ]);

    test.target.value = "합성 자격";
    test.code.value = "code-1";
    grade.value = "industrial";

    expect(() => verifySelectionEffects(binding)).toThrowError(
      expect.objectContaining({ reason: "selection_postcondition_failed" }),
    );
  });
});

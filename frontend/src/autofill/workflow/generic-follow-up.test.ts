import { afterEach, describe, expect, it } from "vitest";

import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  genericControlledRegions,
  isGenericStateDriver,
  waitForGenericEffect,
} from "./generic-follow-up";

function driverItem(command: "SELECT_OPTION" | "CHECK_RADIO" | "SET_TEXT") {
  return {
    analysis: {
      mappingStatus: "LLM_SUGGESTED",
      writePlan: { command },
    },
  } as ReviewPlanItem;
}

function handle(element: HTMLElement): FieldCandidateHandle {
  return { elements: [element] } as FieldCandidateHandle;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("generic conditional follow-up safety", () => {
  it("recollects only one explicit local region containing an editable field", () => {
    document.body.innerHTML =
      '<button aria-controls="dependent">continue</button><section id="dependent"><input></section>';
    const button = document.querySelector<HTMLButtonElement>("button")!;

    expect(genericControlledRegions(handle(button))).toEqual([
      document.querySelector("#dependent"),
    ]);
    expect(
      isGenericStateDriver(driverItem("SELECT_OPTION"), handle(button)),
    ).toBe(true);
  });

  it("rejects ambiguous, self-controlled, listbox, and non-editable regions", () => {
    document.body.innerHTML = `
      <button id="many" aria-controls="one two">many</button>
      <section id="one"><input></section><section id="two"><input></section>
      <section id="self"><button id="self-driver" aria-controls="self">self</button><input></section>
      <button id="listbox-driver" aria-controls="choices">choices</button>
      <section id="choices" role="listbox"><input></section>
      <button id="text-driver" aria-controls="text-only">text</button>
      <section id="text-only">description only</section>
    `;

    for (const id of ["many", "self-driver", "listbox-driver", "text-driver"]) {
      expect(
        genericControlledRegions(handle(document.querySelector(`#${id}`)!)),
      ).toEqual([]);
    }
  });

  it("does not treat static writes or adapter mappings as generic state drivers", () => {
    document.body.innerHTML =
      '<button aria-controls="dependent">continue</button><section id="dependent"><input></section>';
    const button = document.querySelector<HTMLButtonElement>("button")!;

    expect(isGenericStateDriver(driverItem("SET_TEXT"), handle(button))).toBe(
      false,
    );
    const adapterItem = driverItem("CHECK_RADIO");
    adapterItem.analysis!.mappingStatus = "ADAPTER_VERIFIED";
    expect(isGenericStateDriver(adapterItem, handle(button))).toBe(false);
  });

  it("requires controlled regions to remain connected and visible before continuing", async () => {
    document.body.innerHTML = '<section id="dependent"><input></section>';
    const target = document.querySelector<HTMLElement>("#dependent")!;

    await expect(
      waitForGenericEffect([target], new AbortController().signal),
    ).resolves.toBe(true);

    target.remove();
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForGenericEffect([target], controller.signal),
    ).resolves.toBe(false);
  });
});

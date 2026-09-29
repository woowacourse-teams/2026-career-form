import { afterEach, describe, expect, it } from "vitest";

import { elementSignature, type TargetIdentity } from "./readonly-search";
import { queryControls } from "./search-controls";
import { SearchSession } from "./search-session";
import { observeSearchSurfaces } from "./search-surface-detector";

const layer = (id: string, heading = "학교명 조회") =>
  `<div id="${id}" hidden><h4>${heading}</h4><div><input type="text"><button type="button">검색</button></div><ul></ul><input type="text" hidden><button type="button">닫기</button></div>`;

const fieldGroup = (index: number, inner = "") =>
  `<div class="search" id="group${index}"><label for="target${index}">학교명</label><input id="target${index}" readonly><button id="opener${index}" type="button">검색</button>${inner}</div>`;

function start(index = 0, repeatRow?: Element) {
  const target = document.querySelector<HTMLInputElement>(`#target${index}`)!;
  const opener = document.querySelector<HTMLButtonElement>(`#opener${index}`)!;
  const identity: TargetIdentity = {
    target,
    fieldGroup: document.querySelector(`#group${index}`)!,
    ...(repeatRow ? { repeatRow } : {}),
    fieldSignature: elementSignature(target),
    openers: [opener],
    openerSignatures: [elementSignature(opener)],
  };
  const session = new SearchSession({
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: "<학교명>",
  });
  sessions.push(session);
  return {
    opener,
    observation: observeSearchSurfaces(document, identity, session),
  };
}

const sessions: SearchSession[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
  document.body.replaceChildren();
});

const show = (id: string) => {
  document.getElementById(id)!.hidden = false;
};

describe("role-less same-document layer (C9)", () => {
  it("accepts a layer inside the search group when the target has no repeat row", () => {
    document.body.innerHTML = fieldGroup(0, layer("layer"));
    const { opener, observation } = start();
    show("layer");
    const surface = observation.discover(opener);
    expect(surface?.kind).toBe("same-document-layer");
    expect(surface?.container).toBe(document.getElementById("layer"));
    expect(surface?.modal).toBeUndefined();
  });

  it("checks the repeat row boundary when the target has a repeat row", () => {
    document.body.innerHTML = `<div class="rows"><div class="edu-item" id="row0">${fieldGroup(0, layer("layer0"))}</div><div class="edu-item" id="row1">${fieldGroup(1, layer("layer1"))}</div></div>`;
    const row0 = document.getElementById("row0")!;
    const own = start(0, row0);
    show("layer0");
    expect(own.observation.discover(own.opener)?.kind).toBe(
      "same-document-layer",
    );
    document.getElementById("layer0")!.hidden = true;

    const foreign = start(0, document.getElementById("row1")!);
    show("layer0");
    expect(() => foreign.observation.discover(foreign.opener)).toThrow(
      "surface_unobservable",
    );
  });

  it("rejects another row's layer without a shared subject", () => {
    document.body.innerHTML =
      fieldGroup(0) + fieldGroup(1, layer("layer1", "주소 찾기"));
    const { opener, observation } = start(0);
    show("layer1");
    expect(() => observation.discover(opener)).toThrow("surface_unobservable");
  });

  it("accepts an outside layer by shared subject and search wording", () => {
    document.body.innerHTML = fieldGroup(0) + layer("layer", "학교 검색");
    const { opener, observation } = start(0);
    show("layer");
    expect(observation.discover(opener)?.kind).toBe("same-document-layer");
  });

  it("reports two newly shown layers as ambiguous", () => {
    document.body.innerHTML =
      fieldGroup(0, layer("a")) + layer("b", "학교 검색");
    const { opener, observation } = start(0);
    show("a");
    show("b");
    expect(() => observation.discover(opener)).toThrow("surface_ambiguous");
  });

  it("drops document-wide candidates beyond the traversal budget", () => {
    const filler = "<div></div>".repeat(2100);
    document.body.innerHTML =
      fieldGroup(0) + filler + layer("layer", "학교 검색");
    const outside = start(0);
    show("layer");
    expect(outside.observation.discover(outside.opener)).toBeUndefined();

    document.body.innerHTML = fieldGroup(0, layer("inner")) + filler;
    const inside = start(0);
    show("inner");
    expect(inside.observation.discover(inside.opener)?.kind).toBe(
      "same-document-layer",
    );
  });
});

describe("layer query input (C11)", () => {
  it("accepts the only visible unlabeled text input under a subject search heading", () => {
    document.body.innerHTML = fieldGroup(0, layer("layer"));
    const { opener, observation } = start();
    show("layer");
    const surface = observation.discover(opener)!;
    expect(queryControls(surface)).toEqual([
      document.querySelector("#layer div input"),
    ]);
  });

  it("does not accept it when the heading lacks the target subject", () => {
    document.body.innerHTML = fieldGroup(0, layer("layer", "조회"));
    const { opener, observation } = start();
    show("layer");
    const surface = observation.discover(opener)!;
    expect(queryControls(surface)).toEqual([]);
  });
});

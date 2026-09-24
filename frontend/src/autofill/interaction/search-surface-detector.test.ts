import { afterEach, describe, expect, it } from "vitest";
import { SearchSession } from "./search-session";
import { observeSearchSurfaces } from "./search-surface-detector";
import { elementSignature, type TargetIdentity } from "./readonly-search";

function setup() {
  document.body.innerHTML = `<div id="field"><input id="target" readonly><button id="opener" type="button">검색</button></div>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const fieldGroup = document.querySelector("#field")!;
  const identity: TargetIdentity = {
    target,
    fieldGroup,
    fieldSignature: elementSignature(target),
    openers: [opener],
    openerSignatures: [elementSignature(opener)],
  };
  const session = new SearchSession({
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: "가상값",
  });
  return { target, opener, identity, session };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("search surface discovery safety", () => {
  it("returns no surface until a visible attributed surface appears", () => {
    const { opener, identity, session } = setup();
    const observation = observeSearchSurfaces(document, identity, session);
    expect(observation.discover(opener)).toBeUndefined();
    const dialog = document.createElement("div");
    dialog.id = "surface";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    opener.setAttribute("aria-controls", "surface");
    document.body.append(dialog);
    expect(observation.discover(opener)).toBeDefined();
    session.stop();
  });

  it("rejects ambiguous and unrelated new surfaces", () => {
    const { opener, identity, session } = setup();
    const observation = observeSearchSurfaces(document, identity, session);
    const first = document.createElement("div");
    first.setAttribute("role", "dialog");
    first.setAttribute("aria-modal", "true");
    const second = first.cloneNode(true);
    opener.setAttribute("aria-controls", "first");
    document.body.append(first, second);
    expect(() => observation.discover(opener)).toThrowError(
      expect.objectContaining({ reason: "surface_ambiguous" }),
    );
    session.stop();

    const isolated = setup();
    const secondObservation = observeSearchSurfaces(
      document,
      isolated.identity,
      isolated.session,
    );
    const unrelated = document.createElement("div");
    unrelated.setAttribute("role", "dialog");
    unrelated.setAttribute("aria-modal", "true");
    document.body.append(unrelated);
    expect(() => secondObservation.discover(isolated.opener)).toThrowError(
      expect.objectContaining({ reason: "surface_unobservable" }),
    );
    isolated.session.stop();
  });

  it("rejects inaccessible iframe surfaces and detects owned inline lists", () => {
    const { opener, identity, session } = setup();
    const observation = observeSearchSurfaces(document, identity, session);
    const frame = document.createElement("iframe");
    frame.id = "frame-surface";
    opener.setAttribute("aria-controls", frame.id);
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get: () => null,
    });
    document.body.append(frame);
    expect(() => observation.discover(opener)).toThrowError(
      expect.objectContaining({ reason: "inaccessible_popup_frame" }),
    );
    session.stop();
  });
});

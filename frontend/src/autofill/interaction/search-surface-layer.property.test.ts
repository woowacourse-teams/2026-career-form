/**
 * Preservation (Property 2, task 3): search surface discovery outside the
 * role-less layer bug condition.
 *
 * `SURFACE_SELECTOR` surfaces keep their kind, a container that was already
 * visible before the click is not a new surface, and a role-less container
 * without a query input, a button and a list is never a surface. These pass
 * on the unfixed code and must keep passing after C9.
 *
 * **Validates: Requirements 3.7, 3.8, 3.19**
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  bool,
  forAllSeeded,
  pick,
} from "../workflow/test-utils/seeded-generators";
import { elementSignature, type TargetIdentity } from "./readonly-search";
import { SearchSession } from "./search-session";
import { observeSearchSurfaces } from "./search-surface-detector";

type SurfaceMarkup =
  "dialog" | "modal-dialog" | "data-search-surface" | "listbox";
type Missing = "query" | "button" | "list";

const SURFACE_ATTRIBUTES: Record<SurfaceMarkup, string> = {
  dialog: 'role="dialog"',
  "modal-dialog": 'role="dialog" aria-modal="true"',
  "data-search-surface": "data-search-surface",
  listbox: 'role="listbox"',
};

function layerBody(missing: readonly Missing[]): string {
  return [
    missing.includes("query") ? "" : '<input type="text">',
    missing.includes("button") ? "" : '<button type="button">검색</button>',
    missing.includes("list") ? "" : "<ul><li>항목</li></ul>",
  ].join("");
}

function setup(surface: string): {
  opener: HTMLButtonElement;
  layer: HTMLElement;
  identity: TargetIdentity;
  session: SearchSession;
} {
  document.body.innerHTML = `<div id="field"><label for="target">학교명</label><input id="target" readonly><button id="opener" type="button">학교 검색</button>${surface}</div>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const identity: TargetIdentity = {
    target,
    fieldGroup: document.querySelector("#field")!,
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
  return {
    opener,
    layer: document.querySelector("#layer")!,
    identity,
    session,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("search surface discovery preservation (Property 2)", () => {
  it("keeps the kind of SURFACE_SELECTOR surfaces that appear after the click", () => {
    forAllSeeded(
      "SURFACE_SELECTOR surface",
      { runs: 40 },
      (rng) => ({
        markup: pick(rng, [
          "dialog",
          "modal-dialog",
          "data-search-surface",
          "listbox",
        ] as const),
        complete: bool(rng),
      }),
      ({ markup, complete }) => {
        const { opener, layer, identity, session } = setup(
          `<div id="layer" ${SURFACE_ATTRIBUTES[markup]} hidden>${layerBody(complete ? [] : ["list"])}</div>`,
        );
        try {
          const observation = observeSearchSurfaces(
            document,
            identity,
            session,
          );
          expect(observation.discover(opener)).toBeUndefined();
          layer.hidden = false;
          const surface = observation.discover(opener);
          expect(surface?.container).toBe(layer);
          expect(surface?.kind).toBe(
            markup === "listbox" ? "inline-listbox" : "same-document-dialog",
          );
        } finally {
          session.stop();
        }
      },
    );
  });

  it("finds no new surface when the container was visible before the click", () => {
    forAllSeeded(
      "already visible container",
      { runs: 20 },
      (rng) => ({
        tag: pick(rng, ["div", "section", "aside", "article"] as const),
        role: bool(rng) ? pick(rng, ["dialog", "listbox"] as const) : undefined,
      }),
      ({ tag, role }) => {
        const { opener, identity, session } = setup(
          `<${tag} id="layer"${role ? ` role="${role}"` : ""}>${layerBody([])}</${tag}>`,
        );
        try {
          const observation = observeSearchSurfaces(
            document,
            identity,
            session,
          );
          opener.click();
          expect(observation.discover(opener)).toBeUndefined();
        } finally {
          session.stop();
        }
      },
    );
  });

  it("never treats a structurally incomplete role-less container as a surface", () => {
    forAllSeeded(
      "incomplete role-less container",
      { runs: 40 },
      (rng) => {
        const missing = (["query", "button", "list"] as const).filter(() =>
          bool(rng, 0.5),
        );
        return {
          tag: pick(rng, ["div", "section", "aside", "article"] as const),
          missing: missing.length
            ? missing
            : [pick(rng, ["query", "button", "list"] as const)],
          readonlyQuery: bool(rng, 0.3),
        };
      },
      ({ tag, missing, readonlyQuery }) => {
        const body = readonlyQuery
          ? layerBody(missing).replace(
              '<input type="text">',
              '<input type="text" readonly>',
            )
          : layerBody(missing);
        const { opener, layer, identity, session } = setup(
          `<${tag} id="layer" hidden><h4>학교 검색</h4>${body}</${tag}>`,
        );
        try {
          const observation = observeSearchSurfaces(
            document,
            identity,
            session,
          );
          layer.hidden = false;
          expect(observation.discover(opener)).toBeUndefined();
        } finally {
          session.stop();
        }
      },
    );
  });
});

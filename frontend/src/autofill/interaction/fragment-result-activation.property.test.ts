/**
 * Bug condition exploration (Property 1, task 2): role-less layer surface,
 * fragment result link activation and untrusted id relations.
 *
 * These tests encode the expected behavior and are expected to FAIL on the
 * unfixed code:
 * - a role-less `div` layer is not a surface candidate (`surface_not_found`),
 * - `safeActivation` rejects `<a href="#n" onclick>` because of its on* attribute,
 * - `linked()` trusts duplicate and abnormal (`NaN`) ids.
 *
 * The layer tests live here because recognizing the owned layer is the
 * precondition of activating its fragment results; `linked()` is the
 * ownership check of the same module (`search-surface-dom.ts`).
 *
 * The preservation sections (Property 2, task 3) compare `safeActivation`
 * with the pre-fix reference on links outside the fragment-link bug condition
 * and pin `linked()` for trusted ids; they pass on the unfixed code.
 *
 * **Validates: Requirements 2.7, 2.8, 2.11, 2.12, 2.13, 3.5, 3.6, 3.14**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectFieldsSnapshot } from "../dom/collect";
import {
  createMixedEducationLayerFixture,
  type MixedEducationLayerFixture,
} from "../workflow/test-utils/mixed-education-layer.fixture";
import { referenceSafeActivation } from "../workflow/test-utils/preservation-reference";
import {
  bool,
  forAllSeeded,
  pick,
  string,
} from "../workflow/test-utils/seeded-generators";
import { observeReadonlySearch } from "./readonly-search";
import { executeReadonlySearch } from "./readonly-search-executor";
import { observeSearchSurfaces } from "./search-surface-detector";
import { linked, safeActivation } from "./search-surface-dom";
import { SearchSession } from "./search-session";

const SCHOOL = "<고등학교명>";

/**
 * The fixed `safeActivation` takes a result scope as a third argument (C10).
 * Calling through this signature keeps the suite compiling before it exists;
 * the unfixed function simply ignores the extra argument.
 */
const activationWithScope = safeActivation as unknown as (
  element: HTMLElement,
  acceptedValues: readonly string[],
  scope: { resultRoot: Element; surfaceKind: string },
) => boolean;

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function targetCandidate(target: HTMLInputElement) {
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    });
  return { snapshot, candidate };
}

function twoRowFixture(): MixedEducationLayerFixture {
  return createMixedEducationLayerFixture({
    rows: [{ kind: "고등학교" }, { kind: "대학교" }],
    results: [{ name: SCHOOL, code: "<학교코드>" }],
  });
}

let fixture: MixedEducationLayerFixture | undefined;

beforeEach(() => {
  setPageUrl("https://careers.example.test/apply");
  document.body.replaceChildren();
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("role-less same-document layer (bug condition, 2.7, 2.8)", () => {
  it("discovers the owned layer as a same-document-layer surface", () => {
    fixture = twoRowFixture();
    const branch = fixture.row(1).branch("college");
    const { snapshot, candidate } = targetCandidate(branch.schoolName);
    expect(candidate).toBeDefined();
    const lookup = snapshot.registry.lookupField(candidate!.candidateId);
    if (lookup.status !== "blocked") throw new Error("target not blocked");
    const eligibility = observeReadonlySearch(lookup.handle);
    if (eligibility.status !== "eligible")
      throw new Error(`target not eligible: ${eligibility.reason}`);
    const identity = eligibility.identity;
    identity.opener = branch.opener;
    const session = new SearchSession({
      document,
      registry: snapshot.registry,
      targetCandidateId: candidate!.candidateId,
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: SCHOOL,
    });
    try {
      const observation = observeSearchSurfaces(document, identity, session);
      branch.opener.click();
      const surface = observation.discover(branch.opener);
      expect(surface?.kind).toBe("same-document-layer");
      expect(surface?.container).toBe(branch.layer);
    } finally {
      session.stop();
    }
  });

  it("does not end the school-name search with surface_not_found", async () => {
    vi.useFakeTimers();
    fixture = twoRowFixture();
    const branch = fixture.row(1).branch("college");
    const { snapshot, candidate } = targetCandidate(branch.schoolName);
    expect(candidate).toBeDefined();
    const pending = executeReadonlySearch({
      document,
      registry: snapshot.registry,
      targetCandidateId: candidate!.candidateId,
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: SCHOOL,
      expectedCurrentValue: "",
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect("reason" in result ? result.reason : undefined).not.toBe(
      "surface_not_found",
    );
  }, 30_000);
});

describe("fragment result link activation (bug condition, 2.12, 2.13)", () => {
  function openWithResults(): {
    list: HTMLUListElement;
    link: HTMLAnchorElement;
  } {
    fixture = twoRowFixture();
    const branch = fixture.row(1).branch("college");
    branch.opener.click();
    branch.submit.click();
    const link = branch.list.querySelector<HTMLAnchorElement>("li > a");
    if (!link) throw new Error("fixture search produced no result link");
    return { list: branch.list, link };
  }

  it("activates the unique exact <a href='#n' onclick> inside the owned result list", () => {
    const { list, link } = openWithResults();
    expect(link.getAttribute("href")).toBe("#n");
    expect(link.hasAttribute("onclick")).toBe(true);
    expect(
      activationWithScope(link, [SCHOOL], {
        resultRoot: list,
        surfaceKind: "same-document-layer",
      }),
    ).toBe(true);
  });

  it("property: any same-document fragment result link with one onclick is activatable", () => {
    const { list, link } = openWithResults();
    const item = link.parentElement!;
    forAllSeeded(
      "fragment result link activation",
      { runs: 50 },
      (rng) => ({
        fragment: `#${string(rng, "abcdefghijklmnopqrstuvwxyz0123456789", 1, 6)}`,
        text: `<${string(rng, "가나다라마바사아자차카타파하", 1, 6)}고등학교>`,
        surfaceKind: pick(rng, [
          "same-document-layer",
          "same-document-dialog",
        ] as const),
      }),
      (input) => {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", input.fragment);
        anchor.setAttribute("onclick", "return true;");
        anchor.textContent = input.text;
        item.replaceChildren(anchor);
        expect(
          activationWithScope(anchor, [input.text], {
            resultRoot: list,
            surfaceKind: input.surfaceKind,
          }),
        ).toBe(true);
      },
    );
  });
});

describe("untrusted id relations (bug condition, 2.11)", () => {
  const RELATIONS = [
    "aria-controls",
    "aria-owns",
    "popovertarget",
    "commandfor",
  ] as const;
  const ANOMALIES = ["duplicate", "NaN", "nan", "undefined", "null"] as const;

  it("does not link through a duplicate or NaN id", () => {
    document.body.innerHTML = `
      <button id="c1" type="button" aria-controls="NaN">검색</button>
      <div id="NaN"></div>
      <button id="c2" type="button" aria-controls="dup">검색</button>
      <div id="dup" class="first"></div><div id="dup" class="second"></div>`;
    const control = (id: string) => document.getElementById(id)!;
    expect(linked(control("c1"), document.getElementById("NaN")!)).toBe(false);
    expect(linked(control("c2"), document.querySelector(".first")!)).toBe(
      false,
    );
    expect(linked(control("c2"), document.querySelector(".second")!)).toBe(
      false,
    );
  });

  it("property: linked() is false whenever the target id is untrusted", () => {
    forAllSeeded(
      "untrusted id relation",
      { runs: 50 },
      (rng) => ({
        relation: pick(rng, RELATIONS),
        anomaly: pick(rng, ANOMALIES),
        duplicateId: `id${string(rng, "abcdefgh0123", 1, 5)}`,
      }),
      (input) => {
        document.body.replaceChildren();
        const id =
          input.anomaly === "duplicate" ? input.duplicateId : input.anomaly;
        const control = document.createElement("button");
        control.type = "button";
        control.setAttribute(input.relation, id);
        const target = document.createElement("div");
        target.id = id;
        document.body.append(control, target);
        if (input.anomaly === "duplicate") {
          const twin = document.createElement("div");
          twin.id = id;
          document.body.append(twin);
        }
        expect(linked(control, target)).toBe(false);
      },
    );
  });
});

type LinkHref =
  | "javascript-call"
  | "javascript-other"
  | "empty"
  | "hash-only"
  | "fragment"
  | "other-path"
  | "absolute-other-origin";

type Disqualifier =
  | "target-blank"
  | "download"
  | "inside-form"
  | "outside-result-root"
  | "extra-handler"
  | "text-mismatch"
  | "other-surface-kind"
  | "no-scope";

interface LinkCase {
  readonly href: LinkHref;
  readonly disqualifiers: readonly Disqualifier[];
  readonly onclick: boolean;
  readonly surfaceKind: string;
  readonly text: string;
}

const DISQUALIFIERS: readonly Disqualifier[] = [
  "target-blank",
  "download",
  "inside-form",
  "outside-result-root",
  "extra-handler",
  "text-mismatch",
  "other-surface-kind",
  "no-scope",
];

function hrefFor(kind: LinkHref, text: string): string {
  switch (kind) {
    case "javascript-call":
      return `javascript:pick('${text}');`;
    case "javascript-other":
      return "javascript:location.assign('/x')";
    case "empty":
      return "";
    case "hash-only":
      return "#";
    case "fragment":
      return "#n";
    case "other-path":
      return "/apply/next#n";
    case "absolute-other-origin":
      return "https://other.example.test/apply#n";
  }
}

/** Outside the fragment bug condition: a fragment link keeps a disqualifier. */
function generateLink(rng: () => number): LinkCase {
  const href = pick(rng, [
    "javascript-call",
    "javascript-other",
    "empty",
    "hash-only",
    "fragment",
    "other-path",
    "absolute-other-origin",
  ] as const);
  const disqualifiers = DISQUALIFIERS.filter(() => bool(rng, 0.25));
  if (href === "fragment" && disqualifiers.length === 0)
    disqualifiers.push(pick(rng, DISQUALIFIERS));
  return {
    href,
    disqualifiers,
    onclick: bool(rng, 0.6),
    surfaceKind: disqualifiers.includes("other-surface-kind")
      ? pick(rng, ["same-origin-iframe", "inline-listbox"] as const)
      : pick(rng, ["same-document-layer", "same-document-dialog"] as const),
    text: `<${string(rng, "가나다라마바사아자차카타파하", 1, 6)}고등학교>`,
  };
}

function buildLink(input: LinkCase): {
  link: HTMLAnchorElement;
  resultRoot: Element;
} {
  const has = (value: Disqualifier) => input.disqualifiers.includes(value);
  document.body.innerHTML = `<div id="surface"><ul id="results"><li></li></ul><div id="elsewhere"></div></div>`;
  const link = document.createElement("a");
  link.setAttribute("href", hrefFor(input.href, input.text));
  link.textContent = input.text;
  if (input.onclick) link.setAttribute("onclick", "return true;");
  if (has("extra-handler")) link.setAttribute("onmouseover", "return true;");
  if (has("target-blank")) link.setAttribute("target", "_blank");
  if (has("download")) link.setAttribute("download", "");
  const holder = has("outside-result-root")
    ? document.getElementById("elsewhere")!
    : document.querySelector("#results > li")!;
  if (has("inside-form")) {
    const form = document.createElement("form");
    form.append(link);
    holder.append(form);
  } else holder.append(link);
  return { link, resultRoot: document.getElementById("results")! };
}

describe("result link activation preservation (Property 2, 3.5, 3.6)", () => {
  it("matches the pre-fix safeActivation outside the fragment bug condition", () => {
    forAllSeeded(
      "non-bug result link activation",
      { runs: 150 },
      generateLink,
      (input) => {
        const { link, resultRoot } = buildLink(input);
        const accepted = input.disqualifiers.includes("text-mismatch")
          ? ["<다른학교>"]
          : [input.text];
        const expected = referenceSafeActivation(link, accepted);
        expect(safeActivation(link, accepted)).toBe(expected);
        if (!input.disqualifiers.includes("no-scope"))
          expect(
            activationWithScope(link, accepted, {
              resultRoot,
              surfaceKind: input.surfaceKind,
            }),
          ).toBe(expected);
      },
    );
  }, 30_000);

  it("keeps the observed pre-fix decisions for representative links", () => {
    const decide = (input: Partial<LinkCase>) => {
      const full: LinkCase = {
        href: "fragment",
        disqualifiers: [],
        onclick: false,
        surfaceKind: "same-document-layer",
        text: SCHOOL,
        ...input,
      };
      const { link } = buildLink(full);
      return safeActivation(link, [SCHOOL]);
    };
    expect(decide({ href: "empty" })).toBe(true);
    expect(decide({ href: "hash-only" })).toBe(true);
    expect(decide({ href: "javascript-call" })).toBe(true);
    expect(decide({ href: "javascript-call", onclick: true })).toBe(false);
    expect(decide({ href: "javascript-other" })).toBe(false);
    expect(decide({ href: "other-path" })).toBe(false);
    expect(decide({ href: "hash-only", disqualifiers: ["target-blank"] })).toBe(
      false,
    );
    expect(decide({ href: "hash-only", disqualifiers: ["download"] })).toBe(
      false,
    );
    expect(
      decide({ href: "javascript-call", disqualifiers: ["inside-form"] }),
    ).toBe(false);
  });
});

describe("trusted id relation preservation (Property 2, 3.14)", () => {
  it("property: linked() is true for a unique, normal id relation", () => {
    forAllSeeded(
      "trusted id relation",
      { runs: 50 },
      (rng) => ({
        relation: pick(rng, [
          "aria-controls",
          "aria-owns",
          "popovertarget",
          "commandfor",
        ] as const),
        id: `layer-${string(rng, "abcdefgh0123", 1, 6)}`,
        extraTokens: bool(rng),
      }),
      (input) => {
        document.body.replaceChildren();
        const control = document.createElement("button");
        control.type = "button";
        control.setAttribute(
          input.relation,
          input.extraTokens ? `other ${input.id}` : input.id,
        );
        const target = document.createElement("div");
        target.id = input.id;
        const unrelated = document.createElement("div");
        unrelated.id = `${input.id}-x`;
        document.body.append(control, target, unrelated);
        expect(linked(control, target)).toBe(true);
        expect(linked(control, unrelated)).toBe(false);
      },
    );
  });
});

import resultFixture from "../../../fixtures/generic-search/structured-results.html?raw";
import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "./readonly-search-executor";
import type { InteractionDecisionRequest } from "../api/interaction-types";

afterEach(() => {
  document.body.innerHTML = "";
});

function fixture(
  kind: "modal" | "popup" | "iframe" | "listbox",
  unexpected = false,
  finalMutation = false,
) {
  document.body.innerHTML = `<main><div><label>학교<input id="target" readonly></label><input id="code" type="hidden"><button type="button" id="open" aria-controls="surface">학교 검색</button></div><input id="peer" value="보존"></main>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const code = document.querySelector<HTMLInputElement>("#code")!;
  const peer = document.querySelector<HTMLInputElement>("#peer")!;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((s) => [...s.fields, ...(s.items?.flatMap((i) => i.fields) ?? [])])
    .find((f) => {
      const lookup = snapshot.registry.lookupField(f.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    })!;
  let clicks = 0;
  let mutationChecks = 0;
  const requests: InteractionDecisionRequest[] = [];
  document.querySelector("#open")!.addEventListener("click", () => {
    const surface = document.createElement("div");
    surface.id = "surface";
    surface.setAttribute("data-search-surface", "true");
    if (kind === "modal") {
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
    }
    document.body.append(surface);
    let root: HTMLElement = surface;
    if (kind === "iframe") {
      const frame = document.createElement("iframe");
      surface.append(frame);
      Object.defineProperty(frame.contentDocument!, "URL", {
        value: "about:srcdoc",
      });
      Object.defineProperty(frame.contentDocument!, "readyState", {
        value: "complete",
      });
      root = frame.contentDocument!.body;
    }
    root.innerHTML = resultFixture;
    if (kind === "listbox") {
      surface.setAttribute("role", "listbox");
      surface.setAttribute("data-search-complete", "true");
      surface.setAttribute("data-result-count", "2");
      surface.replaceChildren(
        ...Array.from(root.querySelector("ul")!.children),
      );
    }
    root.querySelectorAll<HTMLElement>("[onclick]").forEach((action) =>
      action.addEventListener("click", () => {
        clicks++;
        target.value = "가상대학교";
        code.value = "synthetic-code";
        surface.hidden = true;
        if (unexpected) peer.value = "예상 밖 변경";
      }),
    );
  });
  return {
    target,
    code,
    peer,
    requests,
    clicks: () => clicks,
    run: () =>
      executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: "education.university.schoolName",
        expectedValue: "가상대학교",
        beforeMutation: async () => {
          if (++mutationChecks === 3 && finalMutation)
            peer.value = "최종 확인 중 변경";
          return true;
        },
        decisionProvider: async (request) => {
          requests.push(request);
          return {
            schemaVersion: 2,
            snapshotId: request.snapshotId,
            mode: "GENERIC",
            status: "COMPLETE",
            decisions: request.decisions.map((d) => ({
              decisionId: d.decisionId,
              role: d.role,
              selection: "SELECTED",
              candidateId: d.candidates.find((c) => c.structure?.tag === "div")
                ?.candidateId,
            })),
          };
        },
      }),
  };
}

describe("structured search execution", () => {
  it("rechecks effects after the final asynchronous approval guard", async () => {
    const f = fixture("popup", false, true);
    expect(await f.run()).toMatchObject({
      status: "failed",
      reason: "selection_postcondition_failed",
    });
    expect(f.clicks()).toBe(1);
  });
  it.each(["modal", "popup", "iframe", "listbox"] as const)(
    "selects once and retains the local value/code for %s",
    async (kind) => {
      const f = fixture(kind);
      expect(await f.run()).toMatchObject({ status: "selected" });
      expect(f.clicks()).toBe(1);
      expect(f.target.value).toBe("가상대학교");
      expect(f.code.value).toBe("synthetic-code");
      expect(f.peer.value).toBe("보존");
      expect(f.requests).toHaveLength(1);
      expect(JSON.stringify(f.requests)).not.toMatch(
        /가상대학교|다른대학교|synthetic-code|onclick/,
      );
    },
  );
  it("reports unexpected peer effects without retry or rollback", async () => {
    const f = fixture("popup", true);
    expect(await f.run()).toMatchObject({
      status: "failed",
      reason: "selection_postcondition_failed",
    });
    expect(f.clicks()).toBe(1);
    expect(f.peer.value).toBe("예상 밖 변경");
  });
});

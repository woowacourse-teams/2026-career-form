import { beforeEach, describe, expect, it } from "vitest";

import type { FieldCandidate } from "../api/types";
import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";

// Synthetic, non-identifying reproduction of an education section whose
// high-school, university and graduate rows have no `*-item` identifiers:
// each kind owns a titled box, and every box holds one repeat-marked row.
function entryBox(kind: string, title: string, id: string): string {
  return `<div class="entry-box ${kind}">
    <div class="entry-head"><h5>${title}</h5></div>
    <div class="entry-fields" ismultirow="true">
      <dl><dt>학교명</dt><dd>
        <input type="text" id="${id}-name" aria-label="학교명" readonly>
        <button type="button">검색</button>
      </dd></dl>
      <dl><dt>입학년월</dt><dd>
        <input type="text" id="${id}-start" aria-label="입학년월">
      </dd></dl>
    </div>
  </div>`;
}

function educationSection(boxes: string): string {
  return `<div class="apply-block">
    <div class="block-title"><h4>학력사항</h4></div>
    <div class="entry-list">${boxes}<div class="entry-empty"></div></div>
    <div class="block-bottom">
      <select aria-label="학력 구분"><option>고등학교</option><option>대학교</option></select>
      <button type="button">항목추가</button>
    </div>
  </div>`;
}

const high = (id = "h0") => entryBox("kind-high", "고등학교", id);
const university = (id: string) => entryBox("kind-univ", "대학교", id);

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function collect() {
  const collected = collectFieldsSnapshot(document);
  const candidates = collected.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items?.flatMap((item) => item.fields) ?? []),
  ]);
  const byElementId = (id: string): FieldCandidate => {
    const candidate = candidates.find((field) => {
      const lookup = collected.registry.lookupField(field.candidateId);
      return (
        (lookup.status === "ready" || lookup.status === "blocked") &&
        lookup.handle.elements[0]?.id === id
      );
    });
    if (!candidate) throw new Error(`no candidate for ${id}`);
    return candidate;
  };
  const handle = (id: string) => {
    const lookup = collected.registry.lookupField(byElementId(id).candidateId);
    if (lookup.status !== "ready" && lookup.status !== "blocked")
      throw new Error(`candidate ${id} is ${lookup.status}`);
    return lookup.handle;
  };
  return { collected, byElementId, handle };
}

describe("ownership-based repeated field groups", () => {
  beforeEach(() => {
    setPageUrl("https://careers.example.test/apply");
    document.body.innerHTML = "";
  });

  it("separates one high-school row and one university row without identifiers", () => {
    document.body.innerHTML = educationSection(high() + university("u0"));

    const { collected, byElementId, handle } = collect();
    const highName = byElementId("h0-name");
    const universityName = byElementId("u0-name");

    expect(handle("h0-name").itemIndex).toBe(0);
    expect(handle("u0-name").itemIndex).toBe(0);
    expect(collected.registry.fieldItemCount(highName.candidateId)).toBe(1);
    expect(collected.registry.fieldItemCount(universityName.candidateId)).toBe(
      1,
    );
    expect(handle("h0-name").itemGroupId).not.toBe(
      handle("u0-name").itemGroupId,
    );
    expect(highName.semanticContext?.repeat).toMatchObject({
      rowIndex: 0,
      rowCount: 1,
    });
    expect(universityName.semanticContext?.repeat).toMatchObject({
      rowIndex: 0,
      rowCount: 1,
    });
    expect(highName.semanticContext?.repeat?.groupId).not.toBe(
      universityName.semanticContext?.repeat?.groupId,
    );
  });

  it("indexes several university rows within one group next to a high-school row", () => {
    document.body.innerHTML = educationSection(
      high() + university("u0") + university("u1"),
    );

    const { collected, byElementId, handle } = collect();

    expect(
      collected.registry.fieldItemCount(byElementId("h0-name").candidateId),
    ).toBe(1);
    expect(
      ["u0-name", "u1-name"].map((id) => [
        handle(id).itemIndex,
        collected.registry.fieldItemCount(byElementId(id).candidateId),
      ]),
    ).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(handle("u0-name").itemGroupId).toBe(handle("u1-name").itemGroupId);
    expect(byElementId("u1-name").semanticContext?.repeat).toMatchObject({
      groupId: byElementId("u0-name").semanticContext?.repeat?.groupId,
      rowIndex: 1,
      rowCount: 2,
    });
  });

  it("uses opaque group identifiers without heading, id or class text", () => {
    document.body.innerHTML = educationSection(high() + university("u0"));

    const { collected } = collect();
    const groupIds = collected.request.sections.flatMap(
      (section) => section.items?.map((item) => item.itemGroupId) ?? [],
    );

    expect(groupIds).toHaveLength(2);
    expect(new Set(groupIds).size).toBe(2);
    for (const groupId of groupIds) {
      expect(groupId).toMatch(/^section-\d+-rows-\d+$/);
      expect(groupId).not.toMatch(/대학|고등|kind|entry/);
    }
  });

  it("keeps a graduate area independent even when its structure matches the university area", () => {
    document.body.innerHTML = educationSection(
      high() + university("u0") + entryBox("kind-univ", "대학원", "g0"),
    );

    const { collected, byElementId, handle } = collect();

    expect(handle("u0-name").itemGroupId).not.toBe(
      handle("g0-name").itemGroupId,
    );
    expect(
      ["h0-name", "u0-name", "g0-name"].map((id) => [
        handle(id).itemIndex,
        collected.registry.fieldItemCount(byElementId(id).candidateId),
      ]),
    ).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
  });

  it("does not merge differently structured areas that share a heading", () => {
    document.body.innerHTML = educationSection(
      entryBox("kind-a", "학력", "a0") + entryBox("kind-b", "학력", "b0"),
    );

    const { collected, byElementId, handle } = collect();

    expect(handle("a0-name").itemGroupId).not.toBe(
      handle("b0-name").itemGroupId,
    );
    expect(
      collected.registry.fieldItemCount(byElementId("b0-name").candidateId),
    ).toBe(1);
  });

  it("leaves rows unindexed when headings between sibling rows make the boundary ambiguous", () => {
    const row = (id: string) => `<div class="entry-fields" ismultirow="true">
      <input type="text" id="${id}-name" aria-label="학교명" readonly>
      <input type="text" id="${id}-start" aria-label="입학년월">
    </div>`;
    document.body.innerHTML = `<div class="apply-block"><h4>학력사항</h4>
      <h5>고등학교</h5>${row("h0")}
      <h5>대학교</h5>${row("u0")}
      <button type="button">항목추가</button></div>`;

    const { collected, byElementId, handle } = collect();

    for (const id of ["h0-name", "u0-name"]) {
      expect(handle(id).itemId).toBeDefined();
      expect(handle(id).itemIndex).toBeUndefined();
      expect(handle(id).itemGroupId).toBeUndefined();
      expect(byElementId(id).semanticContext?.repeat).toBeUndefined();
    }
    expect(
      collected.request.sections.flatMap(
        (section) => section.items?.map((item) => item.itemGroupId) ?? [],
      ),
    ).toEqual([undefined, undefined]);
  });

  it("preserves explicit item-name groups", () => {
    document.body.innerHTML = `
      <div class="apply-form-box">
        <div class="form-item-group educationhigh-item">
          <input id="h0-name" /><input name="highSchoolGraduationDate" />
        </div>
        <div class="form-item-group educationUniv-item">
          <input id="u0-name" /><input name="universityGraduationDate" />
        </div>
      </div>`;

    const { collected, handle } = collect();

    expect(handle("h0-name").itemGroupId).toBe("educationhigh");
    expect(handle("u0-name").itemGroupId).toBe("educationuniv");
    expect(
      collected.request.sections[0]!.items!.map((item) => item.itemGroupId),
    ).toEqual(["educationhigh", "educationuniv"]);
  });

  describe("revalidation after collection", () => {
    beforeEach(() => {
      document.body.innerHTML = educationSection(
        high() + university("u0") + university("u1"),
      );
    });

    const status = (
      collected: ReturnType<typeof collectFieldsSnapshot>,
      candidate: FieldCandidate,
    ) => collected.registry.lookupField(candidate.candidateId).status;

    it("marks a university row stale when another university row is removed", () => {
      const { collected, byElementId } = collect();
      const second = byElementId("u1-name");
      document.querySelector("#u0-name")!.closest(".entry-box")!.remove();
      expect(status(collected, second)).toBe("stale");
    });

    it("marks university rows stale when a university row is added", () => {
      const { collected, byElementId } = collect();
      const first = byElementId("u0-name");
      document
        .querySelector(".entry-list")!
        .insertAdjacentHTML("beforeend", university("u2"));
      expect(status(collected, first)).toBe("stale");
    });

    it("marks university rows stale when their order changes", () => {
      const { collected, byElementId } = collect();
      const first = byElementId("u0-name");
      const firstBox = document
        .querySelector("#u0-name")!
        .closest(".entry-box")!;
      const secondBox = document
        .querySelector("#u1-name")!
        .closest(".entry-box")!;
      secondBox.after(firstBox);
      expect(status(collected, first)).toBe("stale");
    });

    it("marks rows stale when a row moves to another group", () => {
      const { collected, byElementId } = collect();
      const first = byElementId("u0-name");
      const second = byElementId("u1-name");
      document
        .querySelector("#u1-name")!
        .closest(".entry-box")!
        .querySelector("h5")!.textContent = "대학원";
      expect(status(collected, first)).toBe("stale");
      expect(status(collected, second)).toBe("stale");
    });

    it("keeps an unaffected high-school row current", () => {
      const { collected, byElementId } = collect();
      const highName = byElementId("h0-name");
      document.querySelector("#u1-name")!.closest(".entry-box")!.remove();
      expect(status(collected, highName)).toBe("blocked");
    });
  });

  describe("preparation counts", () => {
    function addActionId(
      preparation: ReturnType<typeof collectPreparationSnapshot>,
    ): string {
      const action = preparation.request.sections
        .flatMap((section) => section.actionCandidates)
        .find((candidate) => candidate.displayName === "항목추가");
      if (!action) throw new Error("no add action");
      return action.candidateId;
    }

    it("does not count rows of other groups for an add action shared by several groups", () => {
      document.body.innerHTML = educationSection(high() + university("u0"));
      const preparation = collectPreparationSnapshot(document);
      const actionId = addActionId(preparation);
      expect(preparation.countRepeatableGroups(actionId)).toBeUndefined();
      expect(preparation.repeatableGroupState(actionId)).toBeUndefined();
    });

    it("counts all rows when they belong to one group", () => {
      document.body.innerHTML = educationSection(
        university("u0") + university("u1"),
      );
      const preparation = collectPreparationSnapshot(document);
      expect(preparation.countRepeatableGroups(addActionId(preparation))).toBe(
        2,
      );
    });
  });
});

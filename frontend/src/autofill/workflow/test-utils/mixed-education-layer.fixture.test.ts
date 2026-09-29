import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMixedEducationLayerFixture,
  type MixedEducationLayerFixture,
} from "./mixed-education-layer.fixture";

let fixture: MixedEducationLayerFixture | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  vi.useRealTimers();
  window.history.replaceState(null, "", window.location.pathname);
});

function create(...args: Parameters<typeof createMixedEducationLayerFixture>) {
  fixture = createMixedEducationLayerFixture(...args);
  return fixture;
}

function visible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    if (node.style.display === "none") return false;
  return true;
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function listTexts(list: HTMLElement): string[] {
  return Array.from(list.querySelectorAll("li")).map(
    (item) => item.textContent ?? "",
  );
}

function recordListMutations(list: HTMLElement) {
  const records: { added: number; removed: number }[] = [];
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations)
      if (mutation.type === "childList" && mutation.target === list)
        records.push({
          added: mutation.addedNodes.length,
          removed: mutation.removedNodes.length,
        });
  });
  observer.observe(list, { childList: true });
  return {
    records,
    flush: () => {
      for (const mutation of observer.takeRecords())
        if (mutation.target === list)
          records.push({
            added: mutation.addedNodes.length,
            removed: mutation.removedNodes.length,
          });
      observer.disconnect();
      return records;
    },
  };
}

describe("mixed education layer fixture structure", () => {
  it("builds a label-less kind select with a placeholder and code|label values", () => {
    const { kindSelect } = create().row(0);
    expect(kindSelect.labels?.length ?? 0).toBe(0);
    expect(kindSelect.hasAttribute("aria-label")).toBe(false);
    expect(kindSelect.hasAttribute("placeholder")).toBe(false);
    expect(kindSelect.options[0]!.value).toBe("");
    expect(kindSelect.options[0]!.textContent).toBe("구분");
    expect(
      Array.from(kindSelect.options, (option) => option.value).slice(1),
    ).toEqual([
      "01|고등학교",
      "02|전문대학",
      "03|대학교",
      "04|대학원(석사)",
      "05|대학원(박사)",
    ]);
  });

  it("nests a hidden role-less layer inside each branch search group", () => {
    const branch = create().row(0).branch("college");
    expect(branch.schoolName.readOnly).toBe(true);
    expect(branch.schoolCode.type).toBe("hidden");
    expect(branch.searchGroup.contains(branch.layer)).toBe(true);
    expect(branch.layer.tagName).toBe("DIV");
    for (const attribute of [
      "role",
      "aria-modal",
      "aria-label",
      "title",
      "popover",
    ])
      expect(branch.layer.hasAttribute(attribute)).toBe(false);
    expect(visible(branch.layer)).toBe(false);
    expect(branch.layer.querySelector("h4")?.textContent).toBe("학교명 조회");
    expect(visible(branch.zeroNotice)).toBe(false);
    expect(branch.zeroNotice.style.display).toBe("");
    expect(branch.list.children).toHaveLength(0);
    expect(branch.resultArea.contains(branch.manualToggle)).toBe(false);
    expect(branch.resultArea.contains(branch.confirm)).toBe(false);
    expect(branch.manualInput.style.display).toBe("none");
    const layerHtml = fixture!.container.outerHTML;
    expect(layerHtml).not.toMatch(
      /aria-busy|data-search-|data-result-count|aria-setsize/,
    );
  });

  it("shows the high school branch for an empty or high school kind", () => {
    const row = create({ rows: [{}, { kind: "대학교" }] }).row(0);
    expect(visible(row.branch("high").element)).toBe(true);
    expect(visible(row.branch("college").element)).toBe(false);
    const second = fixture!.row(1);
    expect(visible(second.branch("high").element)).toBe(false);
    expect(visible(second.branch("college").element)).toBe(true);
  });

  it("applies id anomalies only where requested", () => {
    create({
      rows: [{}, {}],
      anomalies: {
        duplicateBranchIds: true,
        nanIdsInNewRows: true,
        labelForMismatchInNewRows: true,
      },
    });
    const first = fixture!.row(0);
    const second = fixture!.row(1);
    expect(first.branch("high").schoolName.id).toBe(
      first.branch("college").schoolName.id,
    );
    expect(first.branch("high").queryInput.id).not.toBe("NaN");
    expect(second.branch("high").queryInput.id).toBe("NaN");
    expect(second.branch("college").manualInput.id).toBe("NaN");
    expect(first.branch("high").label.htmlFor).toBe(
      first.branch("high").schoolName.id,
    );
    expect(second.branch("high").label.htmlFor).toBe("schoolName01");
    expect(second.branch("high").schoolName.id).toBe("schoolName1");
  });
});

describe("mixed education layer fixture rows", () => {
  it("adds rows with a delete button, empty kind, next id and same name", () => {
    const current = create({ rows: [{ kind: "고등학교" }] });
    current.addRowButton.click();
    current.addRowButton.click();
    expect(current.rows()).toHaveLength(3);
    const added = current.row(2);
    expect(added.kindSelect.value).toBe("");
    expect(added.kindSelect.id).toBe("eduKind2");
    expect(added.kindSelect.name).toBe(current.row(0).kindSelect.name);
    expect(added.element.querySelector(".edu-row-delete")).not.toBeNull();
    expect(
      added.element.querySelector(".edu-row-add, .edu-row-reset"),
    ).toBeNull();
    added.element.querySelector<HTMLButtonElement>(".edu-row-delete")!.click();
    expect(current.rows()).toHaveLength(2);
  });

  it("switches visible branch on kind change and keeps hidden branch values", () => {
    const current = create({
      rows: [
        {
          kind: "고등학교",
          highSchoolName: "<고등학교명>",
          highSchoolCode: "<학교코드>",
        },
      ],
    });
    const row = current.row(0);
    row.kindSelect.value = "03|대학교";
    row.kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(visible(row.branch("high").element)).toBe(false);
    expect(visible(row.branch("college").element)).toBe(true);
    expect(row.branch("high").schoolName.value).toBe("<고등학교명>");
    expect(row.branch("college").schoolName.value).toBe("");
    expect(current.events).toContainEqual({
      type: "kind-change",
      row: 0,
      kind: "대학교",
    });
  });

  it("resets the first row", () => {
    const current = create({
      rows: [{ kind: "대학교", highSchoolName: "<고등학교명>" }],
    });
    current.resetButton.click();
    const row = current.row(0);
    expect(row.kindSelect.value).toBe("");
    expect(row.branch("high").schoolName.value).toBe("");
    expect(visible(row.branch("high").element)).toBe(true);
  });
});

describe("mixed education layer fixture search", () => {
  function openCollegeLayer(current: MixedEducationLayerFixture) {
    const branch = current.row(0).branch("college");
    branch.opener.click();
    return branch;
  }

  it("runs inline opener handlers and reveals the existing layer", () => {
    const current = create({ rows: [{ kind: "대학교" }] });
    const branch = current.row(0).branch("college");
    const layer = branch.layer;
    branch.opener.click();
    expect(branch.layer).toBe(layer);
    expect(visible(branch.layer)).toBe(true);
    branch.closeButton.click();
    expect(visible(branch.layer)).toBe(false);
  });

  it("replaces the list synchronously and hides the zero notice", () => {
    const current = create({ rows: [{ kind: "대학교" }] });
    const branch = openCollegeLayer(current);
    branch.list.append(document.createElement("li"));
    const recorder = recordListMutations(branch.list);
    branch.submit.click();
    expect(listTexts(branch.list)).toEqual(["<고등학교명>"]);
    expect(visible(branch.zeroNotice)).toBe(false);
    expect(recorder.flush()).toEqual([{ added: 1, removed: 1 }]);
  });

  it("searches on Enter in the query input", () => {
    const branch = openCollegeLayer(create({ rows: [{ kind: "대학교" }] }));
    branch.queryInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(listTexts(branch.list)).toEqual(["<고등학교명>"]);
  });

  it("appends chunks across timer tasks", () => {
    vi.useFakeTimers();
    const current = create({
      rows: [{ kind: "대학교" }],
      responseMode: "chunked-replace",
      chunkDelayMs: 10,
      results: [
        { name: "<학교명1>", code: "<학교코드1>" },
        { name: "<학교명2>", code: "<학교코드2>" },
      ],
    });
    const branch = openCollegeLayer(current);
    branch.submit.click();
    expect(branch.list.children).toHaveLength(0);
    expect(visible(branch.zeroNotice)).toBe(true);
    vi.advanceTimersByTime(10);
    expect(listTexts(branch.list)).toEqual(["<학교명1>"]);
    expect(visible(branch.zeroNotice)).toBe(false);
    vi.advanceTimersByTime(10);
    expect(listTexts(branch.list)).toEqual(["<학교명1>", "<학교명2>"]);
  });

  it("leaves the DOM untouched for zero results without mutation", () => {
    const current = create({
      rows: [{ kind: "대학교" }],
      responseMode: "zero-no-mutation",
    });
    const branch = openCollegeLayer(current);
    const recorder = recordListMutations(branch.list);
    branch.submit.click();
    expect(recorder.flush()).toEqual([]);
    expect(visible(branch.zeroNotice)).toBe(true);
  });

  it("appends without removing in append-only mode", () => {
    const current = create({
      rows: [{ kind: "대학교" }],
      responseMode: "append-only",
    });
    const branch = openCollegeLayer(current);
    branch.submit.click();
    const recorder = recordListMutations(branch.list);
    branch.submit.click();
    expect(listTexts(branch.list)).toEqual(["<고등학교명>", "<고등학교명>"]);
    expect(recorder.flush()).toEqual([{ added: 1, removed: 0 }]);
  });

  it("keeps the zero notice visible in contradiction mode", () => {
    const current = create({
      rows: [{ kind: "대학교" }],
      responseMode: "zero-notice-contradiction",
    });
    const branch = openCollegeLayer(current);
    branch.submit.click();
    expect(listTexts(branch.list)).toEqual(["<고등학교명>"]);
    expect(visible(branch.zeroNotice)).toBe(true);
  });

  it("result link click reflects name and code, hides the layer and changes the hash after a task", async () => {
    const current = create({ rows: [{ kind: "대학교" }] });
    const branch = openCollegeLayer(current);
    branch.submit.click();
    const link = branch.list.querySelector<HTMLAnchorElement>("a")!;
    expect(link.getAttribute("href")).toBe("#n");
    expect(link.getAttribute("onclick")).toContain(
      "'<학교코드>', '<고등학교명>'",
    );
    link.click();
    expect(branch.schoolName.value).toBe("<고등학교명>");
    expect(branch.schoolCode.value).toBe("<학교코드>");
    expect(visible(branch.layer)).toBe(false);
    // jsdom queues same-document fragment navigation as a separate task.
    expect(document.location.hash).toBe("");
    await nextTask();
    expect(document.location.hash).toBe("#n");
    expect(current.events.filter((event) => event.type === "select")).toEqual([
      {
        type: "select",
        row: 0,
        branch: "college",
        name: "<고등학교명>",
        code: "<학교코드>",
        manual: false,
      },
    ]);
  });

  it("keeps the hash when preventDefault is requested", async () => {
    const branch = openCollegeLayer(
      create({ rows: [{ kind: "대학교" }], preventDefault: true }),
    );
    branch.submit.click();
    branch.list.querySelector<HTMLAnchorElement>("a")!.click();
    expect(branch.schoolName.value).toBe("<고등학교명>");
    await nextTask();
    expect(document.location.hash).toBe("");
  });

  it("confirm button writes the manual input value as a direct-input path", () => {
    const current = create({ rows: [{ kind: "대학교" }] });
    const branch = openCollegeLayer(current);
    branch.manualToggle.click();
    expect(branch.manualInput.style.display).toBe("");
    branch.manualInput.value = "<직접입력명>";
    branch.confirm.click();
    expect(branch.schoolName.value).toBe("<직접입력명>");
    expect(branch.schoolCode.value).toBe("");
    expect(current.events.at(-1)).toMatchObject({
      type: "select",
      manual: true,
    });
  });

  it("rejects literals that could break inline handlers", () => {
    expect(() =>
      createMixedEducationLayerFixture({
        results: [{ name: "a'b", code: "c" }],
      }),
    ).toThrow();
  });
});

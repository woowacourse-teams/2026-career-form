import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "./readonly-search-executor";
import { prepareCjMajorClose } from "./cj-major-close-bridge";
import { CJ_MAJOR_OPENER_MARKER } from "./cj-major-close-contract";

vi.mock("./cj-major-close-bridge", () => ({ prepareCjMajorClose: vi.fn() }));

const url =
  "https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(prepareCjMajorClose).mockReset();
});
it.each([
  [
    "changed destination",
    `data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_1"`,
  ],
  ["unexpected id", `data-iframe-url="${url}" id="tampered"`],
  ["inline handler", `data-iframe-url="${url}" onclick="other()"`],
  [
    "form override",
    `data-iframe-url="${url}" formaction="https://example.invalid/collect"`,
  ],
  ["target id", `data-iframe-url="${url}"`],
  ["target name", `data-iframe-url="${url}"`],
  ["row id", `data-iframe-url="${url}"`],
  ["arm changes onclick", `data-iframe-url="${url}"`],
  ["arm changes destination", `data-iframe-url="${url}"`],
])(
  "rejects CJ major candidate with %s before opener click or POST",
  async (_name, attributes) => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body><section id="sectionNormalUniversity0"><dl><dt>전공</dt><dd><input type="text" readonly id="mm_major_nm2_0" name="mm_major_nm" aria-label="전공"><input type="hidden" name="major" value=""><button type="button" name="bt_mm_major_nm" title="전공 검색" ${attributes}>전공 검색</button></dd></dl></section></body></html>`,
      { url: "https://recruit.cj.net/recruit/ko/resume/apply.fo" },
    );
    const doc = dom.window.document;
    const target = doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!;
    if (_name === "target id") target.id = "tampered";
    if (_name === "target name") target.name = "tampered";
    if (_name === "row id") target.closest("section")!.id = "tampered";
    const opener = doc.querySelector<HTMLButtonElement>("button")!;
    const clicked = vi.fn();
    const controller = new AbortController();
    opener.addEventListener("click", clicked);
    opener.addEventListener("click", () => controller.abort());
    if (_name.startsWith("arm changes")) {
      vi.mocked(prepareCjMajorClose).mockImplementationOnce(async (armed) => {
        await Promise.resolve();
        armed.setAttribute(
          CJ_MAJOR_OPENER_MARKER,
          "11111111-1111-4111-8111-111111111111",
        );
        if (_name === "arm changes onclick")
          armed.setAttribute("onclick", "other()");
        else
          armed.setAttribute("data-iframe-url", `${url.replace("2_0", "2_1")}`);
        return { check: async () => true, close: async () => true };
      });
    }
    const fetcher = vi.fn(async () => {
      throw new Error("unexpected POST");
    });
    vi.stubGlobal("fetch", fetcher);
    for (const name of [
      "HTMLInputElement",
      "HTMLSelectElement",
      "HTMLTextAreaElement",
      "HTMLButtonElement",
      "HTMLElement",
      "Element",
      "Node",
    ] as const)
      vi.stubGlobal(name, dom.window[name]);
    const snapshot = collectFieldsSnapshot(doc);
    const candidate = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ])
      .find((field) => {
        const result = snapshot.registry.lookupField(field.candidateId);
        return (
          result.status === "blocked" && result.handle.elements[0] === target
        );
      });
    expect(candidate).toBeDefined();
    const result = await executeReadonlySearch({
      document: doc,
      registry: snapshot.registry,
      targetCandidateId: candidate!.candidateId,
      canonicalFieldKey: "education.university.majorName",
      expectedValue: "합성전공",
      expectedCurrentValue: "",
      signal: controller.signal,
      decisionProvider: async (request) => ({
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: request.decisions.map((item) => ({
          decisionId: item.decisionId,
          role: item.role,
          selection: "SELECTED",
          candidateId: item.candidates[0]!.candidateId,
        })),
      }),
    });
    expect(result).toMatchObject({
      status: "unsupported",
      reason: "unverified_search_form",
      effect: "none",
    });
    expect(clicked).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(target.value).toBe("");
    expect(
      doc.querySelector<HTMLInputElement>('input[name="major"]')!.value,
    ).toBe("");
    dom.window.close();
  },
);

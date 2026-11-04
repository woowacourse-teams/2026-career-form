import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { collectFieldsSnapshot } from "../dom/collect";
import { runAddressAnalysis } from "../workflow/address-analysis";
import { runKakaoAddress } from "./kakao-executor";
import type { AddressSearch } from "./types";

const expected = {
  address: "제주특별자치도 제주시 첨단로 242",
  postalCode: "63309",
  detail: "공개 예시",
};

function setup(withPostcode = true) {
  document.body.innerHTML = `<div class="row">${withPostcode ? '<input id="zip" readonly>' : ""}<input id="road" readonly><button type="button" id="find">우편번호 찾기</button><input id="detail"></div><div class="modal" style="display:none"><iframe src="https://postcode.map.kakao.com/search"></iframe></div>`;
  const button = document.querySelector("#find")!;
  button.addEventListener("click", () => {
    document.querySelector<HTMLElement>(".modal")!.style.display = "block";
  });
  const input = (id: string) => document.querySelector<HTMLInputElement>(id);
  return {
    button,
    targets: {
      ...(withPostcode ? { postalCode: input("#zip")! } : {}),
      address: input("#road")!,
      detail: input("#detail")!,
    },
  };
}

/** The site's own callback writes whatever the selected row carried. */
const selecting =
  (selected: { postalCode: string; address: string }): AddressSearch =>
  async (_actual, maySelect, _signal, onSelected) => {
    expect(await maySelect()).toBe(true);
    onSelected?.(selected);
    const zip = document.querySelector<HTMLInputElement>("#zip");
    if (zip) zip.value = selected.postalCode;
    document.querySelector<HTMLInputElement>("#road")!.value = selected.address;
    return true;
  };

function run(
  search: AddressSearch,
  { button, targets }: ReturnType<typeof setup>,
) {
  return runKakaoAddress({
    document,
    button,
    expected,
    loadCurrent: async () => expected,
    signal: new AbortController().signal,
    search,
    targets,
  });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("generic address check against the profile", () => {
  it("restores the fields and asks for review when the road address differs", async () => {
    const page = setup();
    const events: string[] = [];
    page.targets.address.addEventListener("input", () =>
      events.push(`input:${page.targets.address.value}`),
    );
    page.targets.address.addEventListener("change", () =>
      events.push(`change:${page.targets.address.value}`),
    );

    const result = await run(
      selecting({
        postalCode: "63309",
        address: "제주특별자치도 제주시 첨단로 243",
      }),
      page,
    );

    expect(result.status).toBe("manual");
    expect(result.reason).toContain("프로필과 달라");
    expect(page.targets.postalCode!.value).toBe("");
    expect(page.targets.address.value).toBe("");
    expect(page.targets.detail.value).toBe("");
    expect(events).toEqual(["input:", "change:"]);
  });

  it("restores a value that existed before the search when the postal code differs", async () => {
    const page = setup();
    page.targets.postalCode!.value = expected.postalCode;
    page.targets.detail.value = expected.detail;

    const result = await run(
      selecting({ postalCode: "63310", address: expected.address }),
      page,
    );

    expect(result.status).toBe("manual");
    expect(result.reason).toContain("프로필과 달라");
    expect(page.targets.postalCode!.value).toBe(expected.postalCode);
    expect(page.targets.address.value).toBe("");
    expect(page.targets.detail.value).toBe(expected.detail);
  });

  it("checks the selected postal code on a form without a postcode field", async () => {
    const page = setup(false);

    const result = await run(
      selecting({ postalCode: "63310", address: expected.address }),
      page,
    );

    expect(result.status).toBe("manual");
    expect(result.reason).toContain("프로필과 달라");
    expect(page.targets.address.value).toBe("");
  });

  it("restores an address the site wrote instead of the selected one", async () => {
    const page = setup();

    const result = await run(async (actual, maySelect, _signal, onSelected) => {
      expect(await maySelect()).toBe(true);
      onSelected?.(actual);
      page.targets.postalCode!.value = actual.postalCode;
      page.targets.address.value = "제주특별자치도 제주시 다른로 1";
      return true;
    }, page);

    expect(result.status).toBe("manual");
    expect(result.reason).toContain("프로필과 달라");
    expect(page.targets.address.value).toBe("");
    expect(page.targets.postalCode!.value).toBe("");
  });

  it("keeps the shortened province and road reference the site writes", async () => {
    const page = setup();

    const result = await run(
      selecting({
        postalCode: "63309",
        address: "제주 제주시 첨단로 242 (영평동)",
      }),
      page,
    );

    expect(result.status).toBe("written");
    expect(page.targets.address.value).toBe("제주 제주시 첨단로 242 (영평동)");
    expect(page.targets.detail.value).toBe(expected.detail);
  });

  it("leaves untouched fields alone when the site never answers", async () => {
    vi.useFakeTimers();
    const page = setup();
    const events: string[] = [];
    page.targets.address.addEventListener("input", () => events.push("input"));

    const pending = run(async (actual, maySelect, _signal, onSelected) => {
      expect(await maySelect()).toBe(true);
      onSelected?.(actual);
      return true;
    }, page);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.status).toBe("manual");
    expect(result.reason).not.toContain("프로필과 달라");
    expect(events).toEqual([]);
  });

  it("never puts address values in the reported reason", async () => {
    const page = setup();
    const written = "제주특별자치도 제주시 첨단로 243";

    const result = await run(
      selecting({ postalCode: "63310", address: written }),
      page,
    );

    expect(result.reason).not.toContain(written);
    expect(result.reason).not.toContain("63310");
    expect(result.reason).not.toContain(expected.address);
    expect(result.reason).not.toContain(expected.postalCode);
  });

  it("reports the item for review and writes nothing through the workflow", async () => {
    const page = setup();
    const rows = [
      ["f0", "zip", true],
      ["f1", "road", true],
      ["f2", "detail", false],
    ] as const;
    const fields = rows.map(([candidateId, domId, readonly]) => ({
      candidateId,
      domId,
      element: "input",
      control: "text",
      visibility: "visible",
      readonly,
      disabled: false,
      inert: false,
    }));
    const elements = [
      page.targets.postalCode!,
      page.targets.address,
      page.targets.detail,
    ];
    const snapshot = {
      request: { snapshotId: "s", sections: [{ fields }] },
      registry: {
        lookupField: (id: string) => ({
          status: "ready",
          handle: { elements: [elements[Number(id.slice(1))]] },
        }),
      },
    } as unknown as ReturnType<typeof collectFieldsSnapshot>;
    const keys = ["postalCode", "addressLine1", "addressLine2"];
    const analysis = {
      mode: "GENERIC",
      fields: keys.map((key, index) => ({
        candidateId: `f${index}`,
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: `contact.contact.${key}`,
        },
      })),
    } as unknown as FieldsAnalyzeResponse;
    // A profile without a verified marker takes the same check.
    const profile = createEmptyProfile();
    profile.contact = {
      postalCode: expected.postalCode,
      addressLine1: expected.address,
      addressLine2: expected.detail,
    };
    const setAddressResult = vi.fn();
    const onWriteResult = vi.fn();
    const run: Parameters<typeof runAddressAnalysis>[0]["run"] = {
      controller: new AbortController(),
      button: page.button,
    };

    const result = await runAddressAnalysis({
      analysis,
      snapshot,
      adapter: {} as unknown as WorkflowAdapter,
      run,
      pageDocument: document,
      profile,
      repository: { load: async () => profile },
      addressSearch: selecting({
        postalCode: "63309",
        address: "제주특별자치도 제주시 첨단로 243",
      }),
      onWriteResult,
      setAddressResult,
    });

    expect(setAddressResult).not.toHaveBeenCalled();
    expect(run.genericAddressRows?.map((row) => row.candidateId)).toEqual([
      "f0",
      "f1",
      "f2",
    ]);
    expect(run.genericAddressRows?.[0]?.addressManualReason).toContain(
      "프로필과 달라",
    );
    expect(onWriteResult).not.toHaveBeenCalled();
    expect(result?.fields).toEqual([]);
    expect(elements.map((element) => element.value)).toEqual(["", "", ""]);
  });
});

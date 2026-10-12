import { afterEach, expect, it, vi } from "vitest";
import { validatePreparationResponse } from "../../api/validate-response";
import { greetingAddressTrigger, runGreetingAddress } from "./address";
import { greetingCollectionAdapter } from "./collection";

afterEach(() => document.body.replaceChildren());

const expected = {
  postalCode: "06152",
  address: "서울특별시 강남구 테헤란로 305",
  detail: "10층",
};

function fixture(results: Array<[string, string]>) {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>현주소*</label><input name="personalInformation.currentAddress.postalCode" readonly><input name="personalInformation.currentAddress.address" readonly><button type="button">주소 찾기</button><input name="personalInformation.currentAddress.detailedAddress"></div><div role="dialog" data-scope="dialog" data-part="content" data-state="closed"><button type="button" data-scope="dialog" data-part="close-trigger" aria-label="close"></button><input type="search"><div data-scope="scroll-area" data-part="content"></div></div>`;
  const [zip, address, detail] = [
    ...document.querySelectorAll<HTMLInputElement>("input[name]"),
  ];
  const button = document.querySelector<HTMLButtonElement>("button")!;
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const query = dialog.querySelector<HTMLInputElement>('input[type="search"]')!;
  const list = dialog.querySelector<HTMLElement>('[data-part="content"]')!;
  const field = zip.parentElement!;
  const close = () => {
    requestAnimationFrame(() => {
      dialog.setAttribute("data-state", "closed");
      field.removeAttribute("aria-hidden");
    });
  };
  button.onclick = () => {
    field.setAttribute("aria-hidden", "true");
    dialog.setAttribute("data-state", "open");
  };
  dialog.querySelector<HTMLButtonElement>("button")!.onclick = close;
  query.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    queueMicrotask(() => {
      list.innerHTML = results
        .map(
          ([road, postal]) =>
            `<div><span>건물</span><div><span>주소</span>${road}</div><div><span>우편번호</span>${postal}</div></div>`,
        )
        .join("");
      [...list.children].forEach((row, index) => {
        (row as HTMLElement).onclick = () => {
          zip.value = results[index][1];
          address.value = results[index][0];
          close();
        };
      });
    });
  });
  return { zip, address, detail, button, dialog, query };
}

function run(button: Element, overrides: Partial<typeof expected> = {}) {
  const value = { ...expected, ...overrides };
  return runGreetingAddress({
    document,
    button,
    expected: value,
    loadCurrent: async () => value,
    signal: new AbortController().signal,
    search: vi.fn(),
  });
}

it("names only the verified current-address search button", () => {
  const { button, zip } = fixture([]);
  expect(greetingAddressTrigger(document)).toBe(button);
  expect(greetingCollectionAdapter.actionDomId(button)).toBe(
    "greeting:search:address",
  );
  zip.readOnly = false;
  expect(greetingAddressTrigger(document)).toBeUndefined();
  expect(greetingCollectionAdapter.actionDomId(button)).toBeUndefined();
});

it("accepts the Greeting address search action in preparation responses", () => {
  const request = {
    schemaVersion: 2 as const,
    snapshotId: "p",
    site: { host: "careers.example.test", pathPattern: "/ko/o/*/apply" },
    sections: [
      {
        sectionId: "s",
        actionCandidates: [
          {
            candidateId: "a",
            domId: "greeting:search:address",
            element: "button" as const,
            control: "button" as const,
            visibility: "visible" as const,
          },
        ],
      },
    ],
  };
  const response = {
    snapshotId: "p",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: [
      {
        actionCandidateId: "a",
        command: "SEARCH_ADDRESS",
        expectedEffect: "ADDRESS_SELECTED",
      },
    ],
  };
  expect(validatePreparationResponse(request, response)).toEqual(response);
});

it("selects the only exact search result and then writes the detail", async () => {
  const { zip, address, detail, button, dialog, query } = fixture([
    ["서울특별시 강남구 테헤란로 303", "06151"],
    [expected.address, expected.postalCode],
  ]);

  await expect(run(button)).resolves.toMatchObject({ status: "written" });
  expect(query.value).toBe(expected.address);
  expect([zip.value, address.value, detail.value]).toEqual([
    expected.postalCode,
    expected.address,
    expected.detail,
  ]);
  expect(dialog.getAttribute("data-state")).toBe("closed");
  expect(zip.closest('[aria-hidden="true"]')).toBeNull();
});

it.each([
  [
    "duplicate exact results",
    [
      [expected.address, expected.postalCode],
      [expected.address, expected.postalCode],
    ],
  ],
  ["a different postal code", [[expected.address, "06153"]]],
] as Array<[string, Array<[string, string]>]>)(
  "leaves the address blank and closes the dialog for %s",
  async (_name, results) => {
    const { zip, address, detail, button, dialog } = fixture(results);

    await expect(run(button)).resolves.toMatchObject({ status: "manual" });
    expect([zip.value, address.value, detail.value]).toEqual(["", "", ""]);
    expect(dialog.getAttribute("data-state")).toBe("closed");
    expect(zip.closest('[aria-hidden="true"]')).toBeNull();
  },
);

it("does not open the search over a different existing address", async () => {
  const { zip, address, button, dialog } = fixture([
    [expected.address, expected.postalCode],
  ]);
  zip.value = "04524";
  address.value = "서울특별시 중구 세종대로 110";
  const click = vi.spyOn(button, "click");

  await expect(run(button)).resolves.toMatchObject({ status: "manual" });
  expect(click).not.toHaveBeenCalled();
  expect(dialog.getAttribute("data-state")).toBe("closed");
});

it("preserves detail entered during the final profile check", async () => {
  const { zip, address, detail, button } = fixture([]);
  zip.value = expected.postalCode;
  address.value = expected.address;
  const loadCurrent = vi
    .fn()
    .mockResolvedValueOnce(expected)
    .mockImplementationOnce(async () => {
      detail.value = "사용자가 입력한 상세주소";
      detail.dispatchEvent(new Event("input", { bubbles: true }));
      return expected;
    });

  await expect(
    runGreetingAddress({
      document,
      button,
      expected,
      loadCurrent,
      signal: new AbortController().signal,
      search: vi.fn(),
    }),
  ).resolves.toMatchObject({ status: "manual" });
  expect(detail.value).toBe("사용자가 입력한 상세주소");
});

it("does not select a result that becomes ambiguous during the profile check", async () => {
  const { zip, address, detail, button, dialog } = fixture([
    [expected.address, expected.postalCode],
  ]);
  const selected = vi.fn();
  const loadCurrent = vi
    .fn()
    .mockResolvedValueOnce(expected)
    .mockImplementationOnce(async () => {
      const list = dialog.querySelector('[data-scope="scroll-area"]')!;
      const row = list.firstElementChild!;
      row.addEventListener("click", selected);
      list.append(row.cloneNode(true));
      return expected;
    })
    .mockResolvedValue(expected);

  await expect(
    runGreetingAddress({
      document,
      button,
      expected,
      loadCurrent,
      signal: new AbortController().signal,
      search: vi.fn(),
    }),
  ).resolves.toMatchObject({ status: "manual" });
  expect(selected).not.toHaveBeenCalled();
  expect([zip.value, address.value, detail.value]).toEqual(["", "", ""]);
  expect(dialog.getAttribute("data-state")).toBe("closed");
  expect(zip.closest('[aria-hidden="true"]')).toBeNull();
});

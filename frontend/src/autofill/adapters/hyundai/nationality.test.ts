import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { runHyundaiNationality } from "./nationality";

const NATIONALITY = "대한민국";
const NATIONALITY_CODE = "KR";

function nationalityItem(
  overrides: Partial<ReviewPlanItem> = {},
): ReviewPlanItem {
  return {
    candidateId: "nationality-1",
    fieldLabel: "국적",
    currentValue: "",
    profileValue: NATIONALITY,
    previewValue: NATIONALITY,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: "nationality-1",
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.nationality",
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
    ...overrides,
  };
}

function renderNationalityFields(): {
  display: HTMLInputElement;
  hidden: HTMLInputElement;
  results: HTMLUListElement;
  otherDisplay: HTMLInputElement;
  otherHidden: HTMLInputElement;
} {
  document.body.innerHTML = `
    <div class="field search" id="nationality-field-1">
      <input
        id="nationCd1Nm"
        name="nationCd1Nm"
        type="text"
        data-auto-type="basic"
        data-auto-api="0200"
        data-auto-params="0003"
      />
      <input type="hidden" name="nationCd1" />
      <div class="field-search-view">
        <ul class="search-result-list"></ul>
      </div>
    </div>
    <div class="field search" id="nationality-field-2">
      <input
        id="nationCd2Nm"
        name="nationCd2Nm"
        type="text"
        value="기존 제2국적"
        data-search-result="기존 제2국적"
        data-auto-type="basic"
        data-auto-api="0200"
        data-auto-params="0003"
      />
      <input type="hidden" name="nationCd2" value="SECOND" />
      <div class="field-search-view">
        <ul class="search-result-list"></ul>
      </div>
    </div>
  `;
  return {
    display: document.querySelector<HTMLInputElement>("#nationCd1Nm")!,
    hidden: document.querySelector<HTMLInputElement>("[name='nationCd1']")!,
    results: document.querySelector<HTMLUListElement>(
      "#nationality-field-1 .search-result-list",
    )!,
    otherDisplay: document.querySelector<HTMLInputElement>("#nationCd2Nm")!,
    otherHidden:
      document.querySelector<HTMLInputElement>("[name='nationCd2']")!,
  };
}

function nationalityHandle(display: HTMLInputElement): FieldCandidateHandle {
  return {
    kind: "field",
    candidateId: "nationality-1",
    sectionId: "personal",
    signature: "fixture-nationality-1",
    candidate: {
      candidateId: "nationality-1",
      visibility: "visible",
      displayName: "국적",
      domId: "nationCd1Nm",
      domName: "nationCd1Nm",
      element: "input",
      control: "text",
    },
    elements: [display],
    optionElements: new Map(),
  };
}

function resultButton({
  code = NATIONALITY_CODE,
  search = NATIONALITY,
  result = NATIONALITY,
}: {
  code?: string;
  search?: string;
  result?: string;
} = {}): HTMLButtonElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "auto_result";
  button.dataset.code = code;
  button.dataset.search = search;
  button.dataset.result = result;
  button.textContent = result;
  item.append(button);
  return button;
}

function installSelectionBehavior(
  button: HTMLButtonElement,
  display: HTMLInputElement,
  hidden: HTMLInputElement,
): void {
  button.addEventListener("click", () => {
    hidden.value = button.dataset.code ?? "";
    display.value = button.dataset.result ?? "";
    display.dataset.searchResult = button.dataset.result ?? "";
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
});

describe("Hyundai primary nationality search", () => {
  it("selects the fresh unique exact result after keyup and leaves nationality 2 untouched", async () => {
    const { display, hidden, results, otherDisplay, otherHidden } =
      renderNationalityFields();
    const stale = resultButton();
    results.append(stale.parentElement!);
    let staleClicks = 0;
    let keyups = 0;
    stale.addEventListener("click", () => {
      staleClicks += 1;
    });
    display.addEventListener("keyup", () => {
      keyups += 1;
      queueMicrotask(() => {
        const fresh = resultButton();
        installSelectionBehavior(fresh, display, hidden);
        results.replaceChildren(fresh.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(true);

    expect(keyups).toBe(1);
    expect(staleClicks).toBe(0);
    expect(display.value).toBe(NATIONALITY);
    expect(display.dataset.searchResult).toBe(NATIONALITY);
    expect(hidden.value).toBe(NATIONALITY_CODE);
    expect(otherDisplay.value).toBe("기존 제2국적");
    expect(otherDisplay.dataset.searchResult).toBe("기존 제2국적");
    expect(otherHidden.value).toBe("SECOND");
  });

  it("accepts an already confirmed exact nationality without searching again", async () => {
    const { display, hidden } = renderNationalityFields();
    display.value = NATIONALITY;
    display.dataset.searchResult = NATIONALITY;
    hidden.value = NATIONALITY_CODE;
    let keyups = 0;
    display.addEventListener("keyup", () => {
      keyups += 1;
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(true);
    expect(keyups).toBe(0);
  });

  it("rejects anything other than the verified direct READY contract", async () => {
    const { display, hidden } = renderNationalityFields();
    const handle = nationalityHandle(display);
    const notReady = nationalityItem();
    notReady.analysis = {
      ...notReady.analysis!,
      interactionStatus: "UNVERIFIED",
    };
    const wrongBinding = nationalityItem();
    wrongBinding.analysis = {
      ...wrongBinding.analysis!,
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.gender",
      },
    };

    await expect(
      runHyundaiNationality(document, handle, notReady),
    ).resolves.toBe(false);
    await expect(
      runHyundaiNationality(document, handle, wrongBinding),
    ).resolves.toBe(false);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("accepts the verified nationality LOOKUP contract", async () => {
    const { display, hidden, results } = renderNationalityFields();
    const item = nationalityItem();
    item.analysis = {
      ...item.analysis!,
      valueBinding: {
        type: "LOOKUP",
        profileFieldKey: "personal.personal.nationality",
        optionMap: { 대한민국: NATIONALITY },
      },
    };
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const button = resultButton();
        installSelectionBehavior(button, display, hidden);
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(document, nationalityHandle(display), item),
    ).resolves.toBe(true);
    expect(hidden.value).toBe(NATIONALITY_CODE);
  });

  it.each([
    "https://example.com/apply/applyWrite.hc",
    "https://talent.hyundai.com/apply/other.hc",
  ])("rejects an unverified page URL %s", async (url) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({ url });
    const { display } = renderNationalityFields();
    let keyups = 0;
    display.addEventListener("keyup", () => {
      keyups += 1;
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(keyups).toBe(0);
    expect(display.value).toBe("");
  });

  it("rejects a lookalike field whose live search attributes are not exact", async () => {
    const { display, hidden } = renderNationalityFields();
    display.dataset.autoParams = "0045";
    let keyups = 0;
    display.addEventListener("keyup", () => {
      keyups += 1;
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(keyups).toBe(0);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("preserves a different existing value and an unconfirmed matching value", async () => {
    const first = renderNationalityFields();
    first.display.value = "미국";
    first.hidden.value = "US";
    first.display.dataset.searchResult = "미국";

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(first.display),
        nationalityItem({ currentValue: "미국" }),
      ),
    ).resolves.toBe(false);
    expect(first.display.value).toBe("미국");
    expect(first.hidden.value).toBe("US");

    const second = renderNationalityFields();
    second.display.value = NATIONALITY;
    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(second.display),
        nationalityItem({ currentValue: NATIONALITY }),
      ),
    ).resolves.toBe(false);
    expect(second.display.value).toBe(NATIONALITY);
    expect(second.hidden.value).toBe("");
  });

  it.each([
    ["multiple exact results", [resultButton(), resultButton()]],
    [
      "the same exact label with conflicting codes",
      [resultButton(), resultButton({ code: "XX" })],
    ],
    ["a code mismatch", [resultButton({ code: "XX" })]],
    ["no matching result", [resultButton({ result: "다른 국가" })]],
  ])("rejects %s and restores the blank input", async (_name, buttons) => {
    const { display, hidden, results } = renderNationalityFields();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        for (const button of buttons) {
          button.addEventListener("click", () => {
            clicks += 1;
          });
        }
        results.replaceChildren(
          ...buttons.map((button) => button.parentElement!),
        );
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(display.value).toBe("");
    expect(display.dataset.searchResult).toBeUndefined();
    expect(hidden.value).toBe("");
  });

  it("preserves a late user edit instead of clicking the arriving result", async () => {
    const { display, hidden, results } = renderNationalityFields();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        display.value = "사용자 수정";
        const button = resultButton();
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(display.value).toBe("사용자 수정");
    expect(hidden.value).toBe("");
  });

  it("does not click a fresh exact result hidden by an ancestor", async () => {
    const { display, hidden, results } = renderNationalityFields();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const button = resultButton();
        button.parentElement!.hidden = true;
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("preserves late hidden-code and confirmation-marker edits", async () => {
    const { display, hidden, results } = renderNationalityFields();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        hidden.value = "USER";
        display.dataset.searchResult = "사용자 확정값";
        const button = resultButton();
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(hidden.value).toBe("USER");
    expect(display.dataset.searchResult).toBe("사용자 확정값");
  });

  it("rechecks the exact live field after the result click", async () => {
    const { display, hidden, results } = renderNationalityFields();
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const button = resultButton();
        installSelectionBehavior(button, display, hidden);
        button.addEventListener("click", () => {
          display.dataset.autoParams = "changed";
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
  });

  it("does not use a stale input after the page replaces it", async () => {
    const { display, hidden, results } = renderNationalityFields();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        display.replaceWith(display.cloneNode(true));
        const button = resultButton();
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(hidden.value).toBe("");
  });

  it("cancels before a late search result can be selected", async () => {
    const { display, hidden, results } = renderNationalityFields();
    const controller = new AbortController();
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        controller.abort();
        queueMicrotask(() => {
          const button = resultButton();
          button.addEventListener("click", () => {
            clicks += 1;
          });
          results.append(button.parentElement!);
        });
      });
    });

    await expect(
      runHyundaiNationality(
        document,
        nationalityHandle(display),
        nationalityItem(),
        controller.signal,
      ),
    ).resolves.toBe(false);
    await Promise.resolve();
    expect(clicks).toBe(0);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });
});

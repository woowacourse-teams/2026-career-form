import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { runHyundaiEducationSearch } from "./school-search";

interface SearchCase {
  itemGroupId: string;
  domName: "schNm" | "majorNm";
  autoType: "school" | "basic";
  hiddenName: "schCd" | "major";
  params: "0045" | "0047" | "0015";
  profileFieldKey: string;
  query: string;
  code: string;
  resultText: string;
}

const SEARCH_CASES: readonly SearchCase[] = [
  {
    itemGroupId: "educationhighschool",
    domName: "schNm",
    autoType: "school",
    hiddenName: "schCd",
    params: "0045",
    profileFieldKey: "education.highSchool.schoolName",
    query: "서울고등학교",
    code: "0000123456",
    resultText: "서울고등학교 - 서울",
  },
  {
    itemGroupId: "educationuniversity",
    domName: "schNm",
    autoType: "school",
    hiddenName: "schCd",
    params: "0047",
    profileFieldKey: "education.university.schoolName",
    query: "서울대학교",
    code: "0000561026",
    resultText: "서울대학교 - 서울관악",
  },
  {
    itemGroupId: "educationgraduateschool",
    domName: "schNm",
    autoType: "school",
    hiddenName: "schCd",
    params: "0047",
    profileFieldKey: "education.graduateSchool.schoolName",
    query: "서울대학교",
    code: "0000561026",
    resultText: "서울대학교 - 서울관악",
  },
  {
    itemGroupId: "educationuniversity",
    domName: "majorNm",
    autoType: "basic",
    hiddenName: "major",
    params: "0015",
    profileFieldKey: "education.university.majorName",
    query: "컴퓨터공학",
    code: "03677",
    resultText: "컴퓨터공학",
  },
  {
    itemGroupId: "educationgraduateschool",
    domName: "majorNm",
    autoType: "basic",
    hiddenName: "major",
    params: "0015",
    profileFieldKey: "education.graduateSchool.majorName",
    query: "컴퓨터공학",
    code: "03677",
    resultText: "컴퓨터공학",
  },
];

function itemFor(search: SearchCase): ReviewPlanItem {
  return {
    candidateId: "education-search-1",
    fieldLabel: search.domName === "schNm" ? "학교명" : "전공명",
    currentValue: "",
    profileValue: search.query,
    previewValue: search.query,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: "education-search-1",
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: search.profileFieldKey,
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  };
}

function renderSearch(search: SearchCase): {
  display: HTMLInputElement;
  hidden: HTMLInputElement;
  results: HTMLUListElement;
  otherDisplay: HTMLInputElement;
  otherHidden: HTMLInputElement;
} {
  document.body.innerHTML = `
    <article id="academic" class="field-form-apply">
      <div class="field-content" id="target-row">
        <div class="field-group">
          <div class="field search" id="target-field">
            <input type="hidden" name="${search.hiddenName}" />
            <input
              id="${search.domName}_1"
              name="${search.domName}"
              type="text"
              data-auto-type="${search.autoType}"
              data-auto-api="0200"
              data-auto-params="${search.params}"
            />
            <div class="field-search-view">
              <ul class="search-result-list"></ul>
            </div>
          </div>
        </div>
      </div>
      <div class="field-content" id="other-row">
        <div class="field-group">
          <div class="field search">
            <input type="hidden" name="${search.hiddenName}" value="OTHER" />
            <input
              id="${search.domName}_2"
              name="${search.domName}"
              type="text"
              value="기존 다른 행 값"
              data-search-result="기존 다른 행 값"
              data-auto-type="${search.autoType}"
              data-auto-api="0200"
              data-auto-params="${search.params}"
            />
            <div class="field-search-view">
              <ul class="search-result-list"></ul>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
  return {
    display: document.querySelector<HTMLInputElement>(
      `#target-field #${search.domName}_1`,
    )!,
    hidden: document.querySelector<HTMLInputElement>(
      `#target-field input[name='${search.hiddenName}']`,
    )!,
    results: document.querySelector<HTMLUListElement>(
      "#target-field .search-result-list",
    )!,
    otherDisplay: document.querySelector<HTMLInputElement>(
      `#other-row #${search.domName}_2`,
    )!,
    otherHidden: document.querySelector<HTMLInputElement>(
      `#other-row input[name='${search.hiddenName}']`,
    )!,
  };
}

function handleFor(
  search: SearchCase,
  display: HTMLInputElement,
): FieldCandidateHandle {
  return {
    kind: "field",
    candidateId: "education-search-1",
    sectionId: "academic",
    itemId: "education-item-1",
    itemIndex: 0,
    itemGroupId: search.itemGroupId,
    signature: `fixture-${search.domName}-1`,
    candidate: {
      candidateId: "education-search-1",
      visibility: "visible",
      displayName: search.domName === "schNm" ? "학교명" : "전공명",
      domId: `${search.domName}_1`,
      domName: search.domName,
      element: "input",
      control: "text",
    },
    elements: [display],
    optionElements: new Map(),
  };
}

function resultButton(
  search: SearchCase,
  overrides: { code?: string; search?: string; result?: string } = {},
): HTMLButtonElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "auto_result";
  button.dataset.code = overrides.code ?? search.code;
  button.dataset.search = overrides.search ?? search.query;
  button.dataset.result = overrides.result ?? search.query;
  button.textContent = search.resultText;
  item.append(button);
  return button;
}

function installSelection(
  button: HTMLButtonElement,
  display: HTMLInputElement,
  hidden: HTMLInputElement,
): void {
  button.addEventListener("click", () => {
    display.value = button.dataset.result ?? "";
    display.dataset.searchResult = button.dataset.result ?? "";
    hidden.value = button.dataset.code ?? "";
  });
}

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("Hyundai education normal search", () => {
  it.each(SEARCH_CASES)(
    "selects the fresh exact result for $profileFieldKey",
    async (search) => {
      const { display, hidden, results, otherDisplay, otherHidden } =
        renderSearch(search);
      const stale = resultButton(search);
      results.append(stale.parentElement!);
      let staleClicks = 0;
      let keyups = 0;
      stale.addEventListener("click", () => {
        staleClicks += 1;
      });
      display.addEventListener("keyup", () => {
        keyups += 1;
        queueMicrotask(() => {
          const fresh = resultButton(search);
          installSelection(fresh, display, hidden);
          results.replaceChildren(fresh.parentElement!);
        });
      });

      await expect(
        runHyundaiEducationSearch(
          document,
          handleFor(search, display),
          itemFor(search),
        ),
      ).resolves.toBe(true);

      expect(keyups).toBe(1);
      expect(staleClicks).toBe(0);
      expect(display.value).toBe(search.query);
      expect(display.dataset.searchResult).toBe(search.query);
      expect(hidden.value).toBe(search.code);
      expect(otherDisplay.value).toBe("기존 다른 행 값");
      expect(otherHidden.value).toBe("OTHER");
    },
  );

  it("accepts an already confirmed dynamic code without searching", async () => {
    const search = SEARCH_CASES[1]!;
    const { display, hidden } = renderSearch(search);
    display.value = search.query;
    display.dataset.searchResult = search.query;
    hidden.value = search.code;
    let keyups = 0;
    display.addEventListener("keyup", () => {
      keyups += 1;
    });

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        itemFor(search),
      ),
    ).resolves.toBe(true);
    expect(keyups).toBe(0);
  });

  it("rejects a wrong education group or profile binding before keyup", async () => {
    const search = SEARCH_CASES[1]!;
    const { display } = renderSearch(search);
    const wrongGroup = handleFor(search, display);
    wrongGroup.itemGroupId = "educationgraduateschool";
    const wrongBinding = itemFor(search);
    wrongBinding.analysis = {
      ...wrongBinding.analysis!,
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "education.graduateSchool.schoolName",
      },
    };
    let keyups = 0;
    display.addEventListener("keyup", () => {
      keyups += 1;
    });

    await expect(
      runHyundaiEducationSearch(document, wrongGroup, itemFor(search)),
    ).resolves.toBe(false);
    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        wrongBinding,
      ),
    ).resolves.toBe(false);
    expect(keyups).toBe(0);
    expect(display.value).toBe("");
  });

  it("rejects a high-school major and an incorrect live API parameter", async () => {
    const major = SEARCH_CASES[3]!;
    const rendered = renderSearch(major);
    const highSchoolMajor = handleFor(major, rendered.display);
    highSchoolMajor.itemGroupId = "educationhighschool";

    await expect(
      runHyundaiEducationSearch(document, highSchoolMajor, itemFor(major)),
    ).resolves.toBe(false);

    rendered.display.dataset.autoParams = "0047";
    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(major, rendered.display),
        itemFor(major),
      ),
    ).resolves.toBe(false);
    expect(rendered.display.value).toBe("");
  });

  it.each([
    ["school", SEARCH_CASES[1]!, "basic"],
    ["major", SEARCH_CASES[3]!, "school"],
  ] as const)(
    "rejects a $kind field when its live auto type is $invalidAutoType",
    async (_kind, search, invalidAutoType) => {
      const { display, hidden } = renderSearch(search);
      display.dataset.autoType = invalidAutoType;
      let keyups = 0;
      display.addEventListener("keyup", () => {
        keyups += 1;
      });

      await expect(
        runHyundaiEducationSearch(
          document,
          handleFor(search, display),
          itemFor(search),
        ),
      ).resolves.toBe(false);

      expect(keyups).toBe(0);
      expect(display.value).toBe("");
      expect(hidden.value).toBe("");
    },
  );

  it("preserves a different existing value and an unconfirmed matching value", async () => {
    const search = SEARCH_CASES[1]!;
    const first = renderSearch(search);
    first.display.value = "기존 학교";
    first.display.dataset.searchResult = "기존 학교";
    first.hidden.value = "OLD";
    const existingItem = itemFor(search);
    existingItem.currentValue = "기존 학교";

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, first.display),
        existingItem,
      ),
    ).resolves.toBe(false);
    expect(first.display.value).toBe("기존 학교");
    expect(first.hidden.value).toBe("OLD");

    const second = renderSearch(search);
    second.display.value = search.query;
    const unconfirmedItem = itemFor(search);
    unconfirmedItem.currentValue = search.query;
    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, second.display),
        unconfirmedItem,
      ),
    ).resolves.toBe(false);
    expect(second.display.value).toBe(search.query);
    expect(second.hidden.value).toBe("");
  });

  it.each(["", "9999"])(
    "rejects the unsafe result code %j and restores the blank input",
    async (code) => {
      const search = SEARCH_CASES[1]!;
      const { display, hidden, results } = renderSearch(search);
      let clicks = 0;
      display.addEventListener("keyup", () => {
        queueMicrotask(() => {
          const button = resultButton(search, { code });
          button.addEventListener("click", () => {
            clicks += 1;
          });
          results.append(button.parentElement!);
        });
      });

      await expect(
        runHyundaiEducationSearch(
          document,
          handleFor(search, display),
          itemFor(search),
        ),
      ).resolves.toBe(false);
      expect(clicks).toBe(0);
      expect(display.value).toBe("");
      expect(hidden.value).toBe("");
    },
  );

  it("rejects multiple exact results without clicking either", async () => {
    const search = SEARCH_CASES[3]!;
    const { display, hidden, results } = renderSearch(search);
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const buttons = [resultButton(search), resultButton(search)];
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
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        itemFor(search),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("preserves a late user edit and respects cancellation", async () => {
    const search = SEARCH_CASES[1]!;
    const first = renderSearch(search);
    let clicks = 0;
    first.display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        first.display.value = "사용자 수정";
        const button = resultButton(search);
        button.addEventListener("click", () => {
          clicks += 1;
        });
        first.results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, first.display),
        itemFor(search),
      ),
    ).resolves.toBe(false);
    expect(first.display.value).toBe("사용자 수정");
    expect(clicks).toBe(0);

    const second = renderSearch(search);
    const controller = new AbortController();
    second.display.addEventListener("keyup", () => {
      queueMicrotask(() => controller.abort());
    });
    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, second.display),
        itemFor(search),
        controller.signal,
      ),
    ).resolves.toBe(false);
    expect(second.display.value).toBe("");
  });

  it("does not click a fresh exact result hidden by an ancestor", async () => {
    const search = SEARCH_CASES[1]!;
    const { display, hidden, results } = renderSearch(search);
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const button = resultButton(search);
        button.parentElement!.hidden = true;
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        itemFor(search),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(display.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("preserves late hidden-code and confirmation-marker edits", async () => {
    const search = SEARCH_CASES[1]!;
    const { display, hidden, results } = renderSearch(search);
    let clicks = 0;
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        hidden.value = "USER";
        display.dataset.searchResult = "사용자 확정값";
        const button = resultButton(search);
        button.addEventListener("click", () => {
          clicks += 1;
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        itemFor(search),
      ),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
    expect(hidden.value).toBe("USER");
    expect(display.dataset.searchResult).toBe("사용자 확정값");
  });

  it("rechecks the exact live field after the result click", async () => {
    const search = SEARCH_CASES[1]!;
    const { display, hidden, results } = renderSearch(search);
    display.addEventListener("keyup", () => {
      queueMicrotask(() => {
        const button = resultButton(search);
        installSelection(button, display, hidden);
        button.addEventListener("click", () => {
          display.dataset.autoParams = "changed";
        });
        results.append(button.parentElement!);
      });
    });

    await expect(
      runHyundaiEducationSearch(
        document,
        handleFor(search, display),
        itemFor(search),
      ),
    ).resolves.toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../../profile/model";
import { prepareHyundaiEducation } from "./education";

const EDUCATION_OPTIONS = [
  ["고등학교", "3"],
  ["전문대학", "4"],
  ["학사", "5"],
  ["석사", "6"],
  ["박사", "7"],
] as const;

function setUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

beforeEach(() => {
  setUrl("https://talent.hyundai.com/apply/applyWrite.hc");
});

afterEach(() => {
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

function appendEducationRow(article: HTMLElement, index: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "field-content";
  row.innerHTML = `<div class="field-group"><div class="field"><div class="select-wrap"><input class="js-field" type="hidden" name="schGb" /><input type="hidden" name="rowSequence" value="${index}" /><input class="btn-select" type="button" id="schGb_${index}" value="" /><div class="select-option education-option"></div></div></div></div><input type="checkbox" name="finalEducation" value="Y" /><div class="button-wrap"><button class="btn-group-add" type="button">추가</button></div>`;
  const hidden = row.querySelector<HTMLInputElement>("input[name='schGb']")!;
  const trigger = row.querySelector<HTMLInputElement>(`#schGb_${index}`)!;
  const options = row.querySelector<HTMLElement>(".education-option")!;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn-option-reset";
  reset.dataset.code = "";
  reset.textContent = "선택하세요.";
  reset.addEventListener("click", () => {
    hidden.value = "";
    trigger.value = "";
    row
      .querySelectorAll<HTMLInputElement>(".js-education input")
      .forEach((input) => {
        input.value = "";
      });
  });
  options.append(reset);
  for (const [label, code] of EDUCATION_OPTIONS) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.dataset.code = code;
    choice.textContent = label;
    choice.addEventListener("click", () => {
      hidden.value = code;
      trigger.value = label;
      row.insertAdjacentHTML(
        "beforeend",
        `<div class="js-education"><input type="text" id="schNm_${index}" name="schNm" /><input type="text" id="whiStDt_${index}" maxlength="7" /><input type="text" id="whiEndDt_${index}" maxlength="7" /></div>`,
      );
    });
    options.append(choice);
  }
  const footer = article.querySelector(".field-footer");
  if (footer) footer.before(row);
  else article.append(row);
  return row;
}

function installForm(initialRows = 1): { article: HTMLElement } {
  document.body.innerHTML = `<article id="academic" class="field-form-apply"></article>`;
  const article = document.querySelector<HTMLElement>("#academic")!;
  const bindAdd = (row: HTMLElement) => {
    row
      .querySelector<HTMLButtonElement>(".button-wrap .btn-group-add")!
      .addEventListener("click", () => {
        article.dataset.clicks = String(
          Number(article.dataset.clicks ?? "0") + 1,
        );
        const next = appendEducationRow(
          article,
          article.querySelectorAll(":scope > .field-content").length + 1,
        );
        bindAdd(next);
      });
  };
  for (let index = 1; index <= initialRows; index += 1) {
    bindAdd(appendEducationRow(article, index));
  }
  return { article };
}

function profileWithEducation(entries: Profile["education"]): Profile {
  const profile = createEmptyProfile();
  profile.education = entries;
  return profile;
}

describe("prepareHyundaiEducation", () => {
  it("adds only the missing Hyundai rows and selects each profile education kind", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
      {
        id: "college",
        sectionId: "university",
        values: { degreeLevel: "전문학사" },
      },
      {
        id: "master",
        sectionId: "graduateSchool",
        values: { degreeLevel: "석사" },
      },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      true,
    );

    expect(article.querySelectorAll(":scope > .field-content")).toHaveLength(3);
    expect(article.dataset.clicks).toBe("2");
    expect(
      Array.from(
        article.querySelectorAll<HTMLInputElement>("input[name='schGb']"),
        (input) => input.value,
      ),
    ).toEqual(["3", "4", "6"]);
    expect(
      article.querySelectorAll(".js-education input[name='schNm']"),
    ).toHaveLength(3);
    expect(
      article.querySelector<HTMLInputElement>("input[name='finalEducation']")
        ?.checked,
    ).toBe(false);
  });

  it("rejects another host before it changes the Hyundai academic row", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    setUrl("https://example.test/apply/applyWrite.hc");

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it("rejects a second high-school entry before adding or selecting", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high-1", sectionId: "highSchool", values: {} },
      { id: "high-2", sectionId: "highSchool", values: {} },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it("does not click an exact choice hidden by the site limit", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const choice = article.querySelector<HTMLButtonElement>(
      "button[data-code='3']",
    )!;
    choice.style.display = "none";

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it.each(["disabled", "hidden"])(
    "does not click a %s add action",
    async (state) => {
      const { article } = installForm();
      const add = article.querySelector<HTMLButtonElement>(".btn-group-add")!;
      if (state === "disabled") add.disabled = true;
      else add.style.display = "none";
      const profile = profileWithEducation([
        { id: "high", sectionId: "highSchool", values: {} },
        {
          id: "bachelor",
          sectionId: "university",
          values: { degreeLevel: "학사" },
        },
      ]);

      await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
        false,
      );

      expect(article.dataset.clicks).toBeUndefined();
    },
  );

  it.each(["disabled", "hidden"])(
    "does not click a %s education trigger",
    async (state) => {
      const { article } = installForm();
      const trigger = article.querySelector<HTMLInputElement>("#schGb_1")!;
      if (state === "disabled") trigger.disabled = true;
      else trigger.style.display = "none";
      const profile = profileWithEducation([
        { id: "high", sectionId: "highSchool", values: {} },
      ]);

      await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
        false,
      );

      expect(
        article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
      ).toBe("");
    },
  );

  it("keeps a compatible existing row and does not add another row when rerun", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const row = article.querySelector<HTMLElement>(":scope > .field-content")!;
    row.querySelector<HTMLButtonElement>("button[data-code='3']")!.click();
    row.querySelector<HTMLInputElement>("#schNm_1")!.value = "기존 학교";

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      true,
    );

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      row.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("3");
    expect(row.querySelector<HTMLInputElement>("#schNm_1")!.value).toBe(
      "기존 학교",
    );
  });

  it("refuses to change a selected row whose kind does not match the profile order", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const row = article.querySelector<HTMLElement>(":scope > .field-content")!;
    row.querySelector<HTMLButtonElement>("button[data-code='5']")!.click();

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      row.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("5");
  });

  it("rejects an unsupported profile degree before clicking or adding a row", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      {
        id: "integrated",
        sectionId: "graduateSchool",
        values: { degreeLevel: "석박사통합" },
      },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it("rejects a duplicated option without changing the empty row", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const duplicate = document.createElement("button");
    duplicate.dataset.code = "3";
    duplicate.textContent = "고등학교";
    article.querySelector(".education-option")!.append(duplicate);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it("stops before it clicks when the caller cancels", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareHyundaiEducation(document, profile, controller.signal),
    ).resolves.toBe(false);

    expect(article.dataset.clicks).toBeUndefined();
    expect(
      article.querySelector<HTMLInputElement>("input[name='schGb']")!.value,
    ).toBe("");
  });

  it("fails when a selection click makes the target row stale", async () => {
    const { article } = installForm();
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
    ]);
    const row = article.querySelector<HTMLElement>(":scope > .field-content")!;
    row
      .querySelector<HTMLInputElement>("#schGb_1")!
      .addEventListener("click", () => {
        row.remove();
      });

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );
  });

  it("fails when adding a row changes an existing selected row", async () => {
    const { article } = installForm();
    const row = article.querySelector<HTMLElement>(":scope > .field-content")!;
    row.querySelector<HTMLButtonElement>("button[data-code='3']")!.click();
    const schoolName = row.querySelector<HTMLInputElement>("#schNm_1")!;
    schoolName.value = "기존 학교";
    row
      .querySelector<HTMLButtonElement>(".btn-group-add")!
      .addEventListener("click", () => {
        schoolName.value = "사용자 변경";
      });
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
      {
        id: "bachelor",
        sectionId: "university",
        values: { degreeLevel: "학사" },
      },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(schoolName.value).toBe("사용자 변경");
  });

  it("fails when adding a row changes a checked control in an existing row", async () => {
    const { article } = installForm();
    const row = article.querySelector<HTMLElement>(":scope > .field-content")!;
    row.querySelector<HTMLButtonElement>("button[data-code='3']")!.click();
    const finalEducation = row.querySelector<HTMLInputElement>(
      "input[name='finalEducation']",
    )!;
    finalEducation.checked = true;
    row
      .querySelector<HTMLButtonElement>(".btn-group-add")!
      .addEventListener("click", () => {
        finalEducation.checked = false;
      });
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
      {
        id: "bachelor",
        sectionId: "university",
        values: { degreeLevel: "학사" },
      },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      false,
    );

    expect(finalEducation.checked).toBe(false);
  });

  it("resets only its newly cloned row before selecting the next profile kind", async () => {
    document.body.innerHTML = `<article id="academic" class="field-form-apply"></article>`;
    const article = document.querySelector<HTMLElement>("#academic")!;
    const first = appendEducationRow(article, 1);
    const hidden = first.querySelector<HTMLInputElement>(
      "input[name='schGb']",
    )!;
    const trigger = first.querySelector<HTMLInputElement>("#schGb_1")!;
    first.querySelector<HTMLButtonElement>("button[data-code='3']")!.click();
    first.querySelector<HTMLInputElement>("#schNm_1")!.value = "기존 학교";
    const add = first.querySelector<HTMLButtonElement>(".btn-group-add")!;
    let resetClicks = 0;
    add.addEventListener("click", () => {
      const clone = first.cloneNode(true) as HTMLElement;
      clone.querySelector<HTMLInputElement>("#schGb_1")!.id = "schGb_2";
      clone.querySelector<HTMLInputElement>("#schNm_1")!.id = "schNm_2";
      clone.querySelector<HTMLInputElement>("#whiStDt_1")!.id = "whiStDt_2";
      clone.querySelector<HTMLInputElement>("#whiEndDt_1")!.id = "whiEndDt_2";
      const cloneHidden = clone.querySelector<HTMLInputElement>(
        "input[name='schGb']",
      )!;
      const cloneTrigger = clone.querySelector<HTMLInputElement>("#schGb_2")!;
      const cloneMenu = clone.querySelector<HTMLElement>(".education-option")!;
      cloneMenu.style.display = "none";
      cloneTrigger.addEventListener("click", () => {
        cloneMenu.style.display = "block";
      });
      clone
        .querySelectorAll<HTMLButtonElement>("button[data-code]")
        .forEach((choice) => {
          choice.addEventListener("click", () => {
            cloneHidden.value = choice.dataset.code!;
            cloneTrigger.value = choice.textContent!;
          });
        });
      clone
        .querySelector<HTMLButtonElement>(".btn-option-reset")!
        .addEventListener("click", () => {
          resetClicks += 1;
          if (cloneMenu.style.display !== "block") return;
          cloneHidden.value = "";
          cloneTrigger.value = "";
          clone
            .querySelectorAll<HTMLInputElement>(".js-education input")
            .forEach((input) => {
              input.value = "";
            });
        });
      article.append(clone);
    });
    const profile = profileWithEducation([
      { id: "high", sectionId: "highSchool", values: {} },
      {
        id: "bachelor",
        sectionId: "university",
        values: { degreeLevel: "학사" },
      },
    ]);

    await expect(prepareHyundaiEducation(document, profile)).resolves.toBe(
      true,
    );

    expect(hidden.value).toBe("3");
    expect(trigger.value).toBe("고등학교");
    expect(first.querySelector<HTMLInputElement>("#schNm_1")!.value).toBe(
      "기존 학교",
    );
    expect(
      article.querySelectorAll<HTMLInputElement>("input[name='schGb']")[1]!
        .value,
    ).toBe("5");
    expect(article.querySelector<HTMLInputElement>("#schGb_2")!.value).toBe(
      "학사",
    );
    expect(article.querySelector<HTMLInputElement>("#schNm_2")!.value).toBe("");
    expect(resetClicks).toBe(1);
  });
});

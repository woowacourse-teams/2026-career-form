import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectFieldsSnapshot } from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { hyundaiWriteAdapter } from "./write";
import {
  buttonItem,
  gpaItem,
  renderExactButton,
} from "./write-military-veteran.test-fixtures";

const GPA_SCALES = [
  ["4.0", "4"],
  ["4.3", "4.3"],
  ["4.5", "4.5"],
  ["100", "100"],
] as const;

function renderGpa(
  display: string,
  code: string,
  rowNumber = 1,
  itemIndex = 0,
): {
  trigger: HTMLInputElement;
  resultHidden: HTMLInputElement;
  directHidden: HTMLInputElement;
  otherHidden: HTMLInputElement;
  handle: FieldCandidateHandle;
  clicks: () => number;
} {
  document.body.innerHTML = `
    <div class="field-content">
      <div class="field-group">
        <div class="field">
          <div class="select-wrap">
            <input type="hidden" class="js-field" name="directRcdperf" />
            <input type="hidden" class="js-field" name="rcdPerf" />
            <input type="button" id="rcdPerf_${rowNumber}" data-codegb="0017" />
            <div class="select-option">
              <button type="button" data-code="${code}">${display}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="field-content" id="other-row">
      <div class="select-wrap">
        <input type="hidden" class="js-field" name="rcdPerf" value="OTHER" />
        <input type="button" id="rcdPerf_99" data-codegb="0017" value="기존값" />
      </div>
    </div>
  `;
  const trigger = document.querySelector<HTMLInputElement>(
    `#rcdPerf_${rowNumber}`,
  )!;
  const resultHidden = document.querySelector<HTMLInputElement>(
    "input[name='rcdPerf']",
  )!;
  const directHidden = document.querySelector<HTMLInputElement>(
    "input[name='directRcdperf']",
  )!;
  const otherHidden = document.querySelector<HTMLInputElement>(
    "#other-row input[name='rcdPerf']",
  )!;
  const option = document.querySelector<HTMLButtonElement>(
    ".select-option button",
  )!;
  Object.defineProperty(option, "offsetParent", { value: document.body });
  let selectionClicks = 0;
  option.addEventListener("click", () => {
    selectionClicks += 1;
    trigger.value = display;
    resultHidden.value = code;
  });
  return {
    trigger,
    resultHidden,
    directHidden,
    otherHidden,
    handle: {
      kind: "field",
      candidateId: "hyundai-gpa-scale-1",
      sectionId: "academic",
      itemId: "university-1",
      itemIndex,
      itemGroupId: "educationuniversity",
      signature: "gpa-scale-1",
      candidate: {
        candidateId: "hyundai-gpa-scale-1",
        visibility: "visible",
        displayName: "만점기준",
        domId: `rcdPerf_${rowNumber}`,
        element: "input",
        control: "button",
      },
      elements: [trigger],
      optionElements: new Map(),
    },
    clicks: () => selectionClicks,
  };
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

describe("Hyundai GPA scale button", () => {
  it.each(GPA_SCALES)(
    "writes display %s and exact hidden code %s without touching direct input",
    (display, code) => {
      const rendered = renderGpa(display, code);
      const item = gpaItem(display, code);

      expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
        handled: true,
        written: true,
      });
      expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
        handled: true,
        written: true,
      });
      expect(rendered.trigger.value).toBe(display);
      expect(rendered.resultHidden.value).toBe(code);
      expect(rendered.directHidden.value).toBe("");
      expect(rendered.otherHidden.value).toBe("OTHER");
      expect(rendered.clicks()).toBe(1);
    },
  );

  it("preserves a different existing GPA scale", () => {
    const rendered = renderGpa("4.5", "4.5");
    rendered.trigger.value = "4.3";
    rendered.resultHidden.value = "4.3";
    const item = gpaItem("4.5", "4.5");
    item.currentValue = "4.3";

    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(rendered.trigger.value).toBe("4.3");
    expect(rendered.resultHidden.value).toBe("4.3");
    expect(rendered.clicks()).toBe(0);
    item.currentValue = "";
    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(rendered.clicks()).toBe(0);
  });

  it("binds the first university profile entry to its physical education row", () => {
    const rendered = renderGpa("4.5", "4.5", 2, 0);

    expect(
      hyundaiWriteAdapter.tryWrite(rendered.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: true });
    expect(rendered.resultHidden.value).toBe("4.5");
    expect(rendered.directHidden.value).toBe("");
  });

  it("rejects an unsupported GPA code and a non-university row", () => {
    const unsupported = renderGpa("5.0", "5");
    expect(
      hyundaiWriteAdapter.tryWrite(unsupported.handle, gpaItem("5.0", "5")),
    ).toEqual({ handled: true, written: false });
    expect(unsupported.clicks()).toBe(0);

    const wrongGroup = renderGpa("4.5", "4.5");
    wrongGroup.handle.itemGroupId = "educationgraduateschool";
    expect(
      hyundaiWriteAdapter.tryWrite(wrongGroup.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(wrongGroup.clicks()).toBe(0);
  });

  it("rejects a mismatched candidate identity", () => {
    const mismatched = renderGpa("4.5", "4.5");
    mismatched.handle.candidate.domId = "rcdPerf_2";
    expect(
      hyundaiWriteAdapter.tryWrite(mismatched.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(mismatched.clicks()).toBe(0);
  });

  it("rejects a mismatched live GPA code group", () => {
    const wrongCodeGroup = renderGpa("4.5", "4.5");
    wrongCodeGroup.trigger.dataset.codegb = "9999";
    expect(
      hyundaiWriteAdapter.tryWrite(
        wrongCodeGroup.handle,
        gpaItem("4.5", "4.5"),
      ),
    ).toEqual({ handled: true, written: false });
    expect(wrongCodeGroup.clicks()).toBe(0);
  });

  it("rejects duplicate same-row GPA hidden targets", () => {
    const rendered = renderGpa("4.5", "4.5");
    const duplicate = document.createElement("input");
    duplicate.type = "hidden";
    duplicate.className = "js-field";
    duplicate.name = "rcdPerf";
    rendered.trigger.closest(".select-wrap")!.prepend(duplicate);

    expect(
      hyundaiWriteAdapter.tryWrite(rendered.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(rendered.clicks()).toBe(0);
  });
});

function educationButtonItem(
  candidateId: string,
  profileFieldKey: string,
  display: string,
  code: string,
): ReviewPlanItem {
  return buttonItem(candidateId, profileFieldKey, display, code);
}

function renderAcademicSelection({
  id,
  name,
  codegb,
  profileFieldKey,
  display,
  code,
  group = "educationuniversity",
  extra = "",
}: {
  id: string;
  name: string;
  codegb: string;
  profileFieldKey: string;
  display: string;
  code: string;
  group?:
    "educationuniversity" | "educationgraduateschool" | "educationhighschool";
  extra?: string;
}) {
  const index = 1;
  document.body.innerHTML = `<article id="academic" class="field-form-apply"><div class="field-content"><div class="field-group"><div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="${name}"><input type="${id.startsWith("schClass") ? "button" : "text"}" class="btn-select ${extra}" id="${id}" data-codegb="${codegb}"><div class="select-option"><button type="button" data-code="${code}">${display}</button></div></div></div></div></div></article>`;
  const trigger = document.querySelector<HTMLInputElement>(`#${id}`)!;
  const hidden = document.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  )!;
  const choice = document.querySelector<HTMLButtonElement>(
    ".select-option button",
  )!;
  Object.defineProperty(choice, "offsetParent", { value: document.body });
  choice.addEventListener("click", () => {
    trigger.value = display;
    hidden.value = code;
  });
  const candidateId = `academic-${id}`;
  return {
    trigger,
    hidden,
    choice,
    item: educationButtonItem(candidateId, profileFieldKey, display, code),
    handle: {
      kind: "field",
      candidateId,
      sectionId: "academic",
      itemGroupId: group,
      itemIndex: index - 1,
      signature: id,
      candidate: {
        candidateId,
        visibility: "visible",
        domId: id,
        domName: undefined,
        element: "input",
        control: id.startsWith("schClass") ? "button" : "text",
      },
      elements: [trigger],
      optionElements: new Map(),
    } as FieldCandidateHandle,
  };
}

describe("Hyundai academic attendance and location writer", () => {
  it("writes only verified university attendance codes and display", () => {
    const fixture = renderAcademicSelection({
      id: "schClass_1",
      name: "schClass",
      codegb: "0155",
      profileFieldKey: "education.university.attendanceType",
      display: "주간",
      code: "D",
    });

    expect(hyundaiWriteAdapter.tryWrite(fixture.handle, fixture.item)).toEqual({
      handled: true,
      written: true,
    });
    expect(fixture.trigger.value).toBe("주간");
    expect(fixture.hidden.value).toBe("D");
  });

  it("writes country before exact unique city and never broad Seoul district", () => {
    const country = renderAcademicSelection({
      id: "locNation_1",
      name: "locNation",
      codegb: "0003",
      profileFieldKey: "education.university.schoolRegion",
      display: "대한민국",
      code: "KR",
      extra: "js-refer btn-new-loc locNa",
    });
    expect(hyundaiWriteAdapter.tryWrite(country.handle, country.item)).toEqual({
      handled: true,
      written: true,
    });

    const wrap = country.trigger.closest(".field-content")!;
    wrap.insertAdjacentHTML(
      "beforeend",
      `<div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="locCity"><input type="text" class="btn-select js-target btn-new-loc locNa" id="locCity_1" data-target-codegb="0013" data-refer="locNation" data-attr1="KR"><div class="select-option"><button type="button" data-code="01510">서울관악</button><button type="button" data-code="95">서울</button></div></div></div>`,
    );
    const city = document.querySelector<HTMLInputElement>("#locCity_1")!;
    const cityHidden = document.querySelector<HTMLInputElement>(
      "input[name='locCity']",
    )!;
    const cityChoices = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "#locCity_1 + .select-option button",
      ),
    );
    cityChoices.forEach((choice) => {
      Object.defineProperty(choice, "offsetParent", { value: document.body });
      choice.addEventListener("click", () => {
        city.value = choice.textContent ?? "";
        cityHidden.value = choice.dataset.code ?? "";
      });
    });
    const cityCandidateId = "academic-locCity";
    const cityItem = educationButtonItem(
      cityCandidateId,
      "education.university.schoolRegion",
      "서울",
      "95",
    );
    const cityHandle = {
      ...country.handle,
      candidateId: cityCandidateId,
      signature: "locCity_1",
      candidate: {
        ...country.handle.candidate,
        candidateId: cityCandidateId,
        domId: "locCity_1",
        domName: undefined,
        control: "text",
      },
      elements: [city],
    } as FieldCandidateHandle;
    expect(hyundaiWriteAdapter.tryWrite(cityHandle, cityItem)).toEqual({
      handled: true,
      written: true,
    });
    expect(city.value).toBe("서울");
    expect(cityHidden.value).toBe("95");
  });

  it("rejects wrong groups, duplicate hidden inputs, and duplicate live city labels", () => {
    const attendance = renderAcademicSelection({
      id: "schClass_1",
      name: "schClass",
      codegb: "0155",
      profileFieldKey: "education.university.attendanceType",
      display: "야간",
      code: "N",
      group: "educationhighschool",
    });
    expect(
      hyundaiWriteAdapter.tryWrite(attendance.handle, attendance.item),
    ).toEqual({ handled: true, written: false });

    const location = renderAcademicSelection({
      id: "locCity_1",
      name: "locCity",
      codegb: "0013",
      profileFieldKey: "education.university.schoolRegion",
      display: "서울",
      code: "95",
      extra: "js-target btn-new-loc locNa",
    });
    location.trigger.dataset.refer = "locNation";
    location.trigger.dataset.attr1 = "KR";
    location.trigger
      .closest(".select-wrap")!
      .insertAdjacentHTML(
        "afterbegin",
        '<input type="hidden" class="js-field" name="locCity">',
      );
    expect(
      hyundaiWriteAdapter.tryWrite(location.handle, location.item),
    ).toEqual({ handled: true, written: false });
  });
});

describe("Hyundai academic collected no-name triggers", () => {
  it("writes a live-style collected attendance trigger whose name exists only on its hidden field", () => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://talent.hyundai.com/apply/applyWrite.hc",
    });
    document.body.innerHTML = `<article id="academic" class="field-form-apply"><div class="field-content"><div class="field-group"><div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="schGb" value="5"><input type="button" id="schGb_1" value="학사"><div class="select-option"><button type="button" data-code="5">학사</button></div></div></div><div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="schClass"><input type="button" class="btn-select" id="schClass_1" data-codegb="0155"><div class="select-option"><button type="button" data-code="D">주간</button></div></div></div></div></div></article>`;
    const option = document.querySelector<HTMLButtonElement>(
      "#schClass_1 + .select-option button",
    )!;
    Object.defineProperty(option, "offsetParent", { value: document.body });
    option.addEventListener("click", () => {
      document.querySelector<HTMLInputElement>("#schClass_1")!.value = "주간";
      document.querySelector<HTMLInputElement>(
        "input[name='schClass']",
      )!.value = "D";
    });

    const snapshot = collectFieldsSnapshot(document);
    const field = snapshot.request.sections
      .flatMap((section) => section.items?.flatMap((item) => item.fields) ?? [])
      .find((candidate) => candidate.domId === "schClass_1")!;
    const lookup = snapshot.registry.lookupField(field.candidateId);
    expect(field.domName).toBeUndefined();
    expect(lookup.status).toBe("ready");
    if (lookup.status !== "ready") throw new Error("missing collected handle");
    const item = educationButtonItem(
      field.candidateId,
      "education.university.attendanceType",
      "주간",
      "D",
    );

    expect(hyundaiWriteAdapter.tryWrite(lookup.handle, item)).toEqual({
      handled: true,
      written: true,
    });
  });
});

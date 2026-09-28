import { beforeEach as useGreetingHost } from "vitest";
useGreetingHost(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://kakaomobility.career.greetinghr.com/ko/o/1/apply",
  });
});
import { mockGreetingEditingCommand } from "../interaction/test-utils/greeting-email-editing";
import { afterEach, beforeEach, expect, it } from "vitest";
let restoreEditingCommand: (() => void) | undefined;
beforeEach(() => {
  restoreEditingCommand = mockGreetingEditingCommand(document);
});
afterEach(() => restoreEditingCommand?.());

import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  captureGreetingResultTargets,
  recollectGreetingResultRegistry,
} from "../workflow/greeting-result-registry";
import { executeApprovedWritesAfterPageSettles } from "./executor";
import { installGreetingEmailCloseBridge } from "../interaction/greeting-email-close-bridge";

beforeEach(() => installGreetingEmailCloseBridge(document));
afterEach(() => document.body.replaceChildren());

it.each([false, true])(
  "settles Greeting email before recollection or a later Escape driver (later driver: %s)",
  async (laterDriver) => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이메일주소*</label><input type="email" role="combobox" data-scope="combobox" data-part="input" aria-expanded="false" aria-controls="email-popup"><button type="button" disabled>이메일 확인</button></div><div data-scope="scroll-area" data-part="root"><div id="email-popup" data-scope="scroll-area" data-part="viewport" role="presentation"></div></div><input name="basicInformation.name"><div id="education" data-scope="field" data-part="root"><label>대학교*</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="educationalBackground.universities.0.schoolName"></div></div></div>`;
    const input = document.querySelector<HTMLInputElement>(
      "input[role='combobox']",
    )!;
    const education = document.querySelector<HTMLElement>("#education")!;
    const confirm = input.parentElement!.querySelector("button")!;
    installGreetingEmailCloseBridge(document);
    let blurredBeforeAcceptance = false;
    input.addEventListener("blur", () => {
      if (confirm.disabled) blurredBeforeAcceptance = true;
    });
    let activated = false;
    let accepted = "";
    let commitTimer: ReturnType<typeof setTimeout>;
    let expandedBeforeLaterDriver = false;
    input.addEventListener("click", () => {
      activated = true;
    });
    input.addEventListener("input", () => {
      const value = activated ? input.value : "";
      setTimeout(() => {
        // Greeting's popup performs delayed autofocus. Blurring before this
        // transition prevents the focused-page widget from accepting the edit.
        input.focus();
        input.setAttribute("aria-expanded", "true");
        education.setAttribute("aria-hidden", "true");
      }, 40);
      commitTimer = setTimeout(() => {
        if (blurredBeforeAcceptance) return;
        accepted = value;
        input.value = value;
        confirm.disabled = false;
      }, 900);
    });
    input.addEventListener("keydown", (event) => {
      if (
        event.key !== "Escape" ||
        input.getAttribute("aria-expanded") !== "true"
      )
        return;
      clearTimeout(commitTimer);
      accepted = "";
      input.value = "";
    });
    document.body.addEventListener("pointerdown", (event) => {
      if (event.target !== document.body) return;
      if (confirm.disabled) {
        clearTimeout(commitTimer);
        input.value = "";
      }
      input.setAttribute("aria-expanded", "false");
      education.removeAttribute("aria-hidden");
    });
    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.domName === "basicInformation.email")!;
    const item = {
      candidateId: candidate.candidateId,
      profileValue: "example@example.test",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: candidate.candidateId,
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "contact.contact.email",
        },
      },
    } as ReviewPlanItem;
    const name = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.domName === "basicInformation.name")!;
    const nameItem = {
      ...item,
      candidateId: name.candidateId,
      profileValue: "테스트",
      analysis: {
        ...item.analysis!,
        candidateId: name.candidateId,
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "personal.personal.koreanGivenName",
        },
      },
    } as ReviewPlanItem;
    const items = laterDriver ? [item, nameItem] : [item];
    const captured = captureGreetingResultTargets(snapshot.registry, items);
    const result = await executeApprovedWritesAfterPageSettles({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
      beforeWrite: async (next) => {
        if (next === item) return;
        await new Promise((resolve) => setTimeout(resolve, 60));
        expandedBeforeLaterDriver =
          input.getAttribute("aria-expanded") === "true";
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      },
      settledRegistry: () => {
        expect(education.hasAttribute("aria-hidden")).toBe(false);
        return recollectGreetingResultRegistry(document, captured, [item]);
      },
    });
    expect(blurredBeforeAcceptance).toBe(false);
    expect(expandedBeforeLaterDriver).toBe(false);
    expect(accepted).toBe("example@example.test");
    expect(input.value).toBe("example@example.test");
    expect(result[0]).toEqual({
      candidateId: item.candidateId,
      status: "written",
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(education.hasAttribute("aria-hidden")).toBe(false);
  },
);

function fixture(gpa = false, veteran = false, phone = false) {
  const name = gpa
    ? "educationalBackground.universities.0.gpa.score"
    : veteran
      ? "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber"
      : phone
        ? "basicInformation.phoneNumber.nationalNumber"
        : "basicInformation.name";
  document.body.innerHTML = `<input name="${name}" /><button name="educationalBackground.universities.0.gpa.scoreScale">4.5</button>`;
  const input = document.querySelector("input")!;
  const item: ReviewPlanItem = {
    candidateId: "field",
    fieldLabel: "테스트 필드",
    profileFieldKey: gpa
      ? "education.university.gpaScore"
      : veteran
        ? "veteran.veteran.veteranNumber"
        : phone
          ? "contact.contact.phoneNumber"
          : "personal.personal.koreanGivenName",
    currentValue: "",
    profileValue: gpa
      ? "4.20"
      : veteran
        ? "12-345678"
        : phone
          ? "010-0000-0000"
          : "테스트",
    previewValue: "",
    selected: true,
    disabled: false,
    revealed: true,
    status: "available",
    reason: "",
    ...(gpa
      ? {
          greetingGpaApproval: {
            rowName: "educationalBackground.universities.0",
            score: "4.20",
            scale: "4.50",
          },
        }
      : {}),
    analysis: {
      candidateId: "field",
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      autofillPolicy: "ALLOWED",
      writePlan: { command: "SET_TEXT" },
      ...(phone
        ? {
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey: "contact.contact.phoneNumber",
            },
          }
        : {}),
    },
  };
  const collect = () => {
    const current = document.querySelector("input")!;
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field",
      sectionId: "section",
      signature: createStructuralSignature([current]),
      elements: [current],
      optionElements: new Map(),
      candidate: {
        candidateId: "field",
        domName: name,
        element: "input",
        control: "text",
        visibility: "visible",
      },
    });
    return registry;
  };
  const registry = collect();
  const options = {
    items: [item],
    approvedCandidateIds: new Set(["field"]),
    registry,
  };
  return { input, item, collect, options };
}

it("verifies a remounted Greeting input without repeating its successful mutation", async () => {
  const { input, collect, options } = fixture();
  let writes = 0;
  document.addEventListener("input", count);
  function count() {
    writes++;
  }
  input.addEventListener("input", () => {
    queueMicrotask(() => input.replaceWith(input.cloneNode(true)));
  });
  try {
    const results = await executeApprovedWritesAfterPageSettles({
      ...options,
      settledRegistry: collect,
      onResult: (_item, _result, registry) =>
        expect(registry).toBe(options.registry),
    });
    expect(results[0].status).toBe("written");
    expect(document.querySelector("input")!.value).toBe("테스트");
    expect(writes).toBe(1);
  } finally {
    document.removeEventListener("input", count);
  }
});

it("does not rewrite a Greeting value the page cleared after the first successful write", async () => {
  const { input, collect, options } = fixture();
  let writes = 0;
  input.addEventListener("input", () => {
    writes++;
    if (writes === 1)
      queueMicrotask(() => {
        input.value = "";
      });
  });
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: collect,
  });
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "RETAINED_VALUE_UNCONFIRMED",
  });
  expect(input.value).toBe("");
  expect(writes).toBe(1);
});

it("confirms the Greeting veteran number when the site removes its display hyphen", async () => {
  const { input, collect, options } = fixture(false, true);
  input.addEventListener("input", () => {
    queueMicrotask(() => {
      input.value = "12345678";
    });
  });
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: collect,
  });
  expect(input.value).toBe("12345678");
  expect(results[0]).toEqual({ candidateId: "field", status: "written" });
});

it("confirms the Greeting phone when the site removes display hyphens", async () => {
  const { input, collect, options } = fixture(false, false, true);
  input.addEventListener("input", () => {
    queueMicrotask(() => {
      input.value = "01000000000";
    });
  });
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: collect,
  });
  expect(input.value).toBe("01000000000");
  expect(results[0]).toEqual({ candidateId: "field", status: "written" });
});

it("requires the approved GPA scale to remain paired with a retained score", async () => {
  const { input, collect, options } = fixture(true);
  input.addEventListener("input", () => {
    queueMicrotask(() => {
      document.querySelector("button")!.textContent = "4.3";
    });
  });
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: collect,
  });
  expect(input.value).toBe("4.20");
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
  });
});

it("does not upgrade an initially skipped field using a matching settled value", async () => {
  const { input, collect, options } = fixture();
  input.disabled = true;
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: () => {
      input.value = "테스트";
      return collect();
    },
  });
  expect(results[0].status).toBe("skipped");
});

it("fails closed when the settled Greeting registry is unavailable", async () => {
  const { options } = fixture();
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: () => undefined,
  });
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "STALE_TARGET",
  });
});

it("requires verification when a remounted input has no rebound registry", async () => {
  const { input, options } = fixture();
  input.addEventListener("input", () => {
    queueMicrotask(() => input.replaceWith(input.cloneNode(true)));
  });
  const results = await executeApprovedWritesAfterPageSettles(options);
  expect(document.querySelector("input")!.value).toBe("테스트");
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "STALE_TARGET",
  });
});

it("fails closed when collecting the settled Greeting registry throws", async () => {
  const { options } = fixture();
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    settledRegistry: () => {
      throw new Error("collection failed");
    },
  });
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "STALE_TARGET",
  });
});

it("does not confirm a settled value after the run is aborted", async () => {
  const { collect, options } = fixture();
  const controller = new AbortController();
  const results = await executeApprovedWritesAfterPageSettles({
    ...options,
    signal: controller.signal,
    settledRegistry: () => {
      controller.abort();
      return collect();
    },
  });
  expect(results[0]).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "STALE_TARGET",
  });
});

it("keeps an independently retained native field verified when email settlement fails", async () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이메일주소*</label><input type="text" role="combobox" data-scope="combobox" data-part="input" aria-expanded="false"></div><input name="basicInformation.name"><input name="basicInformation.phoneNumber.nationalNumber">`;
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => section.fields);
  const items = ["basicInformation.email", "basicInformation.name"].map(
    (name, index) => {
      const candidate = fields.find((field) => field.domName === name)!;
      return {
        candidateId: candidate.candidateId,
        profileValue: index ? "테스트" : "example@example.test",
        selected: true,
        disabled: false,
        analysis: {
          candidateId: candidate.candidateId,
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: index
              ? "personal.personal.koreanGivenName"
              : "contact.contact.email",
          },
        },
      } as ReviewPlanItem;
    },
  );
  items.reverse();
  const phone = fields.find(
    (field) => field.domName === "basicInformation.phoneNumber.nationalNumber",
  )!;
  items.push({
    ...items[0],
    candidateId: phone.candidateId,
    profileValue: "01000000000",
    analysis: {
      ...items[0].analysis!,
      candidateId: phone.candidateId,
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "contact.contact.phoneNumber",
      },
    },
  } as ReviewPlanItem);
  let laterDriverRan = false;
  const input = document.querySelector("input")!;
  input.addEventListener("input", () =>
    queueMicrotask(() => {
      input.value = "";
    }),
  );
  const targets = captureGreetingResultTargets(snapshot.registry, items);
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
    registry: snapshot.registry,
    beforeWrite: async (item) => {
      if (item === items[2]) laterDriverRan = true;
    },
    settledRegistry: () =>
      recollectGreetingResultRegistry(document, targets, items),
  });
  expect(laterDriverRan).toBe(false);
  expect(results[2]).toMatchObject({ status: "skipped", code: "STALE_TARGET" });
  expect(results[1]).toMatchObject({
    status: "skipped",
    code: "RETAINED_VALUE_UNCONFIRMED",
  });
  expect(results[0]).toEqual({
    candidateId: items[0].candidateId,
    status: "written",
  });
  expect(
    document.querySelector<HTMLInputElement>('[name="basicInformation.name"]')!
      .value,
  ).toBe("테스트");
});

it("keeps Greeting readback when the first candidate is stale", async () => {
  document.body.innerHTML =
    '<input name="basicInformation.name"><input name="basicInformation.phoneNumber.nationalNumber">';
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => section.fields);
  const items = fields.map(
    (field, index) =>
      ({
        candidateId: field.candidateId,
        profileValue: index ? "01000000000" : "테스트",
        selected: true,
        disabled: false,
        analysis: {
          candidateId: field.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: index
              ? "contact.contact.phoneNumber"
              : "personal.personal.koreanGivenName",
          },
        },
      }) as ReviewPlanItem,
  );
  document.querySelector('input[name="basicInformation.name"]')!.remove();
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
    settledRegistry: () => undefined,
  });
  expect(results[0].status).toBe("skipped");
  expect(results[1]).toMatchObject({ status: "skipped", code: "STALE_TARGET" });
});

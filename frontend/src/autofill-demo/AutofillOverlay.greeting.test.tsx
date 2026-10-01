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
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import profileExportExample from "../../fixtures/profile-export.example.json";
import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type {
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
  PreparationPlan,
} from "../autofill/api/types";
import { createEmptyProfile } from "../profile/model";
import { parseProfileImport } from "../profile/profile-transfer";
import { AutofillOverlay } from "./AutofillOverlay";
import { createRepository } from "./AutofillOverlay.test-fixtures";

function greetingDocument(host: string): Document {
  const page = document.implementation.createHTMLDocument("greeting apply");
  return new Proxy(page, {
    get(target, key) {
      if (key === "location") {
        return { host, pathname: "/ko/o/235625/apply" };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function ControlledGreetingForm({ renderCount }: { renderCount: number }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <section aria-label="기본 정보" data-render-count={renderCount}>
      <div data-scope="field" data-part="root">
        <label>
          이름{" "}
          <input
            name="basicInformation.name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
      </div>
      <div data-scope="field" data-part="root">
        <label>
          전화번호{" "}
          <input
            name="basicInformation.phoneNumber.nationalNumber"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
        </label>
      </div>
      <label>
        이메일 <input name="basicInformation.email" />
      </label>
      <label>
        입학일 <input name="education.startDate" type="date" />
      </label>
      <input name="portfolio" type="file" />
      <button type="submit">제출</button>
    </section>
  );
}

function editInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Greeting with generic autofill controls", () => {
  it("prepares a new graduate row and its second major in one run", async () => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://kakaomobility.career.greetinghr.com/ko/o/235808/apply",
    });
    const page = document;
    page.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학원*</label>
      <div data-scope="accordion" data-part="root"></div>
      <button type="button" data-scope="tooltip" data-part="trigger">항목 추가</button>
    </div>`;
    const graduateSection = page.body.firstElementChild!;
    const rows = graduateSection.querySelector('[data-scope="accordion"]')!;
    const schoolAdd =
      graduateSection.querySelector<HTMLButtonElement>("button")!;
    let schoolClicks = 0;
    let majorClicks = 0;
    schoolAdd.addEventListener("click", () => {
      schoolClicks += 1;
      const prefix = "educationalBackground.graduateSchools.0";
      rows.innerHTML = `<div data-scope="accordion" data-part="item">
        <input name="${prefix}.schoolName" />
        <div data-scope="field" data-part="root"><label>전공*</label>
          <button type="button" name="${prefix}.majors.0.majorClassification">주전공</button>
          <button type="button" name="${prefix}.majors.0.majorField">공학계열</button>
          <input name="${prefix}.majors.0" role="combobox" />
          <button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button>
        </div>
      </div>`;
      const majorAdd = [
        ...rows.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.textContent === "전공 추가")!;
      majorAdd.addEventListener("click", () => {
        majorClicks += 1;
        majorAdd.insertAdjacentHTML(
          "beforebegin",
          `<button type="button" name="${prefix}.majors.1.majorClassification" aria-controls="major-choices" aria-expanded="false">주전공</button>
           <button type="button" name="${prefix}.majors.1.majorField">사회계열</button>
           <input name="${prefix}.majors.1" role="combobox" />`,
        );
        const classification = rows.querySelector<HTMLButtonElement>(
          `[name="${prefix}.majors.1.majorClassification"]`,
        )!;
        const popup = page.createElement("div");
        popup.id = "major-choices";
        popup.setAttribute("role", "listbox");
        popup.hidden = true;
        popup.innerHTML =
          '<button type="button" role="option">복수전공</button>';
        page.body.append(popup);
        classification.addEventListener("click", () => {
          popup.hidden = false;
          classification.setAttribute("aria-expanded", "true");
        });
        popup.querySelector("button")!.addEventListener("click", () => {
          classification.textContent = "복수전공";
          classification.setAttribute("aria-expanded", "false");
          popup.hidden = true;
        });
      });
    });
    const profile = createEmptyProfile();
    profile.education.push({
      id: "graduate-1",
      sectionId: "graduateSchool",
      values: {
        schoolName: "서울대학교 대학원",
        majorClassification: "주전공",
        majorField: "공학계열",
        majorName: "컴퓨터공학",
        additionalMajorClassification: "복수전공",
        additionalMajorField: "사회계열",
        additionalMajorName: "경영학",
      },
    });
    const preparationRequests: PreparationAnalyzeRequest[] = [];
    const apiClient = {
      analyzePreparation: async (request: PreparationAnalyzeRequest) => {
        preparationRequests.push(request);
        const preparationPlans: PreparationPlan[] = request.sections
          .flatMap((section) => section.actionCandidates)
          .filter((candidate) => candidate.domId?.startsWith("greeting:add:"))
          .map((candidate) => ({
            actionCandidateId: candidate.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          }));
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          preparationPlans,
        };
      },
      analyzeFields: async (request: FieldsAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "COMPLETE" as const,
        fields: request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .filter((field) =>
            field.domName?.endsWith(".majors.1.majorClassification"),
          )
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey:
                "education.graduateSchool.additionalMajorClassification",
            },
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SELECT_BUTTON_OPTION" as const },
          })),
      }),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={{ ...createRepository(), load: async () => profile }}
        pageDocument={page}
      />,
    );

    await screen.findByRole("heading", { name: "기입 결과" });
    expect(preparationRequests).toHaveLength(2);
    expect(schoolClicks).toBe(1);
    expect(majorClicks).toBe(1);
    expect(
      rows.querySelector<HTMLButtonElement>(
        '[name="educationalBackground.graduateSchools.0.majors.1.majorClassification"]',
      )?.textContent,
    ).toBe("복수전공");
    expect(
      rows.querySelectorAll(
        'input[name^="educationalBackground.graduateSchools.0.majors."]',
      ),
    ).toHaveLength(2);
  });

  it("collects the local adapter immediately and uses one preparation call", async () => {
    const page = greetingDocument("jobs.unregistered.example");
    render(<ControlledGreetingForm renderCount={0} />, {
      container: page.body,
    });
    const calls: string[] = [];
    const requests: PreparationAnalyzeRequest[] = [];
    const apiClient = {
      analyzePreparation: async (request: PreparationAnalyzeRequest) => {
        calls.push("preparation");
        requests.push(request);
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          preparationPlans: [],
        };
      },
      analyzeFields: async (request: FieldsAnalyzeRequest) => {
        calls.push("fields");
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [],
        };
      },
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={page}
      />,
    );
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(requests).toHaveLength(1);
    expect(calls).toEqual(["preparation", "fields"]);
  });
  it.each(["preparation", "fields", "llm-fields"] as const)(
    "stops when a known Greeting site receives generic %s",
    async (phase) => {
      const page = greetingDocument("jobs.unregistered.example");
      render(<ControlledGreetingForm renderCount={0} />, {
        container: page.body,
      });
      const apiClient = {
        analyzePreparation: async (request: PreparationAnalyzeRequest) => ({
          snapshotId: request.snapshotId,
          mode:
            phase === "preparation"
              ? ("GENERIC" as const)
              : ("ADAPTER" as const),
          analysisStatus: "COMPLETE" as const,
          preparationPlans: [],
        }),
        analyzeFields: async (request: FieldsAnalyzeRequest) =>
          ({
            snapshotId: request.snapshotId,
            mode: phase === "llm-fields" ? "ADAPTER" : "GENERIC",
            analysisStatus: "COMPLETE" as const,
            fields:
              phase === "llm-fields"
                ? request.sections
                    .flatMap((section) => section.fields)
                    .map((field) => ({
                      candidateId: field.candidateId,
                      matchType: "NO_MATCH",
                      mappingStatus: "LLM_SUGGESTED",
                      interactionStatus: "BLOCKED",
                      reasonCodes: ["NO_MATCH"],
                    }))
                : [],
          }) as import("../autofill/api/types").FieldsAnalyzeResponse,
      };
      render(
        <AutofillOverlay
          onClose={vi.fn()}
          apiClient={apiClient}
          repository={createRepository()}
          pageDocument={page}
        />,
      );
      await screen.findByRole("heading", {
        name:
          phase === "preparation"
            ? "분석을 완료하지 못했습니다"
            : "페이지 실행 방식이 변경되었습니다. 다시 시작해 주세요",
      });
      expect(
        page.querySelector<HTMLInputElement>("[name='basicInformation.name']")
          ?.value,
      ).toBe("");
    },
  );
  it.each([
    "kakaomobility.career.greetinghr.com",
    "career.hyundai-autoever.com",
    "jobs.unregistered.example",
  ])("uses full profile, writes only name and phone on %s", async (host) => {
    const page = greetingDocument(host);
    const form = render(<ControlledGreetingForm renderCount={0} />, {
      container: page.body,
    });
    const profile = parseProfileImport(JSON.stringify(profileExportExample));
    const seenRequests: unknown[] = [];
    const sendMessage = vi.fn(async (message: unknown) => {
      seenRequests.push(message);
      const typed = message as {
        type: string;
        payload: PreparationAnalyzeRequest | FieldsAnalyzeRequest;
      };
      if (typed.type === "AUTOFILL_ANALYZE_PREPARATION") {
        return {
          ok: true as const,
          data: {
            snapshotId: typed.payload.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          },
        };
      }
      const request = typed.payload as FieldsAnalyzeRequest;
      return {
        ok: true as const,
        data: {
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          fields: request.sections
            .flatMap((section) => section.fields)
            .map((field) => {
              if (field.domName === "basicInformation.name") {
                return {
                  candidateId: field.candidateId,
                  matchType: "MATCH",
                  valueBinding: {
                    type: "DERIVED",
                    recipe: "KOREAN_FULL_NAME",
                  },
                  autofillPolicy: "ALLOWED",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "READY",
                  writePlan: { command: "SET_TEXT" },
                };
              }
              if (
                field.domName === "basicInformation.phoneNumber.nationalNumber"
              ) {
                return {
                  candidateId: field.candidateId,
                  matchType: "MATCH",
                  valueBinding: {
                    type: "DIRECT",
                    profileFieldKey: "contact.contact.phoneNumber",
                  },
                  autofillPolicy: "ALLOWED",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "READY",
                  writePlan: { command: "SET_TEXT" },
                };
              }
              return {
                candidateId: field.candidateId,
                matchType: "NO_MATCH",
                mappingStatus: "ADAPTER_VERIFIED",
                interactionStatus: "BLOCKED",
                reasonCodes: ["NO_MATCH"],
              };
            }),
        },
      };
    });

    const overlay = render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={new RuntimeAnalysisApiClient(sendMessage)}
        repository={{ ...createRepository(), load: async () => profile }}
        pageDocument={page}
      />,
    );

    await screen.findByRole("heading", { name: "기입 결과" });
    form.rerender(<ControlledGreetingForm renderCount={1} />);
    expect(
      page.querySelector<HTMLInputElement>("[name='basicInformation.name']")
        ?.value,
    ).toBe("예시사용자");
    expect(
      page.querySelector<HTMLInputElement>(
        "[name='basicInformation.phoneNumber.nationalNumber']",
      )?.value,
    ).toBe("010-0000-0000");
    expect(
      page.querySelector<HTMLInputElement>("[name='basicInformation.email']")
        ?.value,
    ).toBe("");
    expect(
      page.querySelector<HTMLInputElement>("[name='education.startDate']")
        ?.value,
    ).toBe("");
    expect(JSON.stringify(seenRequests)).not.toContain("010-0000-0000");
    expect(JSON.stringify(seenRequests)).not.toContain("example@example.test");

    editInput(
      page.querySelector<HTMLInputElement>("[name='basicInformation.name']")!,
      "직접수정",
    );
    editInput(
      page.querySelector<HTMLInputElement>(
        "[name='basicInformation.phoneNumber.nationalNumber']",
      )!,
      "01099998888",
    );
    const conflictingValueWrites = vi.fn();
    page
      .querySelector("[name='basicInformation.name']")
      ?.addEventListener("input", conflictingValueWrites);
    page
      .querySelector("[name='basicInformation.phoneNumber.nationalNumber']")
      ?.addEventListener("input", conflictingValueWrites);
    overlay.unmount();
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={new RuntimeAnalysisApiClient(sendMessage)}
        repository={{ ...createRepository(), load: async () => profile }}
        pageDocument={page}
      />,
    );
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(
      page.querySelector<HTMLInputElement>("[name='basicInformation.name']")
        ?.value,
    ).toBe("직접수정");
    expect(
      page.querySelector<HTMLInputElement>(
        "[name='basicInformation.phoneNumber.nationalNumber']",
      )?.value,
    ).toBe("01099998888");
    expect(
      seenRequests.filter(
        (message) =>
          (message as { type?: string }).type === "AUTOFILL_ANALYZE_FIELDS",
      ),
    ).toHaveLength(2);
    expect(conflictingValueWrites).not.toHaveBeenCalled();
  });
});

it("stops before actions when an adapter response has only unowned Greeting name markers", async () => {
  const page = greetingDocument("jobs.unregistered.example");
  page.body.innerHTML =
    '<label>이름<input name="basicInformation.name"></label><label>전화번호<input name="basicInformation.phoneNumber.nationalNumber"></label>';
  const calls: string[] = [];
  render(
    <AutofillOverlay
      onClose={vi.fn()}
      repository={createRepository()}
      pageDocument={page}
      apiClient={{
        analyzePreparation: async (request) => {
          calls.push("preparation");
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          };
        },
        analyzeFields: async (request) => {
          calls.push("fields");
          return {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            fields: [],
          };
        },
      }}
    />,
  );
  await screen.findByRole("heading", { name: "분석을 완료하지 못했습니다" });
  expect(calls).toEqual(["preparation"]);
  expect(page.querySelector<HTMLInputElement>("input")!.value).toBe("");
});

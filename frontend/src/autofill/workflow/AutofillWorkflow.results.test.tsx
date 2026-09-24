import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => document.body.replaceChildren());
const client: AnalysisApiClient = {
  analyzePreparation: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: [],
  }),
  analyzeFields: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((section) => section.fields)
      .map((field) => ({
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: field.control === "select" ? "CONDITIONAL" : "ALLOWED",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey:
            field.control === "select"
              ? "personal.personal.nationality"
              : "personal.personal.koreanGivenName",
        },
        writePlan: {
          command: field.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
        },
      })),
  }),
};

it("keeps an unchanged value out of new-write totals while counting a verified conditional selection", async () => {
  document.body.innerHTML =
    '<label>이름<input value="테스트"></label><label>국적<select><option value="">선택</option><option value="KR">대한민국</option></select></label>';
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "테스트";
  profile.personal.nationality = "대한민국";
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={client}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(screen.getByLabelText("입력 완료 1개")).toBeVisible();
  expect(screen.queryByLabelText(/확인 필요 [1-9]/)).not.toBeInTheDocument();
  expect(document.querySelector("select")).toHaveValue("KR");
  expect(screen.queryByText(/건너뛴 항목 보기/)).not.toBeInTheDocument();
  expect(document.querySelector("input")).toHaveValue("테스트");
  expect(screen.queryByText("기존 값 유지")).not.toBeInTheDocument();
});

it("replaces the previous category highlights when another category is selected", async () => {
  document.body.innerHTML = `<section><label>이름<input name="name"></label><label>국적<select name="nationality"><option value="">선택</option><option value="KR">대한민국</option></select></label></section><section><label>번호<input name="phone"></label><label>주소<input name="address"></label></section><input name="untouched">`;
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성";
  profile.personal.nationality = "대한민국";
  profile.contact.phoneNumber = "01000000000";
  profile.contact.addressLine1 = "합성 주소";
  const bindings: Record<string, string> = {
    name: "personal.personal.koreanGivenName",
    nationality: "personal.personal.nationality",
    phone: "contact.contact.phoneNumber",
    address: "contact.contact.addressLine1",
  };
  const controls = [
    ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input,select",
    ),
  ];
  controls.forEach((element, index) => {
    element.getBoundingClientRect = () =>
      new DOMRect(40, 100 + index * 70, 300, 36);
  });
  document.querySelectorAll("section").forEach((section, index) => {
    section.getBoundingClientRect = () =>
      new DOMRect(20, 80 + index * 140, 340, 140);
  });
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={{
        ...client,
        analyzeFields: async (request) => {
          const result = await client.analyzeFields(request);
          return {
            ...result,
            fields: result.fields.flatMap((field) => {
              const candidate = request.sections
                .flatMap((section) => section.fields)
                .find(
                  (candidate) => candidate.candidateId === field.candidateId,
                )!;
              const key = bindings[candidate.domName ?? ""];
              return key
                ? [
                    {
                      ...field,
                      valueBinding: {
                        type: "DIRECT" as const,
                        profileFieldKey: key,
                      },
                    },
                  ]
                : [];
            }),
          };
        },
      }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" });
  fireEvent.click(
    screen.getByRole("button", { name: "연락처와 주소 구역 보기" }),
  );
  const outlines = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-career-form-section-highlight]",
    ),
  ];
  expect(outlines).toHaveLength(2);
  expect(
    outlines
      .map((outline) => parseFloat(outline.style.top))
      .sort((a, b) => a - b),
  ).toEqual([240, 310]);
  expect(
    outlines.every((outline) => parseFloat(outline.style.height) === 36),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "기본 인적사항 구역 보기" }),
  );
  expect(outlines.every((outline) => !outline.isConnected)).toBe(true);
  const current = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-career-form-section-highlight]",
    ),
  ];
  expect(
    current
      .map((outline) => parseFloat(outline.style.top))
      .sort((a, b) => a - b),
  ).toEqual([100, 170]);
});

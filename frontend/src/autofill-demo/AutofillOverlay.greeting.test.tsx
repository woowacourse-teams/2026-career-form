import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import profileExportExample from "../../fixtures/profile-export.example.json";
import { RuntimeAnalysisApiClient } from "../autofill/api/runtime-client";
import type {
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
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

function ControlledGreetingForm({ renderCount }: { renderCount: number }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <section aria-label="기본 정보" data-render-count={renderCount}>
      <label>
        이름{" "}
        <input
          name="basicInformation.name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label>
        전화번호{" "}
        <input
          name="basicInformation.phoneNumber.nationalNumber"
          value={phone}
          onChange={(event) => setPhone(event.currentTarget.value)}
        />
      </label>
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
  it.each([
    "kakaomobility.career.greetinghr.com",
    "career.hyundai-autoever.com",
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
            routingContext: "r".repeat(32),
          },
        };
      }
      const request = typed.payload as FieldsAnalyzeRequest;
      expect(request.routingContext).toBe("r".repeat(32));
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

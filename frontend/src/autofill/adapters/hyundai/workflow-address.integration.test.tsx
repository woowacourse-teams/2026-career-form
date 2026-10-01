import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";

const address = "서울특별시 중구 세종대로 110 (태평로1가)";
const postalCode = "04524";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function response(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  const fieldKeys: Record<string, string> = {
    postCd: "contact.contact.postalCode",
    addr: "contact.contact.addressLine1",
    addrDtl: "contact.contact.addressLine2",
  };
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections.flatMap((section) =>
      [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ].map((field) => {
        const key = field.domId ? fieldKeys[field.domId] : undefined;
        return key
          ? {
              candidateId: field.candidateId,
              matchType: "MATCH" as const,
              valueBinding: { type: "DIRECT" as const, profileFieldKey: key },
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            }
          : {
              candidateId: field.candidateId,
              matchType: "NO_MATCH" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "BLOCKED" as const,
              reasonCodes: ["NO_MATCH"] as const,
            };
      }),
    ),
  };
}

it("runs the verified Hyundai normal-address modal through the workflow and preserves readonly controls", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `<article class="field-form-apply"><input id="inExGb" name="inExGb" type="radio" checked /><div class="field"><input id="postCd" name="postCd" type="text" readonly data-modal="modal-address" /></div><div class="field"><input id="addr" name="addr" type="text" readonly /></div><div class="field"><input id="addrDtl" name="addrDtl" type="text" /></div></article><div class="modal-address"><input id="addressKeyword" type="text" /><button id="btnAddress" type="button">검색</button><table class="table-modal"><tbody></tbody></table></div>`;
  const modal = document.querySelector<HTMLElement>(".modal-address")!;
  const post = document.querySelector<HTMLInputElement>("#postCd")!;
  post.addEventListener("click", () => modal.classList.add("active"));
  document
    .querySelector<HTMLButtonElement>("#btnAddress")!
    .addEventListener("click", () => {
      const choice = document.createElement("a");
      choice.className = "btn-address";
      choice.textContent = address;
      choice.addEventListener("click", () => {
        post.value = postalCode;
        document.querySelector<HTMLInputElement>("#addr")!.value = address;
        document.querySelector<HTMLInputElement>("#addrDtl")!.value = "";
        modal.classList.remove("active");
      });
      const row = document.createElement("tr");
      row.innerHTML = `<td class="zipcode">${postalCode}</td>`;
      const addressCell = document.createElement("td");
      addressCell.append(choice);
      row.append(addressCell);
      modal.querySelector("tbody")!.replaceChildren(row);
    });
  const profile = createEmptyProfile();
  profile.contact = {
    postalCode,
    addressLine1: address,
    addressLine2: "공개 예시",
  };
  let fieldsCalls = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      const action = request.sections
        .flatMap((section) => section.actionCandidates)
        .find((candidate) => candidate.domId === "hyundai:search:address");
      if (!action) throw new Error("missing exact Hyundai address action");
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [
          {
            actionCandidateId: action.candidateId,
            command: "SEARCH_ADDRESS",
            expectedEffect: "ADDRESS_SELECTED",
          },
        ],
      };
    },
    analyzeFields: async (request) => {
      fieldsCalls += 1;
      return response(request);
    },
  };

  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await waitFor(() => {
    expect(document.querySelector<HTMLInputElement>("#addrDtl")?.value).toBe(
      "공개 예시",
    );
  });

  expect(post.value).toBe(postalCode);
  expect(document.querySelector<HTMLInputElement>("#addr")!.value).toBe(
    address,
  );
  expect(post.readOnly).toBe(true);
  expect(document.querySelector<HTMLInputElement>("#addr")!.readOnly).toBe(
    true,
  );
  expect(modal.classList.contains("active")).toBe(false);
  expect(fieldsCalls).toBe(1);
});

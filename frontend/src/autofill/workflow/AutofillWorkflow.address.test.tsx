import { render, waitFor } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});
it("runs a negotiated SK address search once and confirms the callback before detail input", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  document.body.innerHTML =
    '<div id="applyContentUserInfo" class="apply-form-box"><button id="btnSearchAddress" type="button">우편번호 찾기</button><input id="prsZipCode" name="prsZipCode" readonly><input id="prsAddress" name="prsAddress" readonly><input id="prsAddressDtl" name="prsAddressDtl"></div><div id="layer" style="display:none"><iframe title="우편번호서비스 레이어 프레임"></iframe></div>';
  for (const el of document.querySelectorAll("button,input"))
    Object.defineProperty(el, "offsetParent", { value: document.body });
  document.querySelector("#btnSearchAddress")!.addEventListener("click", () => {
    (document.querySelector("#layer") as HTMLElement).style.display = "block";
  });
  const profile = createEmptyProfile();
  profile.contact = {
    postalCode: "63309",
    addressLine1: "제주특별자치도 제주시 첨단로 242",
    addressLine2: "공개 예시",
  };
  const keys: Record<string, string> = {
    prsZipCode: "postalCode",
    prsAddress: "addressLine1",
    prsAddressDtl: "addressLine2",
  };
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [
        {
          actionCandidateId: request.sections
            .flatMap((s) => s.actionCandidates)
            .find((a) => a.domId === "btnSearchAddress")!.candidateId,
          command: "SEARCH_ADDRESS",
          expectedEffect: "ADDRESS_SELECTED",
        },
      ],
    }),
    analyzeFields: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: request.sections
        .flatMap((s) => [
          ...s.fields,
          ...(s.items ?? []).flatMap((i) => i.fields),
        ])
        .map((f) => ({
          candidateId: f.candidateId,
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "contact.contact." + keys[f.domId!],
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        })),
    }),
  };
  let searches = 0;
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => {}}
      addressSearch={async (_expected, maySelect) => {
        searches++;
        expect(await maySelect()).toBe(true);
        (document.querySelector("#prsZipCode") as HTMLInputElement).value =
          profile.contact.postalCode;
        (document.querySelector("#prsAddress") as HTMLInputElement).value =
          profile.contact.addressLine1;
        (document.querySelector("#layer") as HTMLElement).style.display =
          "none";
        return true;
      }}
    />,
  );
  await waitFor(() =>
    expect(
      (document.querySelector("#prsAddressDtl") as HTMLInputElement).value,
    ).toBe("공개 예시"),
  );
  expect(searches).toBe(1);
  expect(document.body.textContent).toContain(
    "주소 검색 선택과 지원서 반영을 확인했습니다.",
  );
});

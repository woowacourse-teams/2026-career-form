import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
it.each([
  { detail: "공개 예시", originalDetail: "", written: 3 },
  { detail: "", originalDetail: "", written: 2 },
  { detail: "공개 예시", originalDetail: "공개 예시", written: 2 },
])(
  "reports $written changed address fields when detail is '$detail' and was '$originalDetail'",
  async ({ detail, originalDetail, written }) => {
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
    document
      .querySelector("#btnSearchAddress")!
      .addEventListener("click", () => {
        (document.querySelector("#layer") as HTMLElement).style.display =
          "block";
      });
    const profile = createEmptyProfile();
    profile.contact = {
      postalCode: "63309",
      addressLine1: "제주특별자치도 제주시 첨단로 242",
      addressLine2: detail,
    };
    (document.querySelector("#prsAddressDtl") as HTMLInputElement).value =
      originalDetail;
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
    let continueSearch!: () => void;
    const searching = new Promise<void>((resolve) => {
      continueSearch = resolve;
    });
    render(
      <AutofillWorkflow
        apiClient={apiClient}
        repository={{ load: async () => profile }}
        pageDocument={document}
        onExit={() => {}}
        addressSearch={async (_expected, maySelect) => {
          searches++;
          await searching;
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
      expect(screen.getByRole("status")).toHaveTextContent(
        "주소 검색 결과를 확인하고 있어요",
      ),
    );
    expect(
      screen.queryByRole("heading", { name: "기입 결과" }),
    ).not.toBeInTheDocument();
    await act(async () => continueSearch());
    await waitFor(() =>
      expect(
        screen.getByLabelText(`입력 완료 ${written}개`),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        (document.querySelector("#prsAddressDtl") as HTMLInputElement).value,
      ).toBe(detail),
    );
    const section = document.querySelector<HTMLElement>(
      "#applyContentUserInfo",
    )!;
    section.getBoundingClientRect = () => new DOMRect(20, 180, 600, 280);
    section
      .querySelectorAll<HTMLElement>("button,input")
      .forEach((element, index) => {
        element.getBoundingClientRect = () =>
          new DOMRect(40, 220 + index * 45, 400, 30);
      });
    const locate = screen.getByRole("button", {
      name: "연락처와 주소 구역 보기",
    });
    expect(locate).toBeEnabled();
    fireEvent.click(locate);
    const highlight = document.querySelector<HTMLElement>(
      "[data-career-form-section-highlight]",
    )!;
    expect(highlight).not.toBeNull();
    expect(parseFloat(highlight.style.height)).toBe(42);
    expect(
      document.querySelectorAll("[data-career-form-section-highlight]"),
    ).toHaveLength(written);
    expect(searches).toBe(1);
    expect(document.body.textContent).not.toContain(
      "주소 검색 선택과 지원서 반영을 확인했습니다.",
    );
    expect(screen.queryByText("주소 입력 확인 완료")).not.toBeInTheDocument();
  },
);

import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import {
  mountDetail,
  detailAnalysis,
} from "../adapters/hplace/detail.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";

afterEach(resetHplacePage);

// Mirrors the active policy: English-name order has not been verified.
function activeDetailAnalysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  const response = detailAnalysis(request);
  response.fields = response.fields.map((field, index) =>
    request.sections.flatMap((section) => section.fields)[index].domName ===
    "hplace.detail.englishName"
      ? {
          candidateId: field.candidateId,
          matchType: "NO_MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        }
      : field,
  );
  return response;
}

function matchingAddress(profile: ReturnType<typeof createEmptyProfile>): void {
  profile.contact.addressLine1 = "Synthetic road 1";
  profile.contact.postalCode = "12345";
  (
    document.querySelector(
      '[name="currentAddress.address"]',
    ) as HTMLInputElement
  ).value = profile.contact.addressLine1;
  (
    document.querySelector(
      '[name="currentAddress.zipCode"]',
    ) as HTMLInputElement
  ).value = profile.contact.postalCode;
  document.querySelector(
    '[data-type="currentAddress"][data-span="postcode"]',
  )!.textContent = profile.contact.postalCode;
}

it.each([false, true])(
  "fills independent detailed basic fields in one analysis (emergency=%s)",
  async (emergency) => {
    mountDetail(emergency);
    const profile = createEmptyProfile();
    profile.personal.englishGivenName = "Synthetic";
    profile.personal.englishFamilyName = "Tester";
    profile.personal.birthDate = "2000-02-29";
    profile.contact.addressLine2 = "Synthetic detail";
    matchingAddress(profile);
    profile.contact.emergencyPhoneNumber = "010-1234-5678";
    const clicks = vi.fn();
    const inputs = vi.fn();
    document
      .querySelectorAll("button")
      .forEach((button) => button.addEventListener("click", clicks));
    document
      .querySelectorAll("input")
      .forEach((input) => input.addEventListener("input", inputs));
    const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) =>
      activeDetailAnalysis(request),
    );
    const preparation = vi.fn<AnalysisApiClient["analyzePreparation"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
    );
    const props = {
      pageDocument: document,
      onExit: () => undefined,
      repository: { load: async () => profile },
      apiClient: { analyzeFields: fields, analyzePreparation: preparation },
    };
    const view = render(<AutofillWorkflow {...props} />);
    expect(
      await screen.findByLabelText(`입력 완료 ${emergency ? 3 : 2}개`),
    ).toBeVisible();
    expect(fields).toHaveBeenCalledTimes(1);
    expect(preparation).toHaveBeenCalledTimes(1);
    expect(inputs).toHaveBeenCalledTimes(emergency ? 3 : 2);
    expect(clicks).not.toHaveBeenCalled();
    expect(
      (document.getElementById("birthday") as HTMLInputElement).value,
    ).toBe("2000.02.29");
    expect(
      (
        document.querySelector(
          '[name="currentAddress.address"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("Synthetic road 1");
    expect(
      (document.querySelector('[type="password"]') as HTMLInputElement).value,
    ).toBe("");
    view.unmount();
    render(<AutofillWorkflow {...props} />);
    expect(await screen.findByText("기입 결과")).toBeVisible();
    expect(fields).toHaveBeenCalledTimes(2);
    expect(preparation).toHaveBeenCalledTimes(2);
    expect(inputs).toHaveBeenCalledTimes(emergency ? 3 : 2);
    expect(clicks).not.toHaveBeenCalled();
  },
);

it("checks the saved profile again immediately before each detailed input", async () => {
  mountDetail();
  const profile = createEmptyProfile();
  profile.personal.englishGivenName = "Synthetic";
  profile.personal.englishFamilyName = "Tester";
  profile.personal.birthDate = "2000-02-29";
  profile.contact.addressLine2 = "Synthetic detail";
  matchingAddress(profile);
  const changedProfile = structuredClone(profile);
  changedProfile.personal.englishGivenName = "Changed";
  let loads = 0;
  const inputs = vi.fn();
  document
    .querySelectorAll("input")
    .forEach((input) => input.addEventListener("input", inputs));
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{
        load: async () => (++loads <= 2 ? profile : changedProfile),
      }}
      apiClient={{
        analyzePreparation: async (request) => ({
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields: async (request) => activeDetailAnalysis(request),
      }}
    />,
  );
  expect(await screen.findByText("기입 결과")).toBeVisible();
  expect(inputs).not.toHaveBeenCalled();
  expect(
    (document.getElementById("englishName") as HTMLInputElement).value,
  ).toBe("");
});

it("does not confirm retained writes when the profile changes after the last input", async () => {
  mountDetail();
  const profile = createEmptyProfile();
  profile.personal.englishGivenName = "Synthetic";
  profile.personal.englishFamilyName = "Tester";
  profile.personal.birthDate = "2000-02-29";
  profile.contact.addressLine2 = "Synthetic detail";
  matchingAddress(profile);
  let changed = false;
  (
    document.querySelector(
      '[name="currentAddress.detailAddress"]',
    ) as HTMLInputElement
  ).onblur = () => {
    changed = true;
  };
  const changedProfile = structuredClone(profile);
  changedProfile.personal.englishGivenName = "Changed";
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{ load: async () => (changed ? changedProfile : profile) }}
      apiClient={{
        analyzePreparation: async (request) => ({
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields: async (request) => activeDetailAnalysis(request),
      }}
    />,
  );
  expect(await screen.findByText("기입 결과")).toBeVisible();
  expect(screen.getByLabelText("확인 필요 2개")).toBeVisible();
});

it("rechecks the address identity after later fields change it", async () => {
  mountDetail(true);
  const profile = createEmptyProfile();
  profile.personal.birthDate = "2000-02-29";
  profile.contact.addressLine2 = "Synthetic detail";
  profile.contact.emergencyPhoneNumber = "010-1234-5678";
  matchingAddress(profile);
  (
    document.querySelector(
      '[name="emergencyContact.contact"]',
    ) as HTMLInputElement
  ).onchange = () => {
    (
      document.querySelector(
        '[name="currentAddress.address"]',
      ) as HTMLInputElement
    ).value = "Different road";
  };
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => undefined}
      repository={{ load: async () => profile }}
      apiClient={{
        analyzePreparation: async (request) => ({
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields: async (request) => activeDetailAnalysis(request),
      }}
    />,
  );
  expect(await screen.findByText("기입 결과")).toBeVisible();
  expect(screen.getByLabelText("입력 완료 2개")).toBeVisible();
});

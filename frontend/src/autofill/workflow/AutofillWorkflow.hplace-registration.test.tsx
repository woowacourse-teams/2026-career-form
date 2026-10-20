import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  mountHplaceRegistration,
  registrationAnalysis,
  installRegistrationValidation,
} from "../adapters/hplace/registration.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  resetHplacePage();
});

it("fills three logical fields and six owned inputs, then leaves them unchanged on rerun", async () => {
  mountHplaceRegistration();
  const validation = installRegistrationValidation();
  dispose = validation.dispose;
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "테스트";
  profile.personal.koreanGivenName = "사용자";
  profile.contact.phoneNumber = "01012345678";
  profile.contact.email = "synthetic@example.test";
  const props = {
    pageDocument: document,
    onExit: () => undefined,
    repository: { load: async () => profile },
    apiClient: {
      analyzePreparation: vi.fn(
        async (request: import("../api/types").PreparationAnalyzeRequest) => ({
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          preparationPlans: [],
        }),
      ),
      analyzeFields: vi.fn(
        async (request: import("../api/types").FieldsAnalyzeRequest) =>
          registrationAnalysis(request),
      ),
    },
  };
  const view = render(<AutofillWorkflow {...props} />);
  expect(await screen.findByLabelText("입력 완료 3개")).toBeVisible();
  expect(props.apiClient.analyzePreparation).toHaveBeenCalledTimes(1);
  expect(props.apiClient.analyzeFields).toHaveBeenCalledTimes(2);
  const values = () =>
    ["name", "mobile1", "mobile2", "mobile3", "email", "emailConfirm"].map(
      (id) => (document.getElementById(id) as HTMLInputElement).value,
    );
  expect(values()).toEqual([
    "테스트사용자",
    "010",
    "1234",
    "5678",
    "synthetic@example.test",
    "synthetic@example.test",
  ]);
  expect(
    (document.getElementById("mobileCombined") as HTMLInputElement).value,
  ).toBe("010-1234-5678");
  expect((document.getElementById("password") as HTMLInputElement).value).toBe(
    "",
  );
  expect(
    (document.getElementById("passwordConfirm") as HTMLInputElement).value,
  ).toBe("");
  expect(validation.clicks()).toBe(0);
  const count = validation.inputEvents();
  view.unmount();
  render(<AutofillWorkflow {...props} />);
  expect(await screen.findByText("기입 결과")).toBeVisible();
  expect(screen.getByLabelText("확인 필요 0개")).toBeVisible();
  expect(validation.inputEvents()).toBe(count);
  expect(props.apiClient.analyzePreparation).toHaveBeenCalledTimes(2);
  expect(props.apiClient.analyzeFields).toHaveBeenCalledTimes(4);
  expect(values()).toEqual([
    "테스트사용자",
    "010",
    "1234",
    "5678",
    "synthetic@example.test",
    "synthetic@example.test",
  ]);
});

it.each(["preparation", "fields"] as const)(
  "rejects a generic %s response on a verified registration entry",
  async (phase) => {
    mountHplaceRegistration();
    const load = async () => createEmptyProfile();
    const fields = vi.fn<
      import("../api/types").AnalysisApiClient["analyzeFields"]
    >(async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [],
    }));
    render(
      <AutofillWorkflow
        pageDocument={document}
        repository={{ load }}
        onExit={() => undefined}
        apiClient={{
          analyzePreparation: async (request) => ({
            snapshotId: request.snapshotId,
            mode: phase === "preparation" ? "GENERIC" : "ADAPTER",
            analysisStatus: "COMPLETE",
            preparationPlans: [],
          }),
          analyzeFields: fields,
        }}
      />,
    );
    expect(await screen.findByText("예외")).toBeVisible();
    if (phase === "preparation") expect(fields).not.toHaveBeenCalled();
    expect((document.getElementById("name") as HTMLInputElement).value).toBe(
      "",
    );
  },
);

function registrationProps() {
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "합성";
  profile.personal.koreanGivenName = "사용자";
  profile.contact.phoneNumber = "01012345678";
  profile.contact.email = "synthetic@example.test";
  return {
    pageDocument: document,
    onExit: () => undefined,
    repository: { load: vi.fn(async () => profile) },
    apiClient: {
      analyzePreparation: vi.fn(
        async (request: import("../api/types").PreparationAnalyzeRequest) => ({
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          preparationPlans: [],
        }),
      ),
      analyzeFields: vi.fn(
        async (request: import("../api/types").FieldsAnalyzeRequest) =>
          registrationAnalysis(request),
      ),
    },
  };
}

it("does not report success after a later email event clears the submitted phone", async () => {
  mountHplaceRegistration();
  const validation = installRegistrationValidation();
  dispose = validation.dispose;
  document.getElementById("email")!.addEventListener("change", () => {
    (document.getElementById("mobileCombined") as HTMLInputElement).value = "";
  });
  const props = registrationProps();
  render(<AutofillWorkflow {...props} />);
  expect(await screen.findByLabelText("확인 필요 1개")).toBeVisible();
  expect(screen.getByLabelText("입력 완료 2개")).toBeVisible();
  expect(
    (document.getElementById("mobileCombined") as HTMLInputElement).value,
  ).toBe("");
  expect((document.getElementById("mobile3") as HTMLInputElement).value).toBe(
    "5678",
  );
  expect(validation.clicks()).toBe(0);
});

it("rechecks submitted phone consistency in the final result after reanalysis", async () => {
  mountHplaceRegistration();
  const validation = installRegistrationValidation();
  dispose = validation.dispose;
  const props = registrationProps();
  let requests = 0;
  props.apiClient.analyzeFields.mockImplementation(async (request) => {
    requests += 1;
    if (requests === 2)
      (document.getElementById("mobileCombined") as HTMLInputElement).value =
        "";
    return registrationAnalysis(request);
  });
  render(<AutofillWorkflow {...props} />);
  expect(await screen.findByLabelText("확인 필요 1개")).toBeVisible();
  expect(screen.getByLabelText("입력 완료 2개")).toBeVisible();
  expect(
    (document.getElementById("mobileCombined") as HTMLInputElement).value,
  ).toBe("");
  expect(props.apiClient.analyzeFields).toHaveBeenCalledTimes(2);
  expect(validation.clicks()).toBe(0);
});

it.each(["", "010-9999-0000"])(
  "leaves an unchanged visible phone with submitted value %j for review",
  async (submitted) => {
    mountHplaceRegistration();
    const validation = installRegistrationValidation();
    dispose = validation.dispose;
    ["010", "1234", "5678"].forEach((value, index) => {
      (
        document.getElementById(`mobile${index + 1}`) as HTMLInputElement
      ).value = value;
    });
    (document.getElementById("mobileCombined") as HTMLInputElement).value =
      submitted;
    const props = registrationProps();
    render(<AutofillWorkflow {...props} />);
    expect(await screen.findByLabelText("확인 필요 1개")).toBeVisible();
    expect(screen.getByLabelText("입력 완료 2개")).toBeVisible();
    expect(
      (document.getElementById("mobileCombined") as HTMLInputElement).value,
    ).toBe(submitted);
    expect(validation.clicks()).toBe(0);
  },
);

it("rejects a duplicated submitted name before loading a profile or writing", async () => {
  mountHplaceRegistration();
  document
    .getElementById("frm")!
    .insertAdjacentHTML("afterbegin", '<input type="hidden" name="name">');
  const validation = installRegistrationValidation();
  dispose = validation.dispose;
  const props = registrationProps();
  render(<AutofillWorkflow {...props} />);
  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(props.repository.load).not.toHaveBeenCalled();
  expect(props.apiClient.analyzePreparation).not.toHaveBeenCalled();
  expect(props.apiClient.analyzeFields).not.toHaveBeenCalled();
  expect(validation.inputEvents()).toBe(0);
  expect(validation.clicks()).toBe(0);
});

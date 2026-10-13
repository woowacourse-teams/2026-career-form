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

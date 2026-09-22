import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function setUrl(url = "https://example.test/apply") {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function preparationResponse(snapshotId: string) {
  return {
    snapshotId,
    mode: "ADAPTER" as const,
    analysisStatus: "COMPLETE" as const,
    preparationPlans: [],
  };
}

function fieldClient(onAnalyze?: () => void): AnalysisApiClient {
  return {
    analyzePreparation: async (request) =>
      preparationResponse(request.snapshotId),
    analyzeFields: async (request) => {
      onAnalyze?.();
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "COMPLETE" as const,
        fields: request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey: "compensation.compensation.desiredSalary",
            },
            autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          })),
      };
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

it("shows analysis status while preparation remains unresolved", async () => {
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const pending = deferred<ReturnType<typeof preparationResponse>>();
  const profile = createEmptyProfile();

  render(
    <AutofillWorkflow
      apiClient={{
        analyzePreparation: () => pending.promise,
        analyzeFields: async () => {
          throw new Error("not reached");
        },
      }}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  expect(await screen.findByRole("status")).toHaveTextContent(
    "지원서 항목과 프로필 정보를 맞추고 있어요",
  );
  const status = screen.getByRole("status");
  expect(status.closest('[aria-busy="true"]')).toBeNull();
  const workArea = screen.getByRole("region", { name: "자동 기입 작업 영역" });
  expect(workArea).toHaveAttribute("aria-busy", "true");
  expect(workArea).toHaveTextContent(
    "지원서 항목과 프로필 정보를 맞추고 있어요",
  );
  expect(workArea).toBeVisible();
});

it("removes busy status and shows the existing exception screen after preparation fails", async () => {
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const profile = createEmptyProfile();

  render(
    <AutofillWorkflow
      apiClient={{
        analyzePreparation: async () => {
          throw new Error("network unavailable");
        },
        analyzeFields: async () => {
          throw new Error("not reached");
        },
      }}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  expect(
    await screen.findByRole("heading", { name: "분석을 완료하지 못했습니다" }),
  ).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("runs the sensitive re-analysis once when the review action is clicked twice", async () => {
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const profile = createEmptyProfile();
  profile.compensation.desiredSalary = "5000";
  let analyses = 0;

  render(
    <AutofillWorkflow
      apiClient={fieldClient(() => analyses++)}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await screen.findByRole("button", { name: "이름 값 보기" });
  fireEvent.click(screen.getByRole("button", { name: "이름 값 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "이름 포함하기" }));
  const write = screen.getByRole("button", { name: "1개 항목 기입하기" });
  fireEvent.click(write);
  fireEvent.click(write);

  expect(screen.getByRole("status")).toHaveTextContent(
    "지원서 항목과 프로필 정보를 맞추고 있어요",
  );
  expect(screen.getByRole("status").closest('[aria-busy="true"]')).toBeNull();
  expect(document.querySelector('[aria-busy="true"]')).toBeVisible();

  await screen.findByRole("heading", { name: "기입 결과" });
  expect(analyses).toBe(2);
});

it("shows the exception screen when StrictMode re-runs effects and sensitive re-analysis fails", async () => {
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const profile = createEmptyProfile();
  profile.compensation.desiredSalary = "5000";
  let fieldAnalyses = 0;

  render(
    <StrictMode>
      <AutofillWorkflow
        apiClient={{
          analyzePreparation: async (request) =>
            preparationResponse(request.snapshotId),
          analyzeFields: async (request) => {
            fieldAnalyses++;
            if (fieldAnalyses > 1) throw new Error("analysis failed");
            return {
              snapshotId: request.snapshotId,
              mode: "ADAPTER" as const,
              analysisStatus: "COMPLETE" as const,
              fields: request.sections
                .flatMap((section) => [
                  ...section.fields,
                  ...(section.items ?? []).flatMap((item) => item.fields),
                ])
                .map((field) => ({
                  candidateId: field.candidateId,
                  matchType: "MATCH" as const,
                  valueBinding: {
                    type: "DIRECT" as const,
                    profileFieldKey: "compensation.compensation.desiredSalary",
                  },
                  autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
                  mappingStatus: "ADAPTER_VERIFIED" as const,
                  interactionStatus: "READY" as const,
                  writePlan: { command: "SET_TEXT" as const },
                })),
            };
          },
        }}
        repository={{ load: async () => profile }}
        pageDocument={document}
        onExit={() => undefined}
      />
    </StrictMode>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "이름 값 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "이름 포함하기" }));
  fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));

  expect(
    await screen.findByRole("heading", { name: "분석을 완료하지 못했습니다" }),
  ).toBeVisible();
});

it("shows writing status while the automatic workflow writer is pending", async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "홍길동";
  const pending =
    deferred<Awaited<ReturnType<AnalysisApiClient["analyzeFields"]>>>();
  let fieldsRequest: Parameters<AnalysisApiClient["analyzeFields"]>[0];

  render(
    <AutofillWorkflow
      apiClient={{
        analyzePreparation: async (request) =>
          preparationResponse(request.snapshotId),
        analyzeFields: (request) => {
          fieldsRequest = request;
          return pending.promise;
        },
      }}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  pending.resolve({
    snapshotId: fieldsRequest!.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fieldsRequest!.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .map((field) => ({
        candidateId: field.candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: "personal.personal.koreanGivenName",
        },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus: "ADAPTER_VERIFIED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "SET_TEXT" as const },
      })),
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByRole("status")).toHaveTextContent(
    "기본 인적사항 정보를 입력하고 있어요",
  );
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "1개 항목을 입력했어요" }),
  ).toBeVisible();
  expect(
    screen.getByRole("list", { name: "범주별 입력 결과" }),
  ).toHaveTextContent("기본 인적사항1개 입력");
});

it("does not let a late preparation response replace an unmounted workflow", async () => {
  document.body.innerHTML = '<label>이름 <input name="name"></label>';
  const pending = deferred<ReturnType<typeof preparationResponse>>();
  const profile = createEmptyProfile();
  const { unmount } = render(
    <AutofillWorkflow
      apiClient={{
        analyzePreparation: () => pending.promise,
        analyzeFields: async () => {
          throw new Error("not reached");
        },
      }}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await screen.findByRole("status");
  unmount();
  pending.resolve(preparationResponse("late"));
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  );
});

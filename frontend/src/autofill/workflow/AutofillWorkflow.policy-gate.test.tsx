import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import {
  AnalysisServiceError,
  RuntimeAnalysisApiClient,
} from "../api/runtime-client";
import { AutofillWorkflow } from "./AutofillWorkflow";

const developerMode = vi.hoisted(() => ({ on: false }));
vi.mock("../debug/developer-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../debug/developer-mode")>()),
  useDeveloperMode: () => [developerMode.on, vi.fn()] as const,
}));

const RAW = "SYNTHETIC_RAW_POLICY_FAILURE_7f3a";
afterEach(() => {
  cleanup();
  developerMode.on = false;
});

async function failWith(error: unknown, onExit = vi.fn()) {
  const sendMessage = vi.fn(async () => {
    throw new Error("Unexpected runtime request");
  });
  const client = new RuntimeAnalysisApiClient(sendMessage);
  const loadPolicy = vi
    .spyOn(client, "loadExecutionPolicy")
    .mockRejectedValue(error);
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={onExit}
      repository={{ load: async () => createEmptyProfile() }}
      apiClient={client}
    />,
  );
  const alert = await screen.findByRole("alert");
  expect(loadPolicy).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
  return { alert, text: alert.textContent ?? "", onExit, loadPolicy };
}

it("never shows the raw error text and offers a way back", async () => {
  const { alert, onExit } = await failWith(new Error(RAW));
  expect(alert).not.toHaveTextContent(RAW);
  expect(document.body.textContent).not.toContain(RAW);
  fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
  expect(onExit).toHaveBeenCalledTimes(1);
});

it("tells incompatible, temporary and other failures apart without the raw text", async () => {
  const texts: string[] = [];
  for (const error of [
    new AnalysisServiceError(RAW, undefined, "POLICY_INCOMPATIBLE"),
    new AnalysisServiceError(RAW, undefined, undefined, "NETWORK"),
    new Error(RAW),
  ]) {
    texts.push((await failWith(error)).text);
    cleanup();
  }
  expect(new Set(texts).size).toBe(3);
  for (const text of texts) expect(text).not.toContain(RAW);
});

it("names a connection failure and a rate limit apart, each with retry and back", async () => {
  const network = await failWith(
    new AnalysisServiceError(RAW, undefined, undefined, "NETWORK"),
  );
  expect(
    screen.getByRole("heading", { name: "서버에 연결하지 못했어요" }),
  ).toBeVisible();
  expect(network.alert).toHaveTextContent("지원서는 바뀌지 않았어요");
  cleanup();

  await failWith(new AnalysisServiceError(RAW, undefined, "RATE_LIMITED"));
  expect(
    screen.getByRole("heading", { name: "잠시 후 다시 시도해 주세요" }),
  ).toBeVisible();
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["다시 시도", "돌아가기"]);
});

it("offers only the back button when the extension needs an update", async () => {
  await failWith(
    new AnalysisServiceError(RAW, undefined, "POLICY_INCOMPATIBLE"),
  );
  expect(
    screen.getByRole("heading", { name: "확장 프로그램을 업데이트해 주세요" }),
  ).toBeVisible();
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["돌아가기"]);
});

it("reloads the policy only after the user clicks retry", async () => {
  const { loadPolicy } = await failWith(
    new AnalysisServiceError(RAW, undefined, undefined, "NETWORK"),
  );
  expect(loadPolicy).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  await screen.findByRole("heading", { name: "서버에 연결하지 못했어요" });
  expect(loadPolicy).toHaveBeenCalledTimes(2);
});

it("shows the raw error only in developer mode, inside a collapsed block", async () => {
  developerMode.on = true;
  await failWith(new Error(RAW));

  const details = document.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(details.querySelector("summary")).toHaveTextContent("오류 정보");
  expect(details).toHaveTextContent(RAW);
});

it("shows the installation limit and retry time without developer mode", async () => {
  const client = new RuntimeAnalysisApiClient(async () => ({
    ok: false,
    code: "GLOBAL_LIMIT",
    retryAt: "2030-01-01T01:00:00Z",
  }));
  const error = await client
    .analyzeFields({
      schemaVersion: 2,
      snapshotId: "synthetic",
      site: { host: "example.test", pathPattern: "/apply" },
      sections: [],
    })
    .catch((error: unknown) => error);
  const { alert } = await failWith(error);
  expect(
    screen.getByRole("heading", { name: "잠시 후 다시 시도해 주세요" }),
  ).toBeVisible();
  expect(alert).toHaveTextContent("서비스의 분석 이용량이 소진되었습니다");
  expect(alert).toHaveTextContent("재시도 가능 시간:");
});

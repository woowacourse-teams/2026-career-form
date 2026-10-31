import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import {
  AnalysisServiceError,
  RuntimeAnalysisApiClient,
} from "../api/runtime-client";
import { AutofillWorkflow } from "./AutofillWorkflow";

const RAW = "SYNTHETIC_RAW_POLICY_FAILURE_7f3a";
afterEach(cleanup);

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
  return { alert, text: alert.textContent ?? "", onExit };
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

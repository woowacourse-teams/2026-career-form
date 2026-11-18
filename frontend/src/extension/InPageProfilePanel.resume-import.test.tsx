import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InPageProfilePanel } from "./InPageProfilePanel";
import { createProfilePanelController } from "./profile-panel-controller";
import { createEmptyProfile } from "../profile/model";
import { createApiClient } from "../autofill-demo/AutofillOverlay.test-fixtures";

const IMAGE_URL = "chrome-extension://test-extension/unsupported-capybara.jpg";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("loads the resume import failure image from the extension URL in the page panel", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={createApiClient()}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      unsupportedImageUrl={IMAGE_URL}
      track={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "설정" }));
  fireEvent.click(screen.getByRole("button", { name: "프로필 가져오기" }));
  fireEvent.click(screen.getByRole("button", { name: /^이력서 파일/ }));
  fireEvent.change(document.querySelector("input[type=file]")!, {
    target: { files: [new File(["synthetic"], "합성.docx")] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "PDF · MD · TXT만 가져올 수 있어요",
  );
  expect(
    screen
      .getByRole("region", { name: "이력서에서 프로필 가져오기" })
      .querySelector("img"),
  ).toHaveAttribute("src", IMAGE_URL);
});

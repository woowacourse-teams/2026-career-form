import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InPageProfilePanel } from "./InPageProfilePanel";
import { createProfilePanelController } from "./profile-panel-controller";
import { createEmptyProfile } from "../profile/model";
import { createApiClient } from "../autofill-demo/AutofillOverlay.test-fixtures";
import { usePolicyFixture } from "../test/fixtures/execution-policy";

usePolicyFixture("greeting");

// Synthetic Greeting basic-information controls the installed policy recognizes.
const GREETING_FORM = `<form>
  <div data-scope="field" data-part="root"><label>이름</label>
    <input name="basicInformation.name" value="합성지원자">
  </div>
  <div data-scope="field" data-part="root"><label>연락처</label>
    <input type="tel" name="basicInformation.phoneNumber.nationalNumber" value="010-0000-0000">
  </div>
  <div data-scope="field" data-part="root"><label>이메일</label>
    <input type="email" name="basicInformation.email" value="fixture@example.invalid">
  </div>
</form>`;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it("offers only the resume file on a Greeting application page and records no page import", async () => {
  document.body.innerHTML = GREETING_FORM;
  const track = vi.fn();
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
      track={track}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "설정" }));
  fireEvent.click(screen.getByRole("button", { name: "프로필 가져오기" }));
  const sources = screen.getByRole("region", { name: "가져올 곳" });
  expect(
    [...sources.querySelectorAll("button")].map(
      (button) => button.querySelector("b")?.textContent,
    ),
  ).toEqual(["이력서 파일"]);
  expect(
    track.mock.calls.filter(([event]) =>
      String(event).startsWith("greeting_import_"),
    ),
  ).toEqual([]);
});

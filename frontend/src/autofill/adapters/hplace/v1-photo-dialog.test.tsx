import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentStore } from "../../../attachments/model";
import { AttachmentSection } from "../../attachments/AttachmentSection";
import { UNVERIFIED_ATTACH_REASON } from "../../attachments/attach-file";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { v1PhotoAttachFollowUp } from "./v1-photo-dialog";
import {
  mountV1Step1,
  rowOf,
  setSyntheticFile,
  until,
} from "./v1-basic.test-fixtures";

afterEach(resetHplacePage);

const photoInput = () =>
  document.querySelector<HTMLInputElement>('#root input[type="file"]')!;
const openDialogs = () =>
  document.querySelectorAll('#overlay-root [role="dialog"]').length;
const cardPicture = () => rowOf("사진").querySelector("img");

/** What the shared attachment feature does, then the v1 follow-up. */
async function attachWithFollowUp() {
  const finish = v1PhotoAttachFollowUp(photoInput());
  expect(finish).toBeDefined();
  setSyntheticFile(photoInput());
  return finish!();
}

it("confirms the photo dialog the attach opened, exactly once", async () => {
  const page = mountV1Step1();
  page.photoDialog();
  const input = photoInput();
  expect(await attachWithFollowUp()).toBeUndefined();
  expect(page.dialogClicks()).toEqual(["저장"]);
  expect(openDialogs()).toBe(0);
  // The kept picture replaced the card's file input.
  expect(input.isConnected).toBe(false);
  expect(cardPicture()).not.toBeNull();
  expect(page.forbiddenClicks()).toEqual([]);
});

it("keeps nothing when 저장 is pressed before the crop picture loaded (page shim)", async () => {
  const page = mountV1Step1();
  page.photoDialog({ crop: "manual" });
  const input = photoInput();
  setSyntheticFile(input);
  await until(() => openDialogs() === 1);
  document
    .querySelector<HTMLButtonElement>(
      '#overlay-root [role="dialog"] .x-primary',
    )!
    .click();
  await until(() => openDialogs() === 0);
  expect(input.isConnected).toBe(true);
  expect(input.files).toHaveLength(0);
  expect(cardPicture()).toBeNull();
});

describe("with a controlled clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the crop picture, presses 저장 once and resolves after the card drops its input", async () => {
    const page = mountV1Step1();
    page.photoDialog({ crop: "manual" });
    const input = photoInput();
    let settled = false;
    const done = attachWithFollowUp().then((reason) => {
      settled = true;
      return reason;
    });
    await vi.advanceTimersByTimeAsync(1000);
    // The dialog is open, but its picture has not loaded: nothing is pressed.
    expect(openDialogs()).toBe(1);
    expect(page.dialogClicks()).toEqual([]);
    page.showCrop();
    await vi.advanceTimersByTimeAsync(100);
    expect(page.dialogClicks()).toEqual(["저장"]);
    expect(openDialogs()).toBe(0);
    // The upload has not replaced the input yet: the follow-up still waits.
    expect(input.isConnected).toBe(true);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(await done).toBeUndefined();
    expect(input.isConnected).toBe(false);
    expect(cardPicture()).not.toBeNull();
    expect(page.dialogClicks()).toEqual(["저장"]);
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("reports a crop picture that never loads and presses nothing", async () => {
    const page = mountV1Step1();
    page.photoDialog({ crop: "never" });
    const done = attachWithFollowUp();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await done).toBe(UNVERIFIED_ATTACH_REASON);
    expect(page.dialogClicks()).toEqual([]);
    expect(openDialogs()).toBe(1);
    expect(photoInput().files).toHaveLength(1);
  });

  it("reports a photo the site drops after 저장 (the input stays)", async () => {
    const page = mountV1Step1();
    page.photoDialog({ dropsUpload: true });
    const input = photoInput();
    const done = attachWithFollowUp();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await done).toBe(UNVERIFIED_ATTACH_REASON);
    expect(page.dialogClicks()).toEqual(["저장"]);
    expect(openDialogs()).toBe(0);
    expect(input.isConnected).toBe(true);
    expect(cardPicture()).toBeNull();
  });
});

it("never presses a dialog that was already open before the attach", async () => {
  const page = mountV1Step1();
  page.openDialog("사진 등록", "저장");
  page.photoDialog();
  expect(await attachWithFollowUp()).toBe(UNVERIFIED_ATTACH_REASON);
  expect(page.dialogClicks()).toEqual([]);
  expect(page.forbiddenClicks()).toEqual([]);
});

it("does not press a dialog with another title", async () => {
  const page = mountV1Step1();
  page.photoDialog({ title: "사진 편집" });
  expect(await attachWithFollowUp()).toBe(UNVERIFIED_ATTACH_REASON);
  expect(page.dialogClicks()).toEqual([]);
  expect(openDialogs()).toBe(1);
}, 10000);

it("reports a dialog without one exact 저장 button and presses nothing", async () => {
  const page = mountV1Step1();
  page.photoDialog({ primary: "저장하기" });
  expect(await attachWithFollowUp()).toBe(UNVERIFIED_ATTACH_REASON);
  expect(page.dialogClicks()).toEqual([]);
}, 10000);

it("reports a dialog that never appears and presses nothing", async () => {
  const page = mountV1Step1();
  page.photoDialog({ neverOpens: true });
  expect(await attachWithFollowUp()).toBe(UNVERIFIED_ATTACH_REASON);
  expect(page.dialogClicks()).toEqual([]);
}, 10000);

it("reports a dialog that stays open after 저장", async () => {
  const page = mountV1Step1();
  page.photoDialog({ stuck: true });
  expect(await attachWithFollowUp()).toBe(UNVERIFIED_ATTACH_REASON);
  expect(page.dialogClicks()).toEqual(["저장"]);
  expect(page.forbiddenClicks()).toEqual([]);
}, 10000);

it.each([
  ["step 2", () => mountV1Step1("2")],
  [
    "a page with a second file input",
    () => {
      mountV1Step1();
      photoInput().after(photoInput().cloneNode());
    },
  ],
])("does nothing on %s", (_, mount) => {
  mount();
  expect(v1PhotoAttachFollowUp(photoInput())).toBeUndefined();
});

const PHOTO = {
  name: "synthetic-photo.jpg",
  type: "image/jpeg",
  size: 9,
  updatedAt: "2026-11-21T09:00:00.000Z",
};
const store = (): AttachmentStore => ({
  list: vi.fn(async () => ({ photo: PHOTO })),
  save: vi.fn(),
  remove: vi.fn(),
  pruneEvidence: vi.fn(),
  loadLinks: vi.fn(async () => ({})),
  saveLink: vi.fn(),
  removeLink: vi.fn(),
  loadFile: vi.fn(
    async () => new File(["synthetic"], PHOTO.name, { type: PHOTO.type }),
  ),
});
const renderSection = () => {
  const host = document.createElement("div");
  document.body.append(host);
  render(
    <AttachmentSection
      pageDocument={document}
      store={store()}
      attach={(input) => {
        setSyntheticFile(input);
        return { status: "attached" };
      }}
      attachFollowUp={v1PhotoAttachFollowUp}
    />,
    { container: host },
  );
};

it("runs through AttachmentSection: a confirmed photo stays silent", async () => {
  const page = mountV1Step1();
  page.photoDialog();
  const input = photoInput();
  renderSection();
  await waitFor(() => expect(page.dialogClicks()).toEqual(["저장"]));
  await waitFor(() => expect(openDialogs()).toBe(0));
  await waitFor(() => expect(input.isConnected).toBe(false));
  expect(screen.queryByRole("region", { name: "첨부 파일" })).toBeNull();
});

it("runs through AttachmentSection: an unconfirmed photo is reported in its row", async () => {
  const page = mountV1Step1();
  page.photoDialog({ stuck: true });
  renderSection();
  expect(
    await screen.findByText(UNVERIFIED_ATTACH_REASON, {}, { timeout: 6000 }),
  ).toBeVisible();
  expect(page.dialogClicks()).toEqual(["저장"]);
}, 10000);

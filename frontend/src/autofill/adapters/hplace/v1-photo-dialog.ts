import { UNVERIFIED_ATTACH_REASON } from "../../attachments/attach-file";
import { isV1BasicPage } from "./v1-basic-controls";
import { waitFor } from "./v1-basic-write";
import { dialogButton, titledDialog, v1Dialogs } from "./v1-dialog";

const BOUND_MS = 3000;
// 저장 uploads the cropped picture to the site before the card changes.
const REGISTER_MS = 8000;

/** The crop area is usable once its picture has loaded; an earlier 저장 keeps nothing. */
function cropReady(dialog: HTMLElement): boolean {
  const pictures = Array.from(dialog.querySelectorAll("img"));
  return (
    dialog.querySelectorAll('[role="group"]').length === 1 &&
    pictures.length === 1 &&
    pictures[0].complete &&
    pictures[0].naturalWidth > 0
  );
}

/**
 * v1 step 1 (CF-505): setting the photo input's file opens the site's
 * "사진 등록" dialog, which keeps the picture only after its 저장 (the site
 * then uploads it). This follow-up confirms that dialog for the file the
 * extension just attached, once the crop picture has loaded.
 *
 * Off the v1 step-1 page, or for any input other than the page's single
 * photo input, it returns undefined (attaching is unchanged). It never
 * presses a dialog that was open before the attach, a dialog with another
 * title, 취소 or the X; failures resolve to the attach row's unverified reason.
 */
export function v1PhotoAttachFollowUp(
  input: HTMLInputElement,
): (() => Promise<string | undefined>) | undefined {
  const document = input.ownerDocument;
  if (!isV1BasicPage(document)) return undefined;
  const files = document
    .getElementById("root")
    ?.querySelectorAll('input[type="file"]');
  if (files?.length !== 1 || files[0] !== input) return undefined;
  const preexisting = v1Dialogs(document).length > 0;
  const url = document.URL;
  return async () => {
    const current = () =>
      document.URL === url &&
      input.isConnected &&
      (input.files?.length ?? 0) > 0;
    if (preexisting || !current()) return UNVERIFIED_ATTACH_REASON;
    let dialog: HTMLElement | undefined;
    const opened = await waitFor(
      () => !!(dialog = titledDialog(document, "사진 등록")),
      current,
      BOUND_MS,
    );
    const ready =
      opened &&
      (await waitFor(
        () => !!dialog && dialog.isConnected && cropReady(dialog),
        current,
        BOUND_MS,
      ));
    const save = dialog && dialogButton(dialog, "저장", true);
    if (
      !ready ||
      !save ||
      !current() ||
      titledDialog(document, "사진 등록") !== dialog
    )
      return UNVERIFIED_ATTACH_REASON;
    save.click();
    const closed = await waitFor(
      () => v1Dialogs(document).length === 0,
      () => document.URL === url,
      BOUND_MS,
    );
    if (!closed) return UNVERIFIED_ATTACH_REASON;
    // A kept picture replaces the photo card's file input; an input that
    // stays means the site dropped the file.
    const registered = await waitFor(
      () => !input.isConnected,
      () => document.URL === url,
      REGISTER_MS,
    );
    return registered ? undefined : UNVERIFIED_ATTACH_REASON;
  };
}

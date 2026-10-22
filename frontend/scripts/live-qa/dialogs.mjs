// Site dialogs while the harness is attached to the evaluation browser.
// Playwright answers a dialog by itself when nobody listens (dismiss, or accept
// for the leave-page prompt), on every tab of the browser, the person's own
// included. So every browser command installs a policy first:
// - installDialogPolicy: a prompt that only keeps the login is accepted;
//   anything else stays open for the person.
// - claimDialogs: a tab the harness is driving. Site dialogs are dismissed
//   (never confirmed) so the round does not stall, session prompts are
//   accepted, and the leave-page prompt is accepted only during a discard.
// Logs record the dialog type and what was done, never the message.
import { isSessionPrompt } from "./keepalive.mjs";

const claimed = new WeakSet();

export function installDialogPolicy(context) {
  const onDialog = (dialog) => {
    const page = dialog.page();
    if (page && claimed.has(page)) return;
    if (dialog.type() !== "beforeunload" && isSessionPrompt(dialog.message()))
      dialog.accept().catch(() => {});
  };
  context.on("dialog", onDialog);
  return () => context.off("dialog", onDialog);
}

export function claimDialogs(page) {
  const log = [];
  let leaveAllowed = false;
  const onDialog = (dialog) => {
    const type = dialog.type();
    if (type === "beforeunload") {
      if (!leaveAllowed) {
        log.push(`${type}: left-open`);
        return;
      }
      log.push(`${type}: accepted-for-discard`);
      dialog.accept().catch(() => {});
    } else if (isSessionPrompt(dialog.message())) {
      log.push(`${type}: accepted-session-prompt`);
      dialog.accept().catch(() => {});
    } else {
      log.push(`${type}: dismissed`);
      dialog.dismiss().catch(() => {});
    }
  };
  claimed.add(page);
  page.on("dialog", onDialog);
  return {
    log,
    allowLeave: (allowed) => {
      leaveAllowed = Boolean(allowed);
    },
    release: () => {
      page.off("dialog", onDialog);
      claimed.delete(page);
    },
  };
}

import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";

import { InPageProfilePanel } from "../../src/extension/InPageProfilePanel";
import { createProfilePanelController } from "../../src/extension/profile-panel-controller";
import {
  isOpenAutofillOverlayMessage,
  isOpenInPageProfilePanelMessage,
} from "../../src/autofill-demo/messages";
import {
  mountFloatingSidePanelLauncher,
  setFloatingSidePanelLauncherVisibility,
} from "../../src/extension/floating-side-panel-launcher";
import { shouldShowSidePanelLauncher } from "../../src/extension/side-panel-launcher-visibility";
import { openOptionsPageFromContent } from "../../src/extension/navigation";
import "./style.css";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    let profilePanelPromise:
      ReturnType<typeof createShadowRootUi<Root>> | undefined;
    const controller = createProfilePanelController();
    let openGeneration = 0;
    let invalidated = false;

    const closeProfilePanel = () => {
      const closingGeneration = ++openGeneration;
      controller.showProfile();
      void profilePanelPromise?.then((ui) =>
        ctx.setTimeout(() => {
          if (closingGeneration !== openGeneration) return;
          ui.remove();
          setFloatingSidePanelLauncherVisibility(document, true);
        }, 0),
      );
    };
    const getProfilePanel = () => {
      profilePanelPromise ??= createShadowRootUi(ctx, {
        name: "career-form-profile-panel",
        position: "overlay",
        zIndex: 2_147_483_646,
        isolateEvents: true,
        onMount(container) {
          const root = createRoot(container);
          root.render(
            <div className="career-form-in-page-panel">
              <InPageProfilePanel
                controller={controller}
                pageDocument={document}
                logoUrl={`chrome-extension://${browser.runtime.id}/side-panel-launcher-logo.png`}
                closePanel={closeProfilePanel}
                openOptions={openOptionsPageFromContent}
              />
            </div>,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      return profilePanelPromise;
    };
    const openProfilePanel = async () => {
      ++openGeneration;
      const panel = await getProfilePanel();
      if (invalidated) return;
      if (!panel.mounted) panel.mount();
      const host = panel.shadowHost;
      // Rise above ordinary page layers only on an explicit open request.
      // Site modals retain priority and page controls never become inert.
      if (
        typeof host.showPopover === "function" &&
        !document.querySelector("dialog:modal") &&
        !host.matches(":popover-open")
      ) {
        host.popover = "manual";
        host.showPopover();
      }
      setFloatingSidePanelLauncherVisibility(document, false);
    };
    const openAutofill = async () => {
      controller.startAutofill();
      await openProfilePanel();
    };
    if (shouldShowSidePanelLauncher(new URL(document.location.href))) {
      const removeLauncher = mountFloatingSidePanelLauncher(
        document,
        () => void openProfilePanel(),
        `chrome-extension://${browser.runtime.id}/side-panel-launcher-logo.png`,
      );
      ctx.onInvalidated(removeLauncher);
    }
    const receiveMessage = (message: unknown) => {
      if (isOpenAutofillOverlayMessage(message)) return openAutofill();
      if (isOpenInPageProfilePanelMessage(message)) return openProfilePanel();
      return undefined;
    };

    browser.runtime.onMessage.addListener(receiveMessage);
    ctx.onInvalidated(() => {
      invalidated = true;
      ++openGeneration;
      controller.showProfile();
      void profilePanelPromise?.then((ui) => ui.remove());
      browser.runtime.onMessage.removeListener(receiveMessage);
    });
  },
});

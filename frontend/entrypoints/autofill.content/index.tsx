import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";

import { RuntimeAnalysisApiClient } from "../../src/autofill/api/runtime-client";
import { AutofillOverlay } from "../../src/autofill-demo/AutofillOverlay";
import { isOpenAutofillOverlayMessage } from "../../src/autofill-demo/messages";
import { OPEN_SIDE_PANEL_MESSAGE } from "../../src/autofill-demo/messages";
import { mountFloatingSidePanelLauncher } from "../../src/extension/floating-side-panel-launcher";
import { shouldShowSidePanelLauncher } from "../../src/extension/side-panel-launcher-visibility";
import { ChromeProfileStorage } from "../../src/storage/chrome-profile-storage";
import "./style.css";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    if (shouldShowSidePanelLauncher(new URL(document.location.href))) {
      const removeLauncher = mountFloatingSidePanelLauncher(document, () => {
        void browser.runtime.sendMessage(OPEN_SIDE_PANEL_MESSAGE);
      }, `chrome-extension://${browser.runtime.id}/side-panel-launcher-logo.png`);
      ctx.onInvalidated(removeLauncher);
    }
    let uiPromise: ReturnType<typeof createShadowRootUi<Root>> | undefined;

    const closeOverlay = () => {
      void uiPromise?.then((ui) => ctx.setTimeout(() => ui.remove(), 0));
    };
    const getUi = () => {
      uiPromise ??= createShadowRootUi(ctx, {
        name: "career-form-autofill",
        position: "modal",
        zIndex: 2_147_483_647,
        isolateEvents: true,
        onMount(container) {
          const root = createRoot(container);
          root.render(
            <AutofillOverlay
              onClose={closeOverlay}
              apiClient={new RuntimeAnalysisApiClient()}
              repository={new ChromeProfileStorage()}
              pageDocument={document}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      return uiPromise;
    };
    const openOverlay = async () => {
      const ui = await getUi();
      if (!ui.mounted) ui.mount();
    };
    const receiveMessage = (message: unknown) => {
      if (!isOpenAutofillOverlayMessage(message)) return undefined;
      return openOverlay();
    };

    browser.runtime.onMessage.addListener(receiveMessage);
    ctx.onInvalidated(() =>
      browser.runtime.onMessage.removeListener(receiveMessage),
    );
  },
});

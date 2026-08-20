import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";

import { AutofillOverlay } from "../../src/autofill-demo/AutofillOverlay";
import { isOpenAutofillOverlayMessage } from "../../src/autofill-demo/messages";
import "./style.css";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
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
          root.render(<AutofillOverlay onClose={closeOverlay} />);
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

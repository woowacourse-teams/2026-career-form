import { installPolicyAutocompleteBridge } from "../src/autofill/interaction/jquery-autocomplete-main";
import { defineContentScript } from "wxt/utils/define-content-script";
import { installVerifiedJsResultClickBridge } from "../src/autofill/interaction/js-result-click-bridge";

import { installComponentEmailCloseBridge } from "../src/autofill/interaction/component-email-close-bridge";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  world: "MAIN",
  runAt: "document_start",
  noScriptStartedPostMessage: true,
  main() {
    installPolicyAutocompleteBridge(document);
    installVerifiedJsResultClickBridge(document);
    installComponentEmailCloseBridge(document);
  },
});

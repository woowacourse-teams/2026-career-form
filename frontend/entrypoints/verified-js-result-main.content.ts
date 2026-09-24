import { defineContentScript } from "wxt/utils/define-content-script";
import { installVerifiedJsResultClickBridge } from "../src/autofill/interaction/js-result-click-bridge";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  world: "MAIN",
  runAt: "document_start",
  noScriptStartedPostMessage: true,
  main() {
    installVerifiedJsResultClickBridge(document);
  },
});

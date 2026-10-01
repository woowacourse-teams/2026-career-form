import { defineContentScript } from "wxt/utils/define-content-script";

import {
  installSkAutocompleteMainBridge,
  type SkJQuery,
} from "../src/autofill/adapters/sk/autocomplete-main";

export default defineContentScript({
  matches: ["https://www.skcareers.com/Application/Index/*"],
  world: "MAIN",
  noScriptStartedPostMessage: true,

  main() {
    const jquery = (window as Window & { jQuery?: SkJQuery }).jQuery;
    if (!jquery) return;
    installSkAutocompleteMainBridge(document, jquery);
  },
});

import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { attachKakaoProvider } from "../src/autofill/address/provider";
export default defineContentScript({
  matches: ["https://postcode.map.kakao.com/search*"],
  allFrames: true,
  main(ctx) {
    if (window === window.top || location.pathname !== "/search") return;
    const port = browser.runtime.connect({ name: "cf-address-frame" });
    attachKakaoProvider(document, port);
    ctx.onInvalidated(() => port.disconnect());
  },
});

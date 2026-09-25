/*!
 * @license needPopup 1.0.0 - Copyright 2015 Dzmitry Vasileuski (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Exact reviewed needPopup.js 1.0.0 show/hide function expressions from
// https://imgrec.cj.net/recruit/ko/js/needPopup.js. Never evaluate these strings.
export const CJ_MAJOR_SHOW_SOURCE =
  'function(b, c) {\n\n\t\t\ta.focus = c;\n\t\t\tif (isIE() <=9 ) {\n\t\t\t\t//a.wrapper.width($(a.html).width()-17);\n\t\t\t}\n\n\t\t\tc ? a.trigger = c : a.trigger = 0\n\t\t\t, a.target ? needPopup.hide(!0) : (a.scrollTopVal = a.window.pageYOffset\n\t\t\t, $(a.body).css({ top: -a.scrollTopVal})\n\t\t\t, $(a.html).addClass(a.openHtmlClass))\n\n\t\t\ta.target = $(b)\n\t\t\t\n\t\t\ta.options = {}\n\t\t\t\n\t\t\t$.extend(a.options, needPopup.config["default"])\n\t\t\ta.target.data("popupOptions") && $.extend(a.options, needPopup.config[a.target.data("popupOptions")])\n\n\t\t\t\n\t\t\tif(a.target.find("iframe").length){\n\t\t\t\ta.target.find("iframe").attr("allowfullscreen","1")\n\t\t\t}\n\n\t\t\ta.minWidth = a.target.outerWidth();\n\n\t\t\tif(a.scroll){\n\t\t\t\t$(a.body).css({ top: 0,"position":"static","overflow-y":"auto"});\n\t\t\t\t$(a.body).scrollTop(a.scrollTopVal);\n\t\t\t\t$(a.html).scrollTop(a.scrollTopVal);\n\t\t\t}\n\n\t\t\tif(c.data("iframe-url")){\n\t\t\t\tc.data("iframe-url" , c.attr("data-iframe-url"));\n\t\t\t\tvar tw = c.data("width");\n\t\t\t\tvar th = c.data("height");\n\t\t\t\tvar tclass = c.data(\'class\');\n\t\t\t\tif (tclass === undefined) tclass = "";\n\t\t\t\tvar inner = $(\'<div id="popupIframe2" class="popup \'+ tclass +\'"><div class="popup_inner"></div></div>\');\n\t\t\t\tinner.width(tw).height(th).css("margin-left",-tw/2 );\n\t\t\t\tvar iframe = $(\'<iframe src="" title="" allowfullscreen="1"></iframe>\');\n\t\t\t\tiframe.width(\'100%\').height(\'100%\')\n\t\t\t\tiframe.attr("src",c.data("iframe-url"));\n\t\t\t\tiframe.attr("title",c.attr("title"));\n\t\t\t\tiframe.load(function(){\n\t\t\t\t\tif($(this).contents().find(".container_wrap").height() != null){\n\t\t\t\t\t\tinner.height($(this).contents().find(".container_wrap").height());\n\t\t\t\t\t}\n\t\t\t\t});\n\n\t\t\t\tinner.find(".popup_inner").width(\'100%\').height(\'100%\').append(iframe);\n\t\t\t\ta.wrapper.append(inner);\n\t\t\t\tdestroyTarget = inner;\n\t\t\t\ta.target = inner;\n\t\t\t\tdestroy = true;\n\t\t\t\tinner.show();\n\t\t\t}else{\n\t\t\t\t a.wrapper.append(a.target)\n\t\t\t\t , a.target.show()\n\t\t\t};\n\n\t\t\t"outside" == a.options.removerPlace ? a.wrapper.after(\'<a href="#" id="popup_cls" class="popup_cls"><span class="blind">닫기</span></a>\') : "inside" == a.options.removerPlace && a.target.append(\'<a href="#" id="popup_cls" class="popup_cls"><span class="blind">닫기</span></a>\')\n\t\t\t, a.options.onBeforeShow.call(a, a.target)\n\t\t\t, needPopup.centrify(), setTimeout(function() {\n\t\t\t\t\ta.target.addClass("opened"), a.options.onShow.call(a, a.target)\n\t\t\t}, 10);\n\n\t\t\t$(a.target).prepend(\'<span tabindex="0" class="tab_span"></span>\');\n\t\t\t$(a.target).append(\'<span tabindex="1" class="tab_span"></span>\');\n\t\t\t$(a.target).attr("tabindex","-1");\n\t\t\t\n\t\t\t\n\t\t\t$(a.target).find(\'*\').each(function(i,val) {\n\t\t\t\tif(val.nodeName.match(/^A$|AREA|INPUT|TEXTAREA|SELECT|BUTTON/gim) && parseInt(val.getAttribute("tabIndex")) !== -1) {\n\t\t\t\t\tfocusable.push(val);\n\t\t\t\t}\n\t\t\t\tif((val.getAttribute("tabIndex") !== null) && (parseInt(val.getAttribute("tabIndex")) >= 0) && (val.getAttribute("tabIndex", 2) !== 32768)) {\n\t\t\t\t\tfocusable.push(val);\n\t\t\t\t}\n\t\t\t});\n\t\t\t\n\t\t\tif(focusable.length){\n\t\t\t\t$(a.target).find(".tab_span").eq(0).focus();\n\t\t\t\tkeyListener = $(a.target).find(".popup_cls").tabkeyListener(needPopup.tabForward);\n\t\t\t\tkeyListener2 = $(focusable[0]).tabkeyListener(null,needPopup.tabbackward);\n\t\t\t}\n\t\t\t\t\t\t\n\t\t}';
export const CJ_MAJOR_HIDE_SOURCE =
  'function(b) {\n\t\t\tfocusable = [];\n\t\t\ta.target.hide().removeClass("opened");\n\t\t\t$(".popup_cls").remove();\n\t\t\ta.target.find(".tab_span").remove();\n\n\t\t\tif(a.scroll){\n\t\t\t\tb || ($(a.html).removeClass(a.openHtmlClass).removeClass("popup_overflow"));\n\t\t\t}else{\n\t\t\t\tb || ($(a.html).removeClass(a.openHtmlClass).removeClass("popup_overflow"),\t$(a.body).css({top: 0}).scrollTop(a.scrollTopVal),$(a.html).scrollTop(a.scrollTopVal));\t\n\t\t\t}\n\n\t\t\ta.options.onHide.call(a, a.target);\n\t\t\ta.target = 0;\n\t\t\tif(focusable.length){\n\t\t\t\tkeyListener.remove();\n\t\t\t\tkeyListener2.remove();\n\t\t\t}\n\t\t\t\n\t\t\t$(".popup_wrapper").find("iframe").attr("src","");\n\n\t\t\tif(destroy){\n\t\t\t\t$(destroyTarget).remove();\n\t\t\t};\n\t\t\ta.scroll = false;\n\t\t\t$(a.focus).focus();\n\t\t}';
export const CJ_MAJOR_REQUEST_EVENT = "career-form:cj-major-close-request";
export const CJ_MAJOR_ACK_EVENT = "career-form:cj-major-close-ack";
export const CJ_MAJOR_OPENER_MARKER = "data-career-form-cj-major-close";
export const CJ_MAJOR_ORIGIN = "https://recruit.cj.net";
export const CJ_MAJOR_URL =
  "https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0";

// Captured at document_start, before page scripts can replace the prototype method.
const nativeFunctionToString = Function.prototype.toString;
export function methodSource(value: Function): string {
  return nativeFunctionToString.call(value);
}
export function reviewedMethod(
  value: unknown,
  expected: string,
): value is (...args: never[]) => unknown {
  return typeof value === "function" && methodSource(value) === expected;
}

export function validMajorOpener(opener: Element): boolean {
  const doc = opener.ownerDocument;
  // Only the reviewed button's native metadata and our temporary lease marker.
  // An inline handler or form override could add side effects before/after click.
  const allowed = new Set([
    "type",
    "name",
    "title",
    "class",
    "aria-label",
    "data-popup-show",
    "data-iframe-url",
    "data-width",
    "data-height",
    CJ_MAJOR_OPENER_MARKER,
  ]);
  if (
    [...opener.attributes].some(
      ({ name }) =>
        !allowed.has(name.toLowerCase()) ||
        /^on/i.test(name) ||
        /^form/i.test(name),
    )
  )
    return false;
  if (
    opener.hasAttribute("data-popup-show") &&
    opener.getAttribute("data-popup-show") !== ""
  )
    return false;
  return (
    doc.location.origin === CJ_MAJOR_ORIGIN &&
    opener.isConnected &&
    opener.matches('button[type="button"][name="bt_mm_major_nm"]:not([id])') &&
    opener.getAttribute("data-iframe-url") === CJ_MAJOR_URL &&
    !opener.hasAttribute("data-popup-options") &&
    opener.closest("#sectionNormalUniversity0") !== null &&
    doc.querySelectorAll('#sectionNormalUniversity0 [name="bt_mm_major_nm"]')
      .length === 1 &&
    opener
      .closest("dd")
      ?.querySelectorAll('input#mm_major_nm2_0[name="mm_major_nm"]').length ===
      1 &&
    opener.closest("dd")?.querySelectorAll('input[type="hidden"][name="major"]')
      .length === 1
  );
}

export function parseMajorRequest(
  event: Event,
):
  { nonce: string; action: "arm" | "check" | "close" | "release" } | undefined {
  if (!("detail" in event) || typeof event.detail !== "string") return;
  try {
    const input: unknown = JSON.parse(event.detail);
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const value = input as Record<string, unknown>;
    if (typeof value.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(value.nonce))
      return;
    if (
      value.action !== "arm" &&
      value.action !== "check" &&
      value.action !== "close" &&
      value.action !== "release"
    )
      return;
    if (Object.keys(value).length !== 2) return;
    return { nonce: value.nonce, action: value.action };
  } catch {
    return;
  }
}

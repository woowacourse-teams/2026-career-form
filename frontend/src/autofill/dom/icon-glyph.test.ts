import { describe, expect, it } from "vitest";

import { iconGlyphLabel } from "./icon-glyph";

const button = (inner: string) => {
  document.body.innerHTML = `<button>${inner}</button>`;
  return document.querySelector("button")!;
};

describe("iconGlyphLabel", () => {
  it.each([
    ['<svg><path d="M5 12H19"></path><path d="M12 5V19"></path></svg>', "+"],
    ['<svg><path d="M5 12h14M12 5v14"></path></svg>', "+"],
    ['<svg><line x1="5" y1="12" x2="19" y2="12"></line><line x1="12" y1="5" x2="12" y2="19"></line></svg>', "+"],
    ['<svg><path d="M5 12H19"></path></svg>', "-"],
    ['<svg><rect width="36" height="36" rx="18"></rect><path d="M13 18H23"></path><path d="M18 13V23"></path></svg>', "+"],
    ['<svg><g><rect width="36" height="36" rx="18"></rect></g><path d="M12 18H24"></path></svg>', "-"],
    ['<svg><polygon points="0,0 10,0 5,8"></polygon></svg>', undefined],
    ['<svg><path d="M5 5L19 19M19 5L5 19"></path></svg>', undefined],
    ['<svg><circle cx="12" cy="12" r="5"></circle></svg>', undefined],
    ['<svg><path d="M5 12H19"></path></svg> 삭제', undefined],
    ["", undefined],
  ])("%s -> %s", (inner, glyph) => {
    expect(iconGlyphLabel(button(inner))).toBe(glyph);
  });
});

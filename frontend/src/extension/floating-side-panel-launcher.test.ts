import { describe, expect, it, vi } from "vitest";

import {
  mountFloatingSidePanelLauncher,
  setFloatingSidePanelLauncherVisibility,
} from "./floating-side-panel-launcher";

describe("floating side panel launcher", () => {
  it("opens the side panel when its page launcher is clicked", () => {
    const openSidePanel = vi.fn();
    const cleanup = mountFloatingSidePanelLauncher(
      document,
      openSidePanel,
      "chrome-extension://test/launcher-logo.png",
    );

    const host = document.querySelector<HTMLElement>(
      "[data-career-form-side-panel-launcher]",
    );
    const button = host?.shadowRoot?.querySelector<HTMLButtonElement>("button");
    expect(button).toHaveAccessibleName("프로필 사이드바 열기");
    expect(button?.style.top).toBe("120px");
    expect(button?.style.left).toBe("20px");
    expect(button?.style.right).toBe("");
    expect(button?.style.bottom).toBe("");
    expect(button?.querySelector("img")).toHaveAttribute(
      "src",
      "chrome-extension://test/launcher-logo.png",
    );

    button?.click();

    expect(openSidePanel).toHaveBeenCalledOnce();
    cleanup();
  });

  it("removes the launcher from the page during cleanup", () => {
    const cleanup = mountFloatingSidePanelLauncher(document, vi.fn());

    cleanup();

    expect(
      document.querySelector("[data-career-form-side-panel-launcher]"),
    ).toBeNull();
  });

  it("hides the launcher while an in-page panel is open", () => {
    const cleanup = mountFloatingSidePanelLauncher(document, vi.fn());
    const host = document.querySelector<HTMLElement>(
      "[data-career-form-side-panel-launcher]",
    );

    setFloatingSidePanelLauncherVisibility(document, false);
    expect(host).toHaveStyle({ display: "none" });

    setFloatingSidePanelLauncherVisibility(document, true);
    expect(host).not.toHaveStyle({ display: "none" });
    cleanup();
  });

  it("moves the launcher when the user drags it", () => {
    const cleanup = mountFloatingSidePanelLauncher(document, vi.fn());
    const button = document
      .querySelector<HTMLElement>("[data-career-form-side-panel-launcher]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>("button")!;

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        composed: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        composed: true,
        clientX: 38,
        clientY: 46,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        composed: true,
        clientX: 38,
        clientY: 46,
      }),
    );

    expect(button.style.transform).toBe("translate(28px, 36px)");
    cleanup();
  });
});

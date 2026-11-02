import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProfileForm } from "../../src/profile/components/ProfileForm";
import { getCategoryDefinition } from "../../src/profile/field-definitions";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

const emptyRepository = {
  load: async () => createEmptyProfile(),
  save: async () => undefined,
  loadLayout: async () => "a" as const,
  saveLayout: async () => undefined,
};

const selectProfileTab = () =>
  fireEvent.click(screen.getByRole("tab", { name: "내 정보" }));

function resolveVars(value: string): string {
  const root = getComputedStyle(document.documentElement);
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
    root.getPropertyValue(name).trim(),
  );
}

function luminance(color: string): number {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const rgb = color.match(/^rgb\((\d+),?\s*(\d+),?\s*(\d+)\)$/);
  const channels = hex
    ? hex.slice(1).map((part) => parseInt(part, 16))
    : rgb?.slice(1).map(Number);
  if (!channels) throw new Error(`Unsupported opaque color: ${color}`);
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// jsdom does not match dynamic pseudo-classes; inspect their source rules.
function stateRules(element: Element, pseudo: ":hover" | ":active" | null) {
  const dynamic = /:(hover|active|focus|focus-visible|focus-within)\b/;
  return [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter((rule) =>
      rule.selectorText.split(",").some((selector) => {
        if (pseudo === null) {
          return !dynamic.test(selector) && element.matches(selector);
        }
        if (!selector.includes(pseudo)) return false;
        const resting = selector.replaceAll(pseudo, "");
        return !dynamic.test(resting) && element.matches(resting);
      }),
    );
}

// These isolated rules use source order; browser QA checks the full cascade.
function declared(
  element: Element,
  property: string,
  pseudo: ":hover" | ":active" | null,
) {
  const values = [
    ...stateRules(element, null),
    ...(pseudo === ":active" ? stateRules(element, ":hover") : []),
    ...(pseudo ? stateRules(element, pseudo) : []),
  ]
    .map((rule) => rule.style.getPropertyValue(property))
    .filter(Boolean);
  const value = values.at(-1);
  if (!value) throw new Error(`Missing ${property} declaration`);
  return resolveVars(value);
}

it("keeps panel layout and logo constrained without fetched entry CSS", async () => {
  const externalStyles = [...document.head.querySelectorAll("style")];
  externalStyles.forEach((style) => style.remove());
  try {
    render(
      <App
        inPage
        repository={{
          load: async () => createEmptyProfile(),
          save: async () => undefined,
          loadLayout: async () => "a",
          saveLayout: async () => undefined,
        }}
      />,
    );
    await screen.findByRole("tablist");
    const logo = screen.getByRole("img", { name: "커리어폼" });
    expect(logo).toHaveAttribute("width", "28");
    expect(logo).toHaveAttribute("height", "28");
    expect(getComputedStyle(logo).width).toBe("28px");
    expect(getComputedStyle(logo).height).toBe("28px");
    expect(
      getComputedStyle(logo.closest("header")!.parentElement!).display,
    ).toBe("grid");
  } finally {
    externalStyles.forEach((style) => document.head.append(style));
  }
});

it("keeps the empty search field boundary at 3:1 on white and cream surfaces", async () => {
  render(<App inPage repository={emptyRepository} />);
  selectProfileTab();
  const field = (
    await screen.findByRole("searchbox", { name: "프로필 검색" })
  ).closest("label")!;
  const border = declared(field, "border", null).split(" ").at(-1)!;

  for (const surface of ["--color-surface", "--color-surface-muted"]) {
    expect(
      contrast(border, resolveVars(`var(${surface})`)),
    ).toBeGreaterThanOrEqual(3);
  }
});

it("distinguishes copy hover and pressed states without changing geometry", async () => {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "지원";
  render(
    <App
      inPage
      repository={{ ...emptyRepository, load: async () => profile }}
    />,
  );
  selectProfileTab();
  const copy = await screen.findByRole("button", { name: "국문 이름 복사" });
  const rest = declared(copy, "background", null);
  const hover = declared(copy, "background", ":hover");
  const pressed = declared(copy, "background", ":active");

  expect(new Set([rest, hover, pressed]).size).toBe(3);
  for (const rule of [
    ...stateRules(copy, ":hover"),
    ...stateRules(copy, ":active"),
  ]) {
    for (const property of rule.style) {
      expect(property).toMatch(/^(background|color$|border-[a-z]+-color$)/);
    }
  }
});

it("keeps editable profile field boundaries visible while hovered", () => {
  render(
    <ProfileForm
      category={getCategoryDefinition("compensation")}
      profile={createEmptyProfile()}
      onAddEntry={vi.fn()}
      onRemoveEntry={vi.fn()}
      onUpdateEntry={vi.fn()}
      onUpdateSingle={vi.fn()}
      confirmDelete={() => true}
    />,
  );

  for (const field of screen.getAllByRole("textbox")) {
    const border = declared(field, "border-color", ":hover");
    for (const surface of ["--color-surface", "--color-surface-muted"]) {
      expect(
        contrast(border, resolveVars(`var(${surface})`)),
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

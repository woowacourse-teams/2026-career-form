import { afterEach, expect, it, vi } from "vitest";
import { activateOwnedPrimary } from "./staged-address-activation";
import { runDomPlan, validDomPlan, type DomPlan } from "./action-plan";
afterEach(() => vi.restoreAllMocks());
const activation = [
  { op: "ACTIVATE_PRIMARY", target: "commit" },
] as unknown as DomPlan;
function target() {
  document.body.innerHTML =
    '<div id="modal" class="modal-bg"><div class="modal"><button type="button" data-button="modalSubmit">저장</button></div></div>';
  const button = document.querySelector("button")!;
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    x: 20,
    y: 30,
    left: 20,
    top: 30,
    right: 100,
    bottom: 70,
    width: 80,
    height: 40,
    toJSON: () => ({}),
  });
  return button;
}
it("activates only a primary pointer with coordinates and complete mouse compatibility sequence", async () => {
  const button = target();
  const events: unknown[] = [];
  for (const name of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ])
    button.addEventListener(name, (event) => {
      const e = event as PointerEvent;
      events.push([
        e.type,
        e.button,
        e.buttons,
        e.clientX,
        e.clientY,
        e.isTrusted,
        e.type.startsWith("pointer") ? e.isPrimary : null,
      ]);
    });
  expect(await activateOwnedPrimary(button, async () => true)).toBe(true);
  expect(events).toEqual([
    ["pointerdown", 0, 1, 60, 50, false, true],
    ["mousedown", 0, 1, 60, 50, false, null],
    ["pointerup", 0, 0, 60, 50, false, true],
    ["mouseup", 0, 0, 60, 50, false, null],
    ["click", 0, 0, 60, 50, false, null],
  ]);
});
it("rechecks ownership between each event and never finishes a revoked activation", async () => {
  const button = target();
  let current = true;
  const events: string[] = [];
  for (const name of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ])
    button.addEventListener(name, () => {
      events.push(name);
      if (name === "mousedown") current = false;
    });
  expect(await activateOwnedPrimary(button, async () => current)).toBe(false);
  expect(events).toEqual(["pointerdown", "mousedown"]);
});
it.each([
  { event: "dblclick" },
  { button: 2 },
  { buttons: 4 },
  { value: "submit" },
  { composed: false },
  { code: "Enter" },
])("rejects arbitrary activation options %j", (extra) => {
  expect(validDomPlan([{ ...activation[0], ...extra }])).toBe(false);
});
it.each(["submit", "disabled", "zero-size"])(
  "refuses unsafe activation target %s",
  async (kind) => {
    const button = target();
    if (kind === "submit") button.type = "submit";
    if (kind === "disabled") button.disabled = true;
    if (kind === "zero-size")
      vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect());
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));
    expect(await activateOwnedPrimary(button, async () => true)).toBe(false);
    expect(clicked).toBe(false);
  },
);

it("rejects primary activation in generic plans without dispatching any event", () => {
  const button = target();
  const clicked = vi.fn();
  button.addEventListener("click", clicked);
  expect(validDomPlan(activation)).toBe(false);
  expect(runDomPlan(activation, { commit: button }, {}, () => true)).toBe(
    false,
  );
  expect(clicked).not.toHaveBeenCalled();
});

it.each(["searchActivate", "addressSearch"])(
  "rejects primary activation in Greeting %s",
  async (key) => {
    const { fixturePolicy } =
      await import("../../test/fixtures/execution-policy");
    const { validComponentPolicy } = await import("./component-policy");
    const policy = fixturePolicy("greeting").componentPolicy!;
    expect(validComponentPolicy(policy)).toBe(true);
    policy.actionPlans[key] = activation;
    expect(validComponentPolicy(policy)).toBe(false);
  },
);
it("rejects primary activation in other address provider plans", async () => {
  const { fixturePolicy } =
    await import("../../test/fixtures/execution-policy");
  const { validAddressProviderPolicy } =
    await import("../address/provider-policy");
  const policy = fixturePolicy("sk").providerPolicy!;
  expect(validAddressProviderPolicy(policy)).toBe(true);
  policy.searchPlan = activation;
  expect(validAddressProviderPolicy(policy)).toBe(false);
});

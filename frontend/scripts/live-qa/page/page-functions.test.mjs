// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clickKeepLogin, pingSession, sessionStatus } from "../keepalive.mjs";
import { census } from "./census.mjs";
import { clearForm } from "./clear.mjs";
import { installGuard } from "./guard.mjs";
import { readStep, submitStepNavigation } from "./hplace-step.mjs";
import { watchMounts } from "./mounts.mjs";
import { panelState } from "./panel.mjs";

// Every function serialized into a page (page.evaluate). Hyundai's page
// scripts replace Map and Set with a polyfill, so none of them may use either.
const PAGE_FUNCTIONS = {
  census,
  clearForm,
  installGuard,
  readStep,
  submitStepNavigation,
  watchMounts,
  panelState,
  sessionStatus,
  clickKeepLogin,
  pingSession,
};

describe("page functions", () => {
  it.each(Object.entries(PAGE_FUNCTIONS))(
    "%s does not use Map, Set, WeakMap or WeakSet",
    (_, fn) => {
      expect(fn.toString()).not.toMatch(/\b(?:Weak)?(?:Map|Set)\b/);
    },
  );
});

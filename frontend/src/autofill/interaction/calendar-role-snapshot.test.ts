import { afterEach, expect, it, vi } from "vitest";
import { resolveCalendarRole } from "./calendar-role-resolver";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it.each([
  "display",
  "visibility",
  "opacity",
  "pointer-events",
  "class",
  "disabled",
  "option-label",
  "option-value",
  "option-disabled",
  "value",
  "detached",
  "replaced",
  "reparented",
  "ownership",
  "approval",
  "abort",
  "timeout",
  "abstained",
])("rejects %s changes during a role request", async (mutation) => {
  // Given: exact connected candidate and current local authority.
  vi.useFakeTimers();
  document.body.innerHTML = `<div id="owned"><select><option value="2020">2020</option><option value="2024">2024</option></select></div><div id="other"></div>`;
  const element = document.querySelector("select");
  const other = document.querySelector("#other");
  if (!element || !other) throw new Error("Missing synthetic candidate");
  const option = element.options[1];
  if (!option) throw new Error("Missing option");
  const signal = new AbortController();
  let current = true;
  let clock = 0;
  let requested = false;

  // When: model response arrives after a safety-relevant state change.
  const result = await resolveCalendarRole({
    role: "CALENDAR_YEAR_CONTROL",
    candidates: [{ candidateId: "year-1", element }],
    evidence: {
      unit: "day",
      unitEvidence: "target-format",
      ownership: "bound-target",
    },
    canonicalFieldKey: "calendar-day",
    deadline: 1000,
    now: () => clock,
    signal: signal.signal,
    revalidate: () => current,
    provider: async (request) => {
      requested = true;
      switch (mutation) {
        case "display":
          element.style.display = "none";
          break;
        case "visibility":
          element.style.visibility = "hidden";
          break;
        case "opacity":
          element.style.opacity = "0";
          break;
        case "pointer-events":
          element.style.pointerEvents = "none";
          break;
        case "class":
          element.className = "ui-state-disabled";
          break;
        case "disabled":
          element.disabled = true;
          break;
        case "option-label":
          option.textContent = "2025";
          break;
        case "option-value":
          option.value = "2025";
          break;
        case "option-disabled":
          option.disabled = true;
          break;
        case "value":
          element.value = "2024";
          break;
        case "detached":
          element.remove();
          break;
        case "replaced":
          element.replaceWith(element.cloneNode(true));
          break;
        case "reparented":
          other.append(element);
          break;
        case "ownership":
        case "approval":
          current = false;
          break;
        case "abort":
          signal.abort();
          break;
        case "timeout":
          clock = 1000;
          break;
      }
      return {
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: [
          {
            decisionId: "calendar-role",
            role: "CALENDAR_YEAR_CONTROL",
            selection: mutation === "abstained" ? "ABSTAINED" : "SELECTED",
            candidateId: mutation === "abstained" ? null : "year-1",
          },
        ],
      };
    },
  });

  // Then: response does not authorize changed or unavailable evidence.
  expect(requested).toBe(true);
  expect(result).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

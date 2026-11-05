import { describe, expect, it, vi } from "vitest";
import type { FieldsAnalyzeRequest } from "../api/types";
import type { CollectedSnapshot } from "../dom/collect";
import { CandidateRegistry } from "../dom/candidate-registry";
import {
  settleVisibleFields,
  transientlyHidden,
  visibleFieldCount,
} from "./visible-fields-settle";

function snapshot(
  visible: number,
  hidden: number,
): CollectedSnapshot<FieldsAnalyzeRequest> {
  const field = (index: number, visibility: "visible" | "hidden") => ({
    candidateId: `field-${visibility}-${index}`,
    element: "input" as const,
    control: "text" as const,
    visibility,
    domName: `name-${visibility}-${index}`,
  });
  return {
    request: {
      schemaVersion: 2,
      snapshotId: "snapshot",
      site: { host: "example.test", pathPattern: "/apply" },
      sections: [
        {
          sectionId: "section-root",
          fields: Array.from({ length: visible }, (_, i) =>
            field(i, "visible"),
          ),
          items: [
            {
              itemId: "item-1",
              fields: Array.from({ length: hidden }, (_, i) =>
                field(i, "hidden"),
              ),
            },
          ],
        },
      ],
    } as unknown as FieldsAnalyzeRequest,
    registry: new CandidateRegistry(),
  };
}

describe("visible fields settle", () => {
  it("counts visible fields across sections and items", () => {
    expect(visibleFieldCount(snapshot(3, 5))).toBe(3);
  });

  it("calls a snapshot transient only against a real baseline", () => {
    expect(transientlyHidden(undefined, snapshot(0, 10))).toBe(false);
    expect(transientlyHidden(3, snapshot(0, 10))).toBe(false);
    expect(transientlyHidden(80, snapshot(1, 80))).toBe(true);
    expect(transientlyHidden(80, snapshot(40, 41))).toBe(false);
    expect(transientlyHidden(80, snapshot(39, 42))).toBe(true);
  });

  it("returns a visible snapshot without waiting", async () => {
    const collect = vi.fn();
    const settled = await settleVisibleFields({
      snapshot: snapshot(81, 0),
      previousVisible: 81,
      collect,
      sleep: vi.fn(),
    });
    expect(settled).toEqual({
      snapshot: expect.anything(),
      retries: 0,
      stillHidden: false,
      dismissed: 0,
    });
    expect(collect).not.toHaveBeenCalled();
  });

  it("re-collects while the page is hidden and stops once it shows again", async () => {
    const snapshots = [snapshot(0, 81), snapshot(2, 79), snapshot(81, 0)];
    const collect = vi.fn(async () => snapshots.shift()!);
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const settled = await settleVisibleFields({
      snapshot: snapshot(1, 80),
      previousVisible: 81,
      collect,
      now: () => clock,
      sleep,
      pollMs: 100,
      maxMs: 3000,
    });
    expect(collect).toHaveBeenCalledTimes(3);
    expect(settled.retries).toBe(3);
    expect(settled.stillHidden).toBe(false);
    expect(visibleFieldCount(settled.snapshot)).toBe(81);
  });

  it("closes what hides the page before each re-collection", async () => {
    const snapshots = [snapshot(0, 81), snapshot(81, 0)];
    const collect = vi.fn(async () => snapshots.shift()!);
    const dismiss = vi.fn(() => true);
    let clock = 0;
    const settled = await settleVisibleFields({
      snapshot: snapshot(1, 80),
      previousVisible: 81,
      collect,
      dismiss,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(settled.dismissed).toBe(2);
    expect(settled.stillHidden).toBe(false);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it("gives up at the deadline and reports the page as still hidden", async () => {
    const collect = vi.fn(async () => snapshot(0, 81));
    let clock = 0;
    const settled = await settleVisibleFields({
      snapshot: snapshot(0, 81),
      previousVisible: 81,
      collect,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      pollMs: 500,
      maxMs: 1000,
    });
    expect(collect).toHaveBeenCalledTimes(2);
    expect(settled.stillHidden).toBe(true);
  });

  it("stops when the run is aborted", async () => {
    const controller = new AbortController();
    const collect = vi.fn(async () => snapshot(0, 81));
    const settled = await settleVisibleFields({
      snapshot: snapshot(0, 81),
      previousVisible: 81,
      collect,
      signal: controller.signal,
      sleep: async () => {
        controller.abort();
      },
    });
    expect(collect).not.toHaveBeenCalled();
    expect(settled.stillHidden).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createEmptyProfile, type Profile } from "../profile/model";
import { ChromeProfileStorage } from "./chrome-profile-storage";
import { createProfileWriteHandler } from "./profile-write-handler";

function setup() {
  let stored: Record<string, unknown> = {};
  let fail = false;
  const storage = {
    get: async (key: string) => ({ [key]: stored[key] }),
    set: async (value: Record<string, unknown>) => {
      if (fail) {
        fail = false;
        throw new Error("private storage detail");
      }
      stored = { ...stored, ...value };
    },
  };
  const repository = new ChromeProfileStorage(storage);
  return {
    repository,
    handle: createProfileWriteHandler(storage, "extension-id"),
    failNext: () => {
      fail = true;
    },
  };
}
const request = (expected: Profile, next: Profile) => ({
  type: "careerForm.profile.compareAndSave",
  expected,
  next,
});
const sender = { id: "extension-id" };

describe("profile write serialization", () => {
  it("commits one concurrent writer and rejects the stale import without dropping phone data", async () => {
    const { repository, handle } = setup();
    const baseline = await repository.load();
    const options = structuredClone(baseline);
    options.contact.phoneNumber = "01012345678";
    const imported = structuredClone(baseline);
    imported.contact.email = "fixture@example.invalid";
    expect(
      await Promise.all([
        handle(request(baseline, options), sender),
        handle(request(baseline, imported), sender),
      ]),
    ).toEqual([{ status: "saved" }, { status: "conflict" }]);
    expect((await repository.load()).contact).toEqual({
      phoneNumber: "01012345678",
    });
  });
  it("rejects delayed options autosave after import succeeds", async () => {
    const { repository, handle } = setup();
    const baseline = await repository.load();
    const imported = structuredClone(baseline);
    imported.contact.email = "fixture@example.invalid";
    const options = structuredClone(baseline);
    options.contact.phoneNumber = "01012345678";
    expect(await handle(request(baseline, imported), sender)).toEqual({
      status: "saved",
    });
    expect(await handle(request(baseline, options), sender)).toEqual({
      status: "conflict",
    });
    expect((await repository.load()).contact).toEqual({
      email: "fixture@example.invalid",
    });
  });
  it("recovers its queue after a rejected storage write without exposing error details", async () => {
    const { repository, handle, failNext } = setup();
    const baseline = await repository.load();
    const next = structuredClone(baseline);
    next.contact.email = "fixture@example.invalid";
    failNext();
    expect(await handle(request(baseline, next), sender)).toEqual({
      status: "error",
    });
    expect(await handle(request(baseline, next), sender)).toEqual({
      status: "saved",
    });
    expect((await repository.load()).contact.email).toBe(
      "fixture@example.invalid",
    );
  });
  it("rejects malformed requests and foreign senders without writes", async () => {
    const { repository, handle } = setup();
    const baseline = createEmptyProfile();
    const next = structuredClone(baseline);
    next.contact.email = "fixture@example.invalid";
    expect(await handle(request(baseline, next), { id: "foreign" })).toEqual({
      status: "invalid",
    });
    expect(
      await handle(
        {
          type: "careerForm.profile.compareAndSave",
          expected: baseline,
          next: { personal: {} },
        },
        sender,
      ),
    ).toEqual({ status: "invalid" });
    expect(await repository.load()).toEqual(baseline);
  });
  it("ignores unrelated messages", () => {
    expect(setup().handle({ type: "another-message" }, sender)).toBeUndefined();
  });
  it("compares reordered objects by structure and sanitizes only the next profile", async () => {
    const { repository, handle } = setup();
    const baseline = createEmptyProfile();
    baseline.contact = {
      email: "before@example.invalid",
      phoneNumber: "01012345678",
    };
    await repository.save(baseline);
    const expected = structuredClone(baseline);
    expected.contact = {
      phoneNumber: "01012345678",
      email: "before@example.invalid",
    };
    const next = structuredClone(baseline);
    next.contact.email = "  after@example.invalid  ";
    expect(await handle(request(expected, next), sender)).toEqual({
      status: "saved",
    });
    expect((await repository.load()).contact).toEqual({
      email: "after@example.invalid",
      phoneNumber: "01012345678",
    });
  });
});

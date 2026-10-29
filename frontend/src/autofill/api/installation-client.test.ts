import { describe, expect, it } from "vitest";
import { createInstallationClient } from "./installation-client";

const credentials = {
  installationId: "00000000-0000-4000-8000-000000000001",
  token: "a".repeat(64),
};

function storage() {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: async (name: string) => ({ [name]: values[name] }),
    set: async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    },
  };
}

describe("anonymous installation registration", () => {
  it("shares concurrent initialization and reuses persisted credentials after restart", async () => {
    const local = storage();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return Response.json(credentials);
    };
    const client = createInstallationClient({
      baseUrl: "https://api.example.test",
      storage: local,
      fetcher,
    });
    const results = await Promise.all([
      client.credentials(),
      client.credentials(),
    ]);
    expect(results).toEqual([credentials, credentials]);
    expect(calls).toBe(1);
    const restarted = createInstallationClient({
      baseUrl: "https://api.example.test",
      storage: local,
      fetcher,
    });
    expect(await restarted.credentials()).toEqual(credentials);
    expect(calls).toBe(1);
  });

  it("retries a lost response using the same persisted registration key", async () => {
    const local = storage();
    const keys: unknown[] = [];
    let calls = 0;
    const fetcher = async (_url: string, init?: RequestInit) => {
      keys.push(JSON.parse(String(init?.body)).key);
      if (calls++ === 0) throw new TypeError("synthetic network failure");
      return Response.json(credentials);
    };
    const client = createInstallationClient({
      baseUrl: "https://api.example.test",
      storage: local,
      fetcher,
      sleep: async () => {},
    });
    expect(await client.credentials()).toEqual(credentials);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(typeof keys[0]).toBe("string");
  });

  it("rejects insecure origins before sending credentials", async () => {
    let calls = 0;
    const client = createInstallationClient({
      baseUrl: "http://api.example.test",
      storage: storage(),
      fetcher: async () => {
        calls++;
        return Response.json(credentials);
      },
    });
    await expect(client.credentials()).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("stops registration after bounded retries", async () => {
    let calls = 0;
    const client = createInstallationClient({
      baseUrl: "https://api.example.test",
      storage: storage(),
      sleep: async () => {},
      fetcher: async () => {
        calls++;
        return new Response(null, { status: 503 });
      },
    });
    await expect(client.credentials()).rejects.toThrow();
    expect(calls).toBe(4);
  });
});

it("restarts an expired registration once with a new key", async () => {
  const keys: unknown[] = [];
  const client = createInstallationClient({
    baseUrl: "https://api.example.test",
    storage: storage(),
    sleep: async () => {},
    fetcher: async (_url, init) => {
      keys.push(JSON.parse(String(init?.body)).key);
      return keys.length === 1
        ? Response.json({ code: "REGISTRATION_EXPIRED" }, { status: 410 })
        : Response.json(credentials);
    },
  });
  expect(await client.credentials()).toEqual(credentials);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

it("replays the same key when persisting returned credentials fails", async () => {
  const local = storage();
  const keys: unknown[] = [];
  let failed = false;
  const client = createInstallationClient({
    baseUrl: "https://api.example.test",
    sleep: async () => {},
    storage: {
      get: local.get,
      set: async (values) => {
        const value = values.analysisInstallation;
        if (
          !failed &&
          typeof value === "object" &&
          value !== null &&
          "token" in value
        ) {
          failed = true;
          throw new Error("synthetic local write failure");
        }
        await local.set(values);
      },
    },
    fetcher: async (_url, init) => {
      keys.push(JSON.parse(String(init?.body)).key);
      return Response.json(credentials);
    },
  });
  expect(await client.credentials()).toEqual(credentials);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

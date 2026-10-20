export interface Receipt {
  runId: string;
  token: string;
  expiresAt: number;
}

export class PendingRegistration {
  readonly key = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  readonly expiresAt = Date.now() + 86400000;
  readonly deadline = Date.now() + 30000;
  readonly ready: Promise<Receipt | undefined>;
  excluded = false;

  constructor(
    readonly clientRun: string,
    baseUrl: string,
    fetcher: typeof fetch,
  ) {
    let finish!: (receipt: Receipt | undefined) => void;
    this.ready = new Promise((resolve) => {
      finish = resolve;
    });
    const controller = new AbortController();
    let settled = false;
    const settle = (receipt: Receipt | undefined) => {
      if (settled) return;
      settled = true;
      this.excluded = !receipt;
      finish(receipt);
    };
    const timeout = globalThis.setTimeout(() => {
      settle(undefined);
      controller.abort();
    }, 30000);
    void (async () => {
      try {
        const response = await fetcher.call(
          globalThis,
          `${baseUrl}/api/v1/quality/executions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientRun, key: this.key }),
            signal: controller.signal,
          },
        );
        if (response.status !== 201 || Date.now() >= this.deadline) {
          settle(undefined);
          return;
        }
        const value: unknown = await response.json();
        settle(this.validate(value));
      } catch {
        settle(undefined);
      } finally {
        globalThis.clearTimeout(timeout);
      }
    })();
  }

  private validate(value: unknown): Receipt | undefined {
    if (!value || typeof value !== "object" || Date.now() >= this.deadline)
      return;
    const receipt = value as Partial<{
      runId: string;
      token: string;
      expiresAt: string;
    }>;
    const expiresAt =
      typeof receipt.expiresAt === "string"
        ? Date.parse(receipt.expiresAt)
        : NaN;
    if (
      typeof receipt.runId !== "string" ||
      !/^[0-9a-f]{32}$/.test(receipt.runId) ||
      typeof receipt.token !== "string" ||
      !/^[0-9a-f]{64}$/.test(receipt.token) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      return;
    return {
      runId: receipt.runId,
      token: receipt.token,
      expiresAt: Math.min(expiresAt, this.expiresAt),
    };
  }
}

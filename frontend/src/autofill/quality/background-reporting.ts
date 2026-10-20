import { PendingRegistration } from "./background-registration";
import type { QualityReport } from "./observation";

export interface QualitySource {
  url?: string;
  id?: string;
  tab?: { id?: number };
  frameId?: number;
  documentId?: string;
}
interface Receipt {
  runId: string;
  token: string;
  expiresAt: number;
}
const reasons = new Set([
  "NOT_MAPPED",
  "NOT_APPROVED",
  "PROFILE_VALUE_MISSING",
  "EXISTING_VALUE_PROTECTED",
  "UNSUPPORTED_CONTROL",
  "UNSUPPORTED_FORMAT",
  "STALE_TARGET",
  "CONFLICT",
  "EXECUTION_FAILED",
  "RETENTION_UNOBSERVED",
  "RETENTION_LOST",
  "CANCELLED",
  "UNCLASSIFIED",
]);

function validReport(value: unknown): value is QualityReport {
  if (!value || typeof value !== "object") return false;
  const report = value as QualityReport;
  if (
    !Object.keys(report).every((name) =>
      ["eventId", "snapshotId", "fields", "identities", "finished"].includes(
        name,
      ),
    ) ||
    typeof report.eventId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(report.eventId) ||
    !(
      report.snapshotId === null ||
      (typeof report.snapshotId === "string" && report.snapshotId.length <= 256)
    ) ||
    ![null, "COMPLETED", "CANCELLED"].includes(report.finished) ||
    !report.fields ||
    Array.isArray(report.fields) ||
    typeof report.fields !== "object" ||
    !report.identities ||
    Array.isArray(report.identities) ||
    typeof report.identities !== "object"
  )
    return false;
  const fields = Object.entries(report.fields);
  const identities = Object.entries(report.identities);
  return (
    (report.snapshotId !== null ||
      (fields.length === 0 && identities.length === 0)) &&
    fields.length <= 2000 &&
    identities.length <= 2000 &&
    fields.every(
      ([id, state]) =>
        id.length <= 256 &&
        state &&
        typeof state === "object" &&
        Object.keys(state).every((name) =>
          ["bound", "attempted", "written", "retained", "reason"].includes(
            name,
          ),
        ) &&
        [state.bound, state.attempted, state.written, state.retained].every(
          (value) => typeof value === "boolean",
        ) &&
        (state.reason === null || reasons.has(state.reason)),
    ) &&
    identities.every(
      ([id, reference]) =>
        id.length <= 256 &&
        typeof reference === "string" &&
        reference.length <= 2048 &&
        /^e[1-9]\d{0,7}(?:\.e[1-9]\d{0,7}){0,99}$/.test(reference),
    )
  );
}

function validPayload(value: unknown): boolean {
  if (validReport(value)) return true;
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 1 ||
    !("reports" in value)
  )
    return false;
  const reports = value.reports;
  return (
    Array.isArray(reports) &&
    reports.length > 0 &&
    reports.length <= 200 &&
    reports.every(validReport) &&
    new Set(reports.map((report) => report.eventId)).size === reports.length &&
    reports.slice(0, -1).every((report) => report.finished === null)
  );
}

export class BackgroundQualityReporting {
  private receipts: ReadonlyMap<string, Receipt> = new Map();
  private registrations = new Map<string, PendingRegistration>();
  private pendingReports = 0;
  private pendingBytes = 0;

  start(owner: string | undefined): void {
    if (!owner || !this.baseUrl) return;
    this.registrations = new Map(
      [...this.registrations].filter(([, item]) => item.expiresAt > Date.now()),
    );
    if (this.registrations.has(owner) || this.registrations.size >= 128) return;
    this.registrations.set(
      owner,
      new PendingRegistration(owner.slice(-32), this.baseUrl, this.fetcher),
    );
  }

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly extensionId?: string,
  ) {}

  owner(run: unknown, source?: QualitySource): string | undefined {
    return typeof run === "string" &&
      /^[0-9a-f]{32}$/.test(run) &&
      !!this.extensionId &&
      source?.id === this.extensionId &&
      Number.isInteger(source.tab?.id) &&
      Number.isInteger(source.frameId)
      ? `${source.tab?.id}:${source.frameId}:${source.documentId ?? "legacy"}:${run}`
      : undefined;
  }

  headers(owner: string | undefined): Record<string, string> {
    const registration = owner ? this.registrations.get(owner) : undefined;
    if (
      registration &&
      !registration.excluded &&
      Date.now() < registration.expiresAt
    )
      return {
        "X-Career-Form-Quality-Run": registration.clientRun,
        "X-Career-Form-Quality-Key": registration.key,
      };
    const receipt = owner ? this.receipts.get(owner) : undefined;
    return receipt && Date.now() < receipt.expiresAt
      ? {
          "X-Career-Form-Run": receipt.runId,
          "X-Career-Form-Report-Token": receipt.token,
        }
      : {};
  }

  capture(owner: string | undefined, response: Response): boolean {
    if (!owner) return false;
    const runId = response.headers.get("X-Career-Form-Run");
    const token = response.headers.get("X-Career-Form-Report-Token");
    if (
      !runId ||
      !/^[0-9a-f]{32}$/.test(runId) ||
      !token ||
      !/^[0-9a-f]{64}$/.test(token)
    )
      return false;
    const previous = this.receipts.get(owner);
    if (previous && previous.runId !== runId) return false;
    const live = [...this.receipts].filter(
      ([, receipt]) => Date.now() < receipt.expiresAt,
    );
    if (!previous && live.length >= 1000) return false;
    this.receipts = new Map([
      ...live.filter(([existing]) => existing !== owner),
      [
        owner,
        {
          runId,
          token,
          expiresAt: previous?.expiresAt ?? Date.now() + 86400000,
        },
      ],
    ]);
    return true;
  }

  async report(
    message: unknown,
    source?: QualitySource,
  ): Promise<{ ok: boolean } | undefined> {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== "AUTOFILL_QUALITY_REPORT"
    )
      return undefined;
    const parsed = message as { qualityRun?: unknown; payload?: unknown };
    const owner = this.owner(parsed.qualityRun, source);
    if (!owner || !validPayload(parsed.payload) || !this.baseUrl)
      return { ok: false };
    const body = JSON.stringify(parsed.payload);
    const bytes = new TextEncoder().encode(body).length;
    if (
      bytes > 128 * 1024 ||
      this.pendingReports >= 64 ||
      this.pendingBytes + bytes > 4 * 1024 * 1024
    )
      return { ok: false };
    this.pendingReports++;
    this.pendingBytes += bytes;
    try {
      const registration = this.registrations.get(owner);
      const receipt = registration
        ? await registration.ready
        : this.receipts.get(owner);
      if (!receipt || registration?.excluded || Date.now() >= receipt.expiresAt)
        return { ok: false };
      return await this.send(owner, receipt, body);
    } finally {
      this.pendingReports--;
      this.pendingBytes -= bytes;
    }
  }

  private async send(
    owner: string,
    receipt: Receipt,
    body: string,
  ): Promise<{ ok: boolean }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await this.fetcher.call(
          globalThis,
          `${this.baseUrl}/api/v1/quality/executions/${receipt.runId}/report`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${receipt.token}`,
            },
            body,
            signal: controller.signal,
          },
        );
        if (response.status === 401) {
          const registration = this.registrations.get(owner);
          if (registration) registration.excluded = true;
          this.receipts = new Map(
            [...this.receipts].filter(([existing]) => existing !== owner),
          );
        }
        return { ok: response.status === 202 || response.status === 204 };
      } catch {
        if (attempt === 1) return { ok: false };
      } finally {
        globalThis.clearTimeout(timeout);
      }
    }
    return { ok: false };
  }
}

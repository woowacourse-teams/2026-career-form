export interface InstallationCredentials {
  readonly installationId: string;
  readonly token: string;
}

interface LocalStorage {
  get(name: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

interface Options {
  readonly baseUrl: string;
  readonly storage: LocalStorage;
  readonly fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly lock?: <T>(operation: () => Promise<T>) => Promise<T>;
}

const storageName = "analysisInstallation";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class InstallationError extends Error {
  constructor(
    readonly code: string,
    readonly retryAt?: string,
  ) {
    super(code);
    this.name = "InstallationError";
  }
}

function validCredentials(value: unknown): value is InstallationCredentials {
  return (
    typeof value === "object" &&
    value !== null &&
    "installationId" in value &&
    typeof value.installationId === "string" &&
    uuid.test(value.installationId) &&
    "token" in value &&
    typeof value.token === "string" &&
    /^[0-9a-f]{64}$/.test(value.token)
  );
}

export function createInstallationClient({
  baseUrl,
  storage,
  fetcher = fetch,
  sleep = (milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  lock = (operation) => operation(),
}: Options) {
  let pending: Promise<InstallationCredentials> | undefined;
  const initialize = async (): Promise<InstallationCredentials> => {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new InstallationError("INSECURE_TRANSPORT");
    const stored = (await storage.get(storageName))[storageName];
    if (validCredentials(stored)) return stored;
    let registrationKey =
      typeof stored === "object" &&
      stored !== null &&
      "registrationKey" in stored &&
      typeof stored.registrationKey === "string" &&
      uuid.test(stored.registrationKey)
        ? stored.registrationKey
        : crypto.randomUUID();
    await storage.set({ [storageName]: { registrationKey } });
    let restarted = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetcher(
          `${baseUrl.replace(/\/+$/, "")}/api/v1/analysis-installations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: registrationKey }),
            signal: controller.signal,
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
          },
        );
        if (response.ok) {
          const credentials: unknown = await response.json();
          if (!validCredentials(credentials))
            throw new InstallationError("INVALID_RESPONSE");
          await storage.set({ [storageName]: credentials });
          return credentials;
        }
        if (response.status === 410 && !restarted) {
          restarted = true;
          registrationKey = crypto.randomUUID();
          await storage.set({ [storageName]: { registrationKey } });
          attempt--;
          continue;
        }
        const body: unknown = await response.json().catch(() => undefined);
        const code =
          typeof body === "object" &&
          body !== null &&
          "code" in body &&
          typeof body.code === "string"
            ? body.code
            : "ADMISSION_UNAVAILABLE";
        const retryAt =
          typeof body === "object" &&
          body !== null &&
          "retryAt" in body &&
          typeof body.retryAt === "string"
            ? body.retryAt
            : undefined;
        if (
          response.status === 429 ||
          (response.status < 500 && response.status !== 409)
        )
          throw new InstallationError(code, retryAt);
        if (attempt === 3) throw new InstallationError("ADMISSION_UNAVAILABLE");
      } catch (error) {
        if (error instanceof InstallationError) throw error;
        if (attempt === 3) throw new InstallationError("ADMISSION_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
      }
      await sleep(1_000 * 2 ** attempt + Math.floor(Math.random() * 200));
    }
    throw new InstallationError("ADMISSION_UNAVAILABLE");
  };
  return {
    credentials(): Promise<InstallationCredentials> {
      pending ??= lock(initialize).finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}

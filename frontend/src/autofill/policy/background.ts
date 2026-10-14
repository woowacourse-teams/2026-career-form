import { localWorkflowLog } from "../debug/local-workflow";
import { browser } from "wxt/browser";
import { validExecutionPolicy } from "../workflow/execution-policy";
export async function loadPolicyForSender(
  message: unknown,
  sender: {
    id?: string;
    url?: string;
    frameId?: number;
    documentId?: string;
    tab?: { id?: number };
  },
) {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    message.type !== "AUTOFILL_LOAD_EXECUTION_POLICY"
  )
    return undefined;
  if (
    sender.id !== browser.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.url
  )
    return { ok: false, code: "BAD_REQUEST" };
  const url = new URL(sender.url);
  const payload = "payload" in message ? message.payload : null;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !payload ||
    typeof payload !== "object" ||
    !("host" in payload) ||
    !("pathPattern" in payload) ||
    payload.host !== url.host ||
    payload.pathPattern !== url.pathname
  )
    return { ok: false, code: "BAD_REQUEST" };
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return { ok: false, code: "NOT_CONFIGURED" };
  try {
    const response = await fetch(base + "/api/v1/execution-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: url.host, pathPattern: url.pathname }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, code: "SERVER_ERROR" };
    const data = await response.json();
    if (
      !data ||
      !("executionPolicy" in data) ||
      (data.executionPolicy !== null &&
        !validExecutionPolicy(data.executionPolicy))
    )
      return { ok: false, code: "INVALID_RESPONSE" };
    localWorkflowLog("policy-loaded", {
      hasPolicy: data.executionPolicy !== null,
    });
    return { ok: true, data };
  } catch (error) {
    localWorkflowLog("policy-load-failed", {
      stage: "fetch",
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: "NETWORK" };
  }
}

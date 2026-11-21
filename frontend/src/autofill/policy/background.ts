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
  // sender.url은 문서가 처음 열린 URL이라 같은 문서 내 이동(SPA 라우팅)을 따라가지 않는다.
  // 경로는 형식만 검사하고, 요청은 host 일치로 보낸 페이지에 묶는다.
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !payload ||
    typeof payload !== "object" ||
    !("host" in payload) ||
    !("pathPattern" in payload) ||
    payload.host !== url.host ||
    typeof payload.pathPattern !== "string" ||
    !/^\/[^?#]*$/.test(payload.pathPattern)
  )
    return { ok: false, code: "BAD_REQUEST" };
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return { ok: false, code: "NOT_CONFIGURED" };
  try {
    const response = await fetch(base + "/api/v1/execution-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: url.host,
        pathPattern: payload.pathPattern,
      }),
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

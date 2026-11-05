// Tab health over raw CDP. Playwright's connectOverCDP attaches to every page
// target, so one hung renderer blocks every attached command (2026-10-22: a
// Greeting tab held the attach for the full 30s timeout). These helpers open
// one WebSocket per target instead, so a hung tab only ever costs its own
// probe, and swap it for a fresh tab at the same address without restarting
// the browser. Nothing here closes the browser or its context.
import { brief } from "./driver.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });

const listJson = async (endpoint, path, fetchImpl) => {
  const response = await fetchImpl(`${endpoint}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw coded("cdp-unreachable", "DevTools did not answer.");
  return response.json();
};

// Page targets from /json/list, raw URLs included (callers brief them before
// anything is printed or written).
export async function listPageTargets(endpoint, { fetchImpl = fetch } = {}) {
  const targets = await listJson(endpoint, "/json/list", fetchImpl);
  return (Array.isArray(targets) ? targets : [])
    .filter((t) => t?.type === "page" && t.webSocketDebuggerUrl)
    .map((t) => ({
      targetId: t.id,
      url: t.url ?? "",
      webSocketDebuggerUrl: t.webSocketDebuggerUrl,
    }));
}

// A minimal CDP session: open, one request/response pair at a time, close.
// Every wait is bounded; the socket is closed on every exit path.
function openSession(wsUrl, WebSocketImpl, timeoutMs) {
  return new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocketImpl(wsUrl);
    } catch {
      reject(coded("ws-error", "The DevTools socket could not be opened."));
      return;
    }
    const timer = setTimeout(() => {
      socket.close?.();
      reject(coded("timeout", "The DevTools socket did not open in time."));
    }, timeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(coded("ws-error", "The DevTools socket failed."));
    });
  });
}

function call(socket, id, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(coded("timeout", `${method} did not answer in time.`));
    }, timeoutMs);
    const onMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      if (message.error)
        reject(coded("cdp-error", `${method} was rejected by the browser.`));
      else resolve(message.result ?? {});
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function withSession(wsUrl, { WebSocketImpl, timeoutMs }, fn) {
  const socket = await openSession(wsUrl, WebSocketImpl, timeoutMs);
  let next = 1;
  try {
    return await fn((method, params, ms = timeoutMs) =>
      call(socket, next++, method, params, ms),
    );
  } finally {
    try {
      socket.close?.();
    } catch {
      /* Already closed. */
    }
  }
}

// Sends Runtime.evaluate(document.readyState) to every page target in
// parallel. A target that does not answer within timeoutMs is "timeout": the
// renderer is hung (or busy enough to block Playwright's attach).
export async function probeTargets(
  endpoint,
  {
    timeoutMs = 5000,
    WebSocketImpl = globalThis.WebSocket,
    fetchImpl = fetch,
  } = {},
) {
  const targets = await listPageTargets(endpoint, { fetchImpl });
  return Promise.all(
    targets.map(async (target) => {
      const started = Date.now();
      let state = "ok";
      try {
        await withSession(
          target.webSocketDebuggerUrl,
          { WebSocketImpl, timeoutMs },
          (send) =>
            send("Runtime.evaluate", {
              expression: "document.readyState",
              returnByValue: true,
            }),
        );
      } catch (error) {
        state = error?.code === "timeout" ? "timeout" : "ws-error";
      }
      return {
        targetId: target.targetId,
        url: brief(target.url),
        ms: Date.now() - started,
        ok: state === "ok",
        state,
      };
    }),
  );
}

// Opens a new tab at the hung tab's address (hash dropped) from the browser
// session, then closes the hung tab. Create comes first so the address is
// never lost. The login cookies are shared, and the browser keeps running.
export async function replaceTarget(
  endpoint,
  targetId,
  {
    timeoutMs = 15000,
    WebSocketImpl = globalThis.WebSocket,
    fetchImpl = fetch,
  } = {},
) {
  const target = (await listPageTargets(endpoint, { fetchImpl })).find(
    (t) => t.targetId === targetId,
  );
  if (!target) return { ok: false, code: "target-not-found" };
  const url = target.url.replace(/#.*$/, "");
  const { webSocketDebuggerUrl } = await listJson(
    endpoint,
    "/json/version",
    fetchImpl,
  );
  if (!webSocketDebuggerUrl) return { ok: false, code: "cdp-unreachable" };
  try {
    return await withSession(
      webSocketDebuggerUrl,
      { WebSocketImpl, timeoutMs },
      async (send) => {
        const created = await send("Target.createTarget", {
          url,
          newWindow: false,
          background: true,
        });
        const closed = await send("Target.closeTarget", { targetId });
        return {
          ok: true,
          url: brief(url),
          newTargetId: created.targetId ?? null,
          closed: closed.success === true,
        };
      },
    );
  } catch (error) {
    return {
      ok: false,
      code: error?.code === "timeout" ? "replace-timeout" : "replace-failed",
      url: brief(url),
    };
  }
}

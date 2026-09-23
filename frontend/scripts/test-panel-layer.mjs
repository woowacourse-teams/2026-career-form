import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const bundleDirectory = resolve(scriptDirectory, "../.output/chrome-mv3");
const fixturePath = join(scriptDirectory, "fixtures/panel-layer.html");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

async function chromeBinary() {
  const candidates = process.env.CHROME_BINARY
    ? [process.env.CHROME_BINARY]
    : [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try the next installed browser. */
    }
  }
  throw new Error(
    "Chrome/Chromium executable not found. Set CHROME_BINARY to its absolute path.",
  );
}

async function serve(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const path = pathname.startsWith("/bundle/")
    ? resolve(bundleDirectory, pathname.slice("/bundle/".length))
    : pathname.startsWith("/assets/")
      ? resolve(bundleDirectory, pathname.slice(1))
      : fixturePath;
  if (path !== fixturePath && !path.startsWith(`${bundleDirectory}${sep}`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}

async function poll(read, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read();
    if (value) return value;
    await delay(50);
  }
  throw new Error(message);
}

async function connect(profileDirectory) {
  const port = await poll(async () => {
    try {
      return Number(
        (
          await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")
        ).split("\n")[0],
      );
    } catch {
      return undefined;
    }
  }, "Temporary Chrome did not start its debugging endpoint.");
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(
    (response) => response.json(),
  );
  const socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 5000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { socket, send, evaluate };
}

async function click(send, point) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...point,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...point,
    button: "left",
    clickCount: 1,
  });
}

function assertStableGeometry(before, after, phase) {
  for (const key of [
    "pageX",
    "pageY",
    "mainX",
    "mainY",
    "rowTop",
    "rowHeight",
    "nextTop",
  ])
    assert.ok(
      Math.abs(after[key] - before[key]) <= 1,
      `${phase} changed ${key}: ${before[key]} → ${after[key]}`,
    );
  assert.equal(
    after.horizontalOverflow,
    false,
    `${phase} overflows the panel.`,
  );
  assert.equal(
    after.controlsFit,
    true,
    `${phase} crowds or wraps the editor controls.`,
  );
}

async function verifyInlineEditing(client, panelWidth) {
  const { send, evaluate } = client;
  await poll(
    () => evaluate('!!fixture.editButton("국문 이름")'),
    "Personal values did not load.",
  );
  await evaluate("fixture.resolveExtensionImages()");
  await poll(
    () => evaluate('fixture.panelRoot().querySelector("img").naturalWidth > 0'),
    "Panel logo did not load from the actual bundle.",
  );
  const screenshot = async (state) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      join(tmpdir(), `cf99-inline-${panelWidth}-${state}.png`),
      Buffer.from(data, "base64"),
    );
  };
  await screenshot("overview");
  await evaluate('fixture.positionField("국문 이름"); fixture.settle()');
  const before = await evaluate('fixture.geometry("국문 이름")');
  assert.ok(
    before.pageY > 0 && before.mainY > 0,
    "Fixture must exercise both scrollers.",
  );
  await screenshot("before");
  await click(
    send,
    await evaluate('fixture.center(fixture.editButton("국문 이름"))'),
  );
  await poll(
    () => evaluate("!!fixture.editor()"),
    "Inline editor did not open.",
  );
  await evaluate("fixture.settle()");
  await screenshot("edit");
  assertStableGeometry(
    before,
    await evaluate('fixture.geometry("국문 이름")'),
    "Opening editor",
  );
  await send("Input.insertText", { text: "수정 확인 " });
  await evaluate("fixture.settle()");
  assertStableGeometry(
    before,
    await evaluate('fixture.geometry("국문 이름")'),
    "Typing",
  );
  const savedValue = await evaluate(
    'fixture.editor().querySelector("input").value.trim()',
  );
  await click(
    send,
    await evaluate('fixture.center(fixture.editorAction("저장"))'),
  );
  await poll(
    () => evaluate("!fixture.editor()"),
    "Inline save did not finish.",
  );
  await evaluate("fixture.settle()");
  assertStableGeometry(
    before,
    await evaluate('fixture.geometry("국문 이름")'),
    "Saving",
  );
  assert.equal(
    await evaluate('fixture.editButton("국문 이름").textContent.trim()'),
    savedValue,
    "Inline save did not preserve the typed value.",
  );
  assert.equal(
    await evaluate(
      'fixture.panelRoot().activeElement === fixture.editButton("국문 이름")',
    ),
    true,
    "Inline save did not return keyboard focus to the edited value.",
  );
  await click(
    send,
    await evaluate('fixture.center(fixture.editButton("국문 이름"))'),
  );
  await poll(() => evaluate("!!fixture.editor()"), "Saved row did not reopen.");
  await send("Input.insertText", { text: "취소할 초안 " });
  await evaluate("fixture.settle()");
  assertStableGeometry(
    before,
    await evaluate('fixture.geometry("국문 이름")'),
    "Reopening and typing",
  );
  await click(
    send,
    await evaluate('fixture.center(fixture.editorAction("취소"))'),
  );
  await poll(
    () => evaluate("!fixture.editor()"),
    "Inline cancellation did not finish.",
  );
  await evaluate("fixture.settle()");
  assertStableGeometry(
    before,
    await evaluate('fixture.geometry("국문 이름")'),
    "Cancelling",
  );
  assert.equal(
    await evaluate('fixture.editButton("국문 이름").textContent.trim()'),
    savedValue,
    "Cancelling changed the saved value.",
  );
  assert.equal(
    await evaluate(
      'fixture.panelRoot().textContent.includes("값을 누르면 바로 수정할 수 있어요.")',
    ),
    true,
    "Personal editing instructions are not present at rest.",
  );
  const cue = await evaluate(
    'getComputedStyle(fixture.editButton("국문 이름")).borderTopWidth',
  );
  assert.ok(
    Number.parseFloat(cue) > 0,
    "Resting editable value has no visible field boundary.",
  );

  await evaluate('fixture.positionField("생년월일"); fixture.settle()');
  const dateBefore = await evaluate('fixture.geometry("생년월일")');
  await click(
    send,
    await evaluate('fixture.center(fixture.editButton("생년월일"))'),
  );
  await poll(() => evaluate("!!fixture.editor()"), "Date editor did not open.");
  await evaluate("fixture.settle()");
  assertStableGeometry(
    dateBefore,
    await evaluate('fixture.geometry("생년월일")'),
    "Opening date editor",
  );
  await click(
    send,
    await evaluate('fixture.center(fixture.editorAction("취소"))'),
  );
  await poll(
    () => evaluate("!fixture.editor()"),
    "Date cancellation did not finish.",
  );
  await evaluate("fixture.settle()");
  assertStableGeometry(
    dateBefore,
    await evaluate('fixture.geometry("생년월일")'),
    "Cancelling date editor",
  );
  console.log(
    `PASS actual bundle: ${panelWidth}px inline editing, stable document/panel scroll and row geometry`,
  );
}

async function verifyWidth(client, origin, panelWidth) {
  const { send, evaluate } = client;
  await send("Emulation.setDeviceMetricsOverride", {
    width: panelWidth + 40,
    height: 880,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: origin });
  await poll(
    () => evaluate("globalThis.fixture?.ready()"),
    "Actual content script did not initialize.",
  );
  await evaluate("fixture.open()");
  await poll(
    () => evaluate("!!fixture.closeButton()"),
    "Profile panel did not open.",
  );
  assert.equal(
    await evaluate("fixture.panelWins()"),
    true,
    "Panel is not clickable before the page layer.",
  );
  await verifyInlineEditing(client, panelWidth);
  await evaluate("fixture.addPageLayer()");
  assert.equal(
    await evaluate("fixture.panelWins()"),
    true,
    "Late animated high-z page content covers the panel.",
  );
  await click(send, { x: 8, y: 15 });
  assert.equal(
    await evaluate("fixture.outsideClicks"),
    1,
    "Panel blocks a native outside click.",
  );
  assert.equal(
    await evaluate("!!fixture.host()"),
    true,
    "Outside click dismissed the nonmodal panel.",
  );
  await click(send, await evaluate("fixture.center(fixture.closeButton())"));
  await poll(
    () => evaluate("!fixture.host()"),
    "Native close did not dismiss the panel.",
  );
  await evaluate("fixture.open()");
  await poll(
    () => evaluate("!!fixture.closeButton()"),
    "Closed panel did not reopen.",
  );
  assert.equal(
    await evaluate("fixture.panelWins()"),
    true,
    "Reopened panel lost its stacking priority.",
  );
  await evaluate("document.querySelector('#page-dialog').showModal()");
  assert.equal(
    await evaluate(
      "document.elementFromPoint(...Object.values(fixture.center(document.querySelector('#dialog-close')))).id",
    ),
    "dialog-close",
    "Panel incorrectly covers a subsequently opened site modal.",
  );
  await click(
    send,
    await evaluate("fixture.center(document.querySelector('#dialog-close'))"),
  );
  assert.equal(
    await evaluate("document.querySelector('#page-dialog').open"),
    false,
    "Native site modal close is blocked.",
  );
  assert.equal(
    await evaluate("fixture.panelWins()"),
    true,
    "Panel did not remain usable after the site modal closed.",
  );
  await click(send, await evaluate("fixture.center(fixture.closeButton())"));
  await poll(() => evaluate("!fixture.host()"), "Panel did not close.");
  await evaluate("document.querySelector('#page-dialog').showModal()");
  await evaluate("fixture.open()");
  await poll(() => evaluate("!!fixture.closeButton()"), "Panel did not mount.");
  // An inert popover can visually cover a modal while hit tests still reach
  // the hidden dialog. Check the top-layer state as well as native clicks.
  assert.equal(
    await evaluate("fixture.host().matches(':popover-open')"),
    false,
    "Panel is visually promoted over an already open site modal.",
  );
  await click(
    send,
    await evaluate("fixture.center(document.querySelector('#dialog-close'))"),
  );
  assert.equal(
    await evaluate("document.querySelector('#page-dialog').open"),
    false,
  );
  await evaluate("fixture.open()");
  assert.equal(
    await evaluate("fixture.host().matches(':popover-open')"),
    true,
    "An explicit panel request after the modal closes did not restore its layer.",
  );
  await evaluate("fixture.addPageLayer()");
  assert.equal(await evaluate("fixture.panelWins()"), true);
  assert.deepEqual(
    await evaluate("fixture.errors"),
    [],
    "Fixture raised JavaScript errors.",
  );
  console.log(
    `PASS actual bundle: ${panelWidth}px panel stacking, outside click, close/reopen, site modal`,
  );
}

await access(join(bundleDirectory, "content-scripts/autofill.js"));
const binary = await chromeBinary();
const profileDirectory = await mkdtemp(
  join(tmpdir(), "career-form-panel-layer-"),
);
const server = createServer(
  (request, response) => void serve(request, response),
);
let browser;
let client;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = spawn(
    binary,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  client = await connect(profileDirectory);
  await client.send("Page.enable");
  for (const width of [380, 320])
    await verifyWidth(
      client,
      `http://127.0.0.1:${server.address().port}`,
      width,
    );
} finally {
  client?.socket.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => browser.once("exit", resolve)),
      delay(1500),
    ]);
    if (browser.exitCode === null && browser.signalCode === null) {
      browser.kill("SIGKILL");
      await new Promise((resolve) => browser.once("exit", resolve));
    }
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(profileDirectory, { recursive: true, force: true });
}

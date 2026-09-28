import { mockGreetingEditingCommand } from "./test-utils/greeting-email-editing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
let restoreEditingCommand: (() => void) | undefined;
beforeEach(() => {
  restoreEditingCommand = mockGreetingEditingCommand(document);
});
afterEach(() => restoreEditingCommand?.());

import {
  commitGreetingEmailInput,
  closeGreetingEmailPopup,
  waitForGreetingEmailAcceptance,
  installGreetingEmailCloseBridge,
} from "./greeting-email-close-bridge";

const requestEvent = "career-form:greeting-email-close-request";
const ackEvent = "career-form:greeting-email-close-ack";
const marker = "data-career-form-greeting-email-close";
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function fixture() {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이메일주소*</label><input type="email" role="combobox" data-scope="combobox" data-part="input" aria-expanded="true" aria-controls="email-popup"><button type="button">이메일 확인</button></div><div data-scope="scroll-area" data-part="root"><div id="email-popup" data-scope="scroll-area" data-part="viewport" role="presentation"></div></div>`;
  const input = document.querySelector("input")!;
  input.value = "example@example.test";
  return input;
}

it("dismisses an accepted email popup whose outside-pointer handler settles later", async () => {
  vi.useFakeTimers();
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  input.focus();
  let popupReady = false;
  // Live Aside succeeded when close was held 150ms after acceptance. This
  // models that observed settling interval, not a guaranteed site threshold.
  setTimeout(() => {
    popupReady = true;
  }, 150);
  const outsidePointer = () => {
    if (popupReady && document.activeElement !== input)
      input.setAttribute("aria-expanded", "false");
  };
  document.body.addEventListener("pointerdown", outsidePointer);
  try {
    const result = closeGreetingEmailPopup(input, () => true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(true);
    expect(input.value).toBe("example@example.test");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  } finally {
    document.body.removeEventListener("pointerdown", outsidePointer);
  }
});

it.each(["url", "value", "controls", "marker", "replacement"])(
  "abandons popup settling without a pointer when the approved target changes: %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    input.focus();
    const originalUrl = document.URL;
    const outsidePointer = vi.fn();
    document.body.addEventListener("pointerdown", outsidePointer);
    setTimeout(() => {
      if (change === "url") history.replaceState(null, "", "#settling-changed");
      if (change === "value") input.value = "changed@example.test";
      if (change === "controls") input.setAttribute("aria-controls", "other");
      if (change === "marker") input.removeAttribute(marker);
      if (change === "replacement") input.replaceWith(input.cloneNode(true));
    }, 75);
    try {
      const result = closeGreetingEmailPopup(input, () => true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await result).toBe(false);
      expect(outsidePointer).not.toHaveBeenCalled();
      expect(input.hasAttribute(marker)).toBe(false);
    } finally {
      document.body.removeEventListener("pointerdown", outsidePointer);
      history.replaceState(null, "", originalUrl);
    }
  },
);

it.each(["outside-pointer", "blur"])(
  "dismisses an accepted focused email popup through %s without confirming the email",
  async (dismissal) => {
    vi.useFakeTimers();
    const input = fixture();
    const button = input.parentElement!.querySelector("button")!;
    const confirmed = vi.spyOn(button, "click");
    installGreetingEmailCloseBridge(document);
    input.focus();
    let blurSettled = false;
    input.addEventListener("blur", () => {
      setTimeout(() => {
        blurSettled = true;
      }, 0);
    });
    if (dismissal === "blur") {
      input.addEventListener("blur", () =>
        input.setAttribute("aria-expanded", "false"),
      );
    }
    // Live Aside requires a new task after blur before outside-pointer dismissal.
    const outsidePointer = () => {
      if (blurSettled && document.activeElement !== input)
        input.setAttribute("aria-expanded", "false");
    };
    document.body.addEventListener("pointerdown", outsidePointer);
    try {
      const result = closeGreetingEmailPopup(input, () => true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await result).toBe(true);
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(input.value).toBe("example@example.test");
      expect(confirmed).not.toHaveBeenCalled();
      expect(input.hasAttribute(marker)).toBe(false);
    } finally {
      document.body.removeEventListener("pointerdown", outsidePointer);
    }
  },
);

it.each(["marker", "value", "replacement"])(
  "cancels deferred dismissal when the approved target changes after blur: %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    input.focus();
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (change === "marker") input.removeAttribute(marker);
        if (change === "value") input.value = "changed@example.test";
        if (change === "replacement") input.replaceWith(input.cloneNode(true));
      }, 0);
    });
    const outsidePointer = vi.fn();
    document.body.addEventListener("pointerdown", outsidePointer);
    try {
      const result = closeGreetingEmailPopup(input, () => true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await result).toBe(false);
      expect(outsidePointer).not.toHaveBeenCalled();
      expect(input.hasAttribute(marker)).toBe(false);
    } finally {
      document.body.removeEventListener("pointerdown", outsidePointer);
    }
  },
);

it.each(["value", "controls", "replacement", "label", "url"])(
  "stops dismissal when blur changes the approved email target: %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    input.focus();
    const originalUrl = document.URL;
    let blurred = false;
    input.addEventListener("blur", () => {
      blurred = true;
      if (change === "value") input.value = "changed@example.test";
      if (change === "controls") input.setAttribute("aria-controls", "other");
      if (change === "replacement") input.replaceWith(input.cloneNode(true));
      if (change === "label")
        input.parentElement!.querySelector("label")!.textContent = "Other";
      if (change === "url") history.replaceState(null, "", "#changed-email");
    });
    const outsidePointer = vi.fn(() =>
      input.setAttribute("aria-expanded", "false"),
    );
    document.body.addEventListener("pointerdown", outsidePointer);
    try {
      const result = closeGreetingEmailPopup(input, () => true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await result).toBe(false);
      expect(blurred).toBe(true);
      expect(outsidePointer).not.toHaveBeenCalled();
      expect(input.hasAttribute(marker)).toBe(false);
    } finally {
      document.body.removeEventListener("pointerdown", outsidePointer);
      history.replaceState(null, "", originalUrl);
    }
  },
);

it("waits for the MAIN outside-pointer close and sends no field values", async () => {
  vi.useFakeTimers();
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  let request: unknown;
  const record = (event: Event) => {
    request = JSON.parse((event as CustomEvent<string>).detail);
  };
  document.addEventListener(requestEvent, record);
  document.body.addEventListener(
    "pointerdown",
    () => {
      setTimeout(() => input.setAttribute("aria-expanded", "false"), 50);
    },
    { once: true },
  );
  try {
    const result = closeGreetingEmailPopup(input, () => true);
    await vi.advanceTimersByTimeAsync(250);
    expect(await result).toBe(true);
    expect(request).toEqual({ nonce: expect.any(String) });
    expect(input.value).toBe("example@example.test");
    expect(input.hasAttribute(marker)).toBe(false);
  } finally {
    document.removeEventListener(requestEvent, record);
  }
});

it.each(["label", "duplicate", "popup", "disabled", "context"])(
  "does not dismiss an unverified email target: %s",
  (change) => {
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    if (change === "label")
      document.querySelector("label")!.textContent = "다른 필드";
    if (change === "duplicate")
      input.parentElement!.after(input.parentElement!.cloneNode(true));
    if (change === "popup")
      document
        .querySelector("[role='presentation']")!
        .setAttribute("data-scope", "other");
    if (change === "disabled") input.disabled = true;
    let dispatched = false;
    document.body.addEventListener(
      "pointerdown",
      () => {
        dispatched = true;
      },
      { once: true },
    );
    return closeGreetingEmailPopup(input, () => change !== "context").then(
      (result) => {
        expect(result).toBe(false);
        expect(dispatched).toBe(false);
        expect(input.getAttribute("aria-expanded")).toBe("true");
      },
    );
  },
);

it("fails closed when the MAIN listener does not acknowledge", async () => {
  vi.useFakeTimers();
  // Use the main document's DOM but intercept requests to simulate a missing MAIN script.
  const input = fixture();
  const stop = (event: Event) => event.stopImmediatePropagation();
  document.addEventListener(requestEvent, stop, true);
  try {
    const result = closeGreetingEmailPopup(input, () => true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBe(false);
    expect(input.hasAttribute(marker)).toBe(false);
  } finally {
    document.removeEventListener(requestEvent, stop, true);
  }
});

it("rejects a forged success acknowledgement when the popup remains expanded", async () => {
  const input = fixture();
  const forge = (event: Event) => {
    event.stopImmediatePropagation();
    const request = JSON.parse((event as CustomEvent<string>).detail);
    document.dispatchEvent(
      new CustomEvent(ackEvent, {
        detail: JSON.stringify({ nonce: request.nonce, ok: true }),
      }),
    );
  };
  document.addEventListener(requestEvent, forge, true);
  try {
    expect(await closeGreetingEmailPopup(input, () => true)).toBe(false);
  } finally {
    document.removeEventListener(requestEvent, forge, true);
  }
});

it.each(["value", "context", "replacement"])(
  "rejects a close acknowledgement when the approved target changed: %s",
  async (change) => {
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    let current = true;
    document.body.addEventListener(
      "pointerdown",
      () => {
        input.setAttribute("aria-expanded", "false");
        if (change === "value") input.value = "changed@example.test";
        if (change === "context") current = false;
        if (change === "replacement") input.replaceWith(input.cloneNode(true));
      },
      { once: true },
    );
    expect(await closeGreetingEmailPopup(input, () => current)).toBe(false);
    expect(input.hasAttribute(marker)).toBe(false);
  },
);

it("does not execute MAIN requests with field data or replay a consumed nonce", async () => {
  vi.useFakeTimers();
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  const nonce = crypto.randomUUID();
  input.setAttribute(marker, nonce);
  let pointers = 0;
  document.body.addEventListener("pointerdown", () => {
    pointers++;
    input.setAttribute("aria-expanded", "false");
  });
  const send = (detail: object) =>
    document.dispatchEvent(
      new CustomEvent(requestEvent, { detail: JSON.stringify(detail) }),
    );
  send({ nonce, value: "never-accept@example.test" });
  await vi.advanceTimersByTimeAsync(1);
  expect(pointers).toBe(0);
  send({ nonce });
  await vi.advanceTimersByTimeAsync(1);
  expect(pointers).toBe(1);
  input.setAttribute("aria-expanded", "true");
  send({ nonce });
  await vi.advanceTimersByTimeAsync(1);
  expect(pointers).toBe(1);
  expect(input.value).toBe("example@example.test");
});

it("activates only the marked email in MAIN without transmitting its value", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  let activated = false;
  let payload: unknown;
  input.addEventListener("click", () => {
    activated = true;
  });
  const record = (event: Event) => {
    payload = JSON.parse((event as CustomEvent<string>).detail);
  };
  document.addEventListener(
    "career-form:greeting-email-commit-request",
    record,
  );
  try {
    expect(commitGreetingEmailInput(input, () => true)).toBe(true);
    expect(activated).toBe(true);
    expect(payload).toEqual({ nonce: expect.any(String) });
    expect(input.value).toBe("example@example.test");
    expect(input.hasAttribute(marker)).toBe(false);
  } finally {
    document.removeEventListener(
      "career-form:greeting-email-commit-request",
      record,
    );
  }
});

it("fails activation immediately without a synchronous MAIN acknowledgement", () => {
  const input = fixture();
  const stop = (event: Event) => event.stopImmediatePropagation();
  document.addEventListener(
    "career-form:greeting-email-commit-request",
    stop,
    true,
  );
  try {
    expect(commitGreetingEmailInput(input, () => true)).toBe(false);
  } finally {
    document.removeEventListener(
      "career-form:greeting-email-commit-request",
      stop,
      true,
    );
  }
  expect(input.hasAttribute(marker)).toBe(false);
});

it("rejects a target changed by MAIN click before an isolated writer can use it", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  input.addEventListener("click", () => {
    input.readOnly = true;
  });
  expect(commitGreetingEmailInput(input, () => true)).toBe(false);
  expect(input.value).toBe("");
});

it("commits only the existing email DOM value through MAIN events with a nonce-only request", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  input.focus();
  const events: string[] = [];
  let payload: unknown;
  input.addEventListener("input", () => events.push("input"));
  input.addEventListener("change", () => events.push("change"));
  input.addEventListener("blur", () => events.push("blur"));
  const record = (event: Event) => {
    payload = JSON.parse((event as CustomEvent<string>).detail);
  };
  document.addEventListener(
    "career-form:greeting-email-commit-request",
    record,
  );
  try {
    expect(commitGreetingEmailInput(input, () => true)).toBe(true);
    expect(events).toEqual(["input"]);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("example@example.test");
    expect(payload).toEqual({ nonce: expect.any(String) });
    expect(input.hasAttribute(marker)).toBe(false);
  } finally {
    document.removeEventListener(
      "career-form:greeting-email-commit-request",
      record,
    );
  }
});

it("rejects MAIN commit when its input handler replaces the approved target", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  input.addEventListener("input", () =>
    input.replaceWith(input.cloneNode(true)),
  );
  expect(commitGreetingEmailInput(input, () => true)).toBe(false);
});

it("waits for the owned email confirmation button beyond 500ms without closing the popup", async () => {
  vi.useFakeTimers();
  const input = fixture();
  const button = input.parentElement!.querySelector("button")!;
  button.disabled = true;
  let completed = false;
  const pending = waitForGreetingEmailAcceptance(input, () => true).then(
    (ok) => {
      completed = true;
      return ok;
    },
  );
  await vi.advanceTimersByTimeAsync(900);
  expect(completed).toBe(false);
  button.disabled = false;
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe(true);
  expect(input.getAttribute("aria-expanded")).toBe("true");
});

it("times out without accepting a permanently disabled confirmation button", async () => {
  vi.useFakeTimers();
  const input = fixture();
  input.parentElement!.querySelector("button")!.disabled = true;
  const pending = waitForGreetingEmailAcceptance(input, () => true);
  await vi.advanceTimersByTimeAsync(3100);
  expect(await pending).toBe(false);
  expect(input.getAttribute("aria-expanded")).toBe("true");
});

it.each(["duplicate", "wrong-label", "wrong-type", "outside-field"])(
  "rejects an ambiguous or unrelated confirmation button: %s",
  async (change) => {
    const input = fixture();
    const button = input.parentElement!.querySelector("button")!;
    if (change === "duplicate") button.after(button.cloneNode(true));
    if (change === "wrong-label") button.textContent = "확인";
    if (change === "wrong-type") button.type = "submit";
    if (change === "outside-field") document.body.append(button);
    expect(await waitForGreetingEmailAcceptance(input, () => true)).toBe(false);
  },
);

it.each(["value", "context", "replacement"])(
  "abandons waiting when acceptance identity changes: %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    const button = input.parentElement!.querySelector("button")!;
    button.disabled = true;
    let current = true;
    const pending = waitForGreetingEmailAcceptance(input, () => current);
    if (change === "value") input.value = "changed@example.test";
    if (change === "context") current = false;
    if (change === "replacement") button.replaceWith(button.cloneNode(true));
    button.disabled = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toBe(false);
  },
);

it("fails closed when the browser insertText command refuses the edit", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  document.execCommand = () => false;
  expect(commitGreetingEmailInput(input, () => true)).toBe(false);
  expect(input.value).toBe("");
});

it("does not edit a different element focused by the email click handler", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  const other = document.createElement("input");
  document.body.append(other);
  input.addEventListener("click", () => other.focus());
  expect(commitGreetingEmailInput(input, () => true)).toBe(false);
  expect(other.value).toBe("");
});

it("requires exact value readback even when insertText reports success", () => {
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  document.execCommand = () => {
    input.value = "truncated";
    return true;
  };
  expect(commitGreetingEmailInput(input, () => true)).toBe(false);
});

it("observes an enabled confirmation button hidden only from accessibility by its exact open popup", async () => {
  vi.useFakeTimers();
  const input = fixture();
  const button = input.parentElement!.querySelector("button")!;
  button.setAttribute("aria-hidden", "true");
  const clicked = vi.spyOn(button, "click");
  installGreetingEmailCloseBridge(document);
  const accepted = waitForGreetingEmailAcceptance(input, () => true);
  await vi.advanceTimersByTimeAsync(3100);
  expect(await accepted).toBe(true);
  document.body.addEventListener(
    "pointerdown",
    () => {
      input.setAttribute("aria-expanded", "false");
      button.removeAttribute("aria-hidden");
    },
    { once: true },
  );
  const closed = closeGreetingEmailPopup(input, () => true);
  await vi.advanceTimersByTimeAsync(200);
  expect(await closed).toBe(true);
  expect(clicked).not.toHaveBeenCalled();
  expect(input.value).toBe("example@example.test");
  expect(button.disabled).toBe(false);
});

it.each(["hidden", "inert", "aria-ancestor", "closed", "wrong-popup"])(
  "does not relax confirmation visibility for %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    const button = input.parentElement!.querySelector("button")!;
    button.setAttribute("aria-hidden", "true");
    if (change === "hidden" || change === "inert")
      button.setAttribute(change, "");
    if (change === "aria-ancestor") {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("aria-hidden", "true");
      button.replaceWith(wrapper);
      wrapper.append(button);
    }
    if (change === "closed") input.setAttribute("aria-expanded", "false");
    if (change === "wrong-popup")
      document
        .getElementById("email-popup")!
        .setAttribute("data-part", "other");
    const accepted = waitForGreetingEmailAcceptance(input, () => true);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await accepted).toBe(false);
    expect(await closeGreetingEmailPopup(input, () => true)).toBe(false);
  },
);

it("accepts a safely retained popup that closes during the dismissal settling interval", async () => {
  vi.useFakeTimers();
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  const requests = vi.fn();
  document.addEventListener(requestEvent, requests);
  try {
    const result = closeGreetingEmailPopup(input, () => true);
    setTimeout(() => {
      input.setAttribute("aria-expanded", "false");
      document.getElementById("email-popup")?.remove();
    }, 50);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(true);
    expect(requests).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener(requestEvent, requests);
  }
});

it("closes an exact empty hidden Greeting email popup with Escape without confirming", async () => {
  vi.useFakeTimers();
  const input = fixture();
  installGreetingEmailCloseBridge(document);
  input.focus();
  const popup = document.getElementById("email-popup")!;
  popup.setAttribute("data-empty", "");
  popup.setAttribute("data-state", "open");
  popup.style.display = "none";
  const confirmation = input.parentElement!.querySelector("button")!;
  confirmation.setAttribute("aria-hidden", "true");
  const confirmClick = vi.spyOn(confirmation, "click");
  const outside = vi.fn();
  document.body.addEventListener("pointerdown", outside);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.setAttribute("aria-expanded", "false");
      confirmation.removeAttribute("aria-hidden");
    }
  });
  try {
    const result = closeGreetingEmailPopup(input, () => true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    expect(confirmClick).not.toHaveBeenCalled();
    expect(input.value).toBe("example@example.test");
  } finally {
    document.body.removeEventListener("pointerdown", outside);
  }
});

it.each(["value", "controls", "replacement"])(
  "rejects changed email identity after empty-popup Escape: %s",
  async (change) => {
    vi.useFakeTimers();
    const input = fixture();
    installGreetingEmailCloseBridge(document);
    const popup = document.getElementById("email-popup")!;
    popup.setAttribute("data-empty", "");
    popup.style.display = "none";
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      input.setAttribute("aria-expanded", "false");
      if (change === "value") input.value = "changed@example.test";
      if (change === "controls") input.setAttribute("aria-controls", "other");
      if (change === "replacement") input.replaceWith(input.cloneNode(true));
    });
    const result = closeGreetingEmailPopup(input, () => true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(false);
  },
);

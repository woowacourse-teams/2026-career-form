import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  HANDOFF_MESSAGE,
  copyLink,
  handoffUrl,
  sendToPc,
  type HandoffResult,
} from "./handoff";
import brand from "./brand.module.css";
import styles from "./SendToPc.module.css";

const TOAST_MS = 4000;

/**
 * Shares (or, with `copy`, copies) the landing link so a phone visitor can
 * pick it up on a PC. The result shows as a toast on the page body, outside
 * the pinned scenes whose transforms would trap a fixed element.
 */
export function SendToPc({
  className = brand.primary,
  copy = false,
  children = "공유하기",
}: {
  className?: string;
  copy?: boolean;
  children?: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (result: HandoffResult) => {
    clearTimeout(timer.current);
    setMessage(HANDOFF_MESSAGE[result]);
    timer.current = setTimeout(() => setMessage(""), TOAST_MS);
  };
  const send = async () => {
    const url = handoffUrl(window.location);
    show(await (copy ? copyLink(url, navigator) : sendToPc(url, navigator)));
  };
  return (
    <>
      <button type="button" className={className} onClick={send}>
        {children}
      </button>
      {createPortal(
        <p className={styles.toast} role="status" hidden={!message}>
          {message}
        </p>,
        document.body,
      )}
    </>
  );
}

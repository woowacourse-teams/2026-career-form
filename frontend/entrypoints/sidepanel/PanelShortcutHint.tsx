import { useEffect, useState } from "react";

import styles from "./App.module.css";

interface PanelShortcutHintProps {
  /** Resolves the assigned key, "" when none is assigned, undefined when unknown. */
  read: () => Promise<string | undefined>;
}

/** One line under the brand telling how to open and close this panel from the keyboard. */
export function PanelShortcutHint({ read }: PanelShortcutHintProps) {
  const [shortcut, setShortcut] = useState<string>();

  useEffect(() => {
    let active = true;
    read()
      .then((value) => {
        if (active) setShortcut(typeof value === "string" ? value : undefined);
      })
      .catch(() => {
        // An unreadable shortcut only hides the hint.
      });
    return () => {
      active = false;
    };
  }, [read]);

  if (shortcut === undefined) return null;
  return (
    <p className={styles.shortcutHint}>
      {shortcut ? (
        <>
          <kbd>{shortcut}</kbd>로 이 패널을 열고 닫을 수 있어요
        </>
      ) : (
        // Content scripts cannot open chrome:// pages, so the address is text.
        "패널을 여는 단축키가 없어요. chrome://extensions/shortcuts에서 지정할 수 있어요"
      )}
    </p>
  );
}

import { useEffect, useRef, useState } from "react";

import styles from "./App.module.css";
import { PanelShortcutHint } from "./PanelShortcutHint";

interface PanelSettingsMenuProps {
  /** Absent when the current page has nothing to import from. */
  onImport?: () => void;
  onManageProfile: () => void;
  readPanelShortcut?: () => Promise<string | undefined>;
}

/** Disclosure menu: it holds a text hint, so plain buttons fit better than role=menu. */
export function PanelSettingsMenu({
  onImport,
  onManageProfile,
  readPanelShortcut,
}: PanelSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const run = (action: () => void) => {
    close();
    action();
  };

  useEffect(() => {
    const element = root.current;
    if (!open || !element) return;
    // composedPath still sees inside the panel's open shadow root from the page.
    const onPointerDown = (event: Event) => {
      if (event.composedPath().includes(element)) return;
      setOpen(false);
      trigger.current?.focus();
    };
    const page = element.ownerDocument;
    page.addEventListener("pointerdown", onPointerDown, true);
    return () => page.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return (
    <div
      ref={root}
      className={styles.settings}
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className={styles.settingsButton}
        data-panel-settings
        type="button"
        aria-label="설정"
        aria-expanded={open}
        aria-controls="panel-settings-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && (
        <div id="panel-settings-menu" className={styles.settingsMenu}>
          {onImport && (
            <button
              className={styles.settingsItem}
              type="button"
              onClick={() => run(onImport)}
            >
              프로필 가져오기
            </button>
          )}
          <button
            className={styles.settingsItem}
            data-profile-management
            type="button"
            onClick={() => run(onManageProfile)}
          >
            프로필 관리
          </button>
          {readPanelShortcut && <PanelShortcutHint read={readPanelShortcut} />}
        </div>
      )}
    </div>
  );
}

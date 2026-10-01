export type ProfilePanelMode = "profile" | "autofill";

export interface ProfilePanelController {
  getSnapshot(): ProfilePanelMode;
  subscribe(listener: () => void): () => void;
  startAutofill(): void;
  showProfile(): void;
}

export function createProfilePanelController(): ProfilePanelController {
  let mode: ProfilePanelMode = "profile";
  const listeners = new Set<() => void>();
  const setMode = (next: ProfilePanelMode) => {
    if (mode === next) return;
    mode = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => mode,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startAutofill: () => setMode("autofill"),
    showProfile: () => setMode("profile"),
  };
}

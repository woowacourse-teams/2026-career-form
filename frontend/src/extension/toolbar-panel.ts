interface ToolbarNavigation {
  openPanel(tabId: number): Promise<void>;
  openGuide(): Promise<unknown>;
}
export async function openToolbarPanel(
  tab: { id?: number; url?: string },
  navigation: ToolbarNavigation,
): Promise<void> {
  if (tab.id !== undefined && /^https?:\/\//.test(tab.url ?? "")) {
    try {
      await navigation.openPanel(tab.id);
      return;
    } catch {
      /* Restricted web pages cannot accept content scripts. */
    }
  }
  await navigation.openGuide();
}

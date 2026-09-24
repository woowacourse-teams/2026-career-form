export async function openInstalledOnboarding(
  reason: string,
  open: () => Promise<unknown>,
): Promise<void> {
  if (reason === "install") await open();
}

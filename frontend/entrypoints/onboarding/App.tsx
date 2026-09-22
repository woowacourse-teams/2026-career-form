import { SiteApp } from "../../site/SiteApp";

export function App({
  openOptions,
  close = () => window.close(),
}: {
  openOptions(): Promise<void> | void;
  close?(): void;
}) {
  return <SiteApp path="/onboarding/" installation={{ openOptions, close }} />;
}

import type { ReactNode } from "react";
import { ReviewPreview } from "./ReviewPreview";
import { App } from "../../entrypoints/sidepanel/App";
import logo from "../../public/side-panel-launcher-logo.png";
import { createDemoRepository } from "./fixtures";
import styles from "./Simulation.module.css";
export const demoRepository = createDemoRepository();
const noop = () => {};
export function PanelPreview({
  onAutofill = async () => {},
  autofillView,
  onReturn = noop,
}: {
  onAutofill?: () => Promise<void>;
  autofillView?: ReactNode;
  onReturn?: () => void;
}) {
  return (
    <div className={styles.nativePanel} data-demo-panel>
      <App
        autofillView={autofillView}
        returnToProfile={onReturn}
        inPage
        repository={demoRepository}
        logoUrl={logo}
        copyText={async () => {}}
        closePanel={noop}
        openOptions={noop}
        openAutofill={onAutofill}
      />
    </div>
  );
}
export function PanelGuide({
  kind,
}: {
  kind: "profile" | "autofill" | "results";
}) {
  if (kind === "results") return <ReviewPreview />;
  return (
    <div
      className={`${styles.guide} ${kind === "profile" ? styles.guideProfile : styles.guideAutofill}`}
    >
      <PanelPreview />
    </div>
  );
}

import type { ProfileRepository } from "../../src/profile/profile-repository";
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
  onClose = noop,
  repository = demoRepository,
  showPostings = true,
}: {
  onAutofill?: () => Promise<void>;
  autofillView?: ReactNode;
  onReturn?: () => void;
  onClose?: () => void;
  repository?: ProfileRepository;
  showPostings?: boolean;
}) {
  return (
    <div className={styles.nativePanel} data-demo-panel>
      <App
        track={noop}
        showPostings={showPostings}
        autofillView={autofillView}
        returnToProfile={onReturn}
        inPage
        repository={repository}
        logoUrl={logo}
        copyText={async () => {}}
        closePanel={onClose}
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
      <PanelPreview showPostings={false} />
    </div>
  );
}

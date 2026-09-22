import { App } from "../../entrypoints/sidepanel/App";
import logo from "../../public/side-panel-launcher-logo.png";
import { createDemoRepository } from "./fixtures";
import styles from "./Simulation.module.css";
export const demoRepository = createDemoRepository();
const noop = () => {};
export function PanelPreview({
  onAutofill = async () => {},
}: {
  onAutofill?: () => Promise<void>;
}) {
  return (
    <div className={styles.nativePanel} data-demo-panel>
      <App
        actionPosition="bottom"
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
export function PanelGuide({ kind }: { kind: "profile" | "autofill" }) {
  return (
    <div
      className={`${styles.guide} ${kind === "profile" ? styles.guideProfile : styles.guideAutofill}`}
    >
      <PanelPreview />
    </div>
  );
}

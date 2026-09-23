import type { ReactNode } from "react";
import { WorkflowResults } from "../../src/autofill/workflow/WorkflowResults";
import type { ReviewPlanItem } from "../../src/autofill/review/review-plan";
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
const resultItems: ReviewPlanItem[] = [
  [
    "demo-address",
    "기본주소",
    "contact.contact.addressLine1",
    "예시시 가상로 100",
  ],
  ["demo-major", "주전공명", "education.university.majorName", "컴퓨터공학"],
].map(([candidateId, fieldLabel, profileFieldKey, value]) => ({
  candidateId,
  fieldLabel,
  profileFieldKey,
  currentValue: "",
  profileValue: value,
  previewValue: value,
  status: "unavailable",
  selected: false,
  disabled: true,
  revealed: true,
  reason: "직접 확인 필요",
}));

export function ResultPreview() {
  return (
    <div className={styles.resultPreview}>
      <WorkflowResults
        reviewItems={resultItems}
        results={resultItems.map((item, index) => ({
          candidateId: item.candidateId,
          status: "skipped",
          reason: "직접 확인 필요",
          failureCode: index === 0 ? "FIELD_READONLY" : "SEARCH_NO_RESULTS",
        }))}
        progress={[
          {
            id: "demo-name",
            label: "이름",
            category: "기본 인적사항",
            status: "written",
          },
          {
            id: "demo-email",
            label: "이메일",
            category: "연락처와 주소",
            status: "written",
          },
        ]}
        onLocate={() => true}
        copyText={async () => {}}
      />
    </div>
  );
}
export function PanelGuide({
  kind,
}: {
  kind: "profile" | "autofill" | "results";
}) {
  return (
    <div
      className={`${styles.guide} ${kind === "profile" ? styles.guideProfile : kind === "results" ? "" : styles.guideAutofill}`}
    >
      <PanelPreview
        autofillView={kind === "results" ? <ResultPreview /> : undefined}
      />
    </div>
  );
}

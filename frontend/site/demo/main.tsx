import { createRoot } from "react-dom/client";
import "../../src/styles/global.css";
import { Simulation } from "./Simulation";
import { PanelGuide } from "./PanelPreview";
const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  view === "guide-profile" ||
    view === "guide-autofill" ||
    view === "guide-results" ? (
    <PanelGuide
      kind={
        view === "guide-profile"
          ? "profile"
          : view === "guide-results"
            ? "results"
            : "autofill"
      }
    />
  ) : (
    <Simulation />
  ),
);

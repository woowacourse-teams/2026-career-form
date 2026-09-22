import { createRoot } from "react-dom/client";
import { PanelGuide } from "../../site/demo/PanelPreview";
import { Simulation } from "../../site/demo/Simulation";
import "../../src/styles/global.css";

const view = new URLSearchParams(window.location.search).get("view");
createRoot(document.getElementById("root")!).render(
  view === "guide-profile" || view === "guide-autofill" ? (
    <PanelGuide kind={view === "guide-profile" ? "profile" : "autofill"} />
  ) : (
    <Simulation />
  ),
);

import { createRoot } from "react-dom/client";
import { PanelGuide } from "../../site/demo/PanelPreview";
import "../../src/styles/global.css";

const kind =
  new URLSearchParams(window.location.search).get("kind") === "autofill"
    ? "autofill"
    : "profile";
createRoot(document.getElementById("root")!).render(<PanelGuide kind={kind} />);

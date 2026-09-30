import { createRoot } from "react-dom/client";
import "../../src/styles/global.css";
import { Experiment } from "./Experiment";
import { CandidateGallery } from "./CandidateGallery";
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(window.location.search).get("view") === "candidates" ? (
    <CandidateGallery />
  ) : (
    <Experiment />
  ),
);

import { createRoot } from "react-dom/client";
import "../../src/styles/global.css";
import { Experiment } from "./Experiment";
createRoot(document.getElementById("root")!).render(<Experiment />);

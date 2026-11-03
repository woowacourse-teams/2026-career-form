import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../src/styles/global.css";
import "../../src/styles/extension-theme.css";

createRoot(document.getElementById("root")!).render(<App />);

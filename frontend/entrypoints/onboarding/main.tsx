import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { App } from "./App";
import "../../src/styles/global.css";
createRoot(document.getElementById("root")!).render(
  <App openOptions={() => browser.runtime.openOptionsPage()} />,
);

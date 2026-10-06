import React from "react";
import ReactDOM from "react-dom/client";

import "../../src/styles/global.css";
import { ManagementApp } from "./ManagementApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ManagementApp />
  </React.StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./refinements.css";
import "./desktop.css";
import "./documents.css";
import "./ergonomics.css";
import "./quick-actions.css";
import "./motion.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

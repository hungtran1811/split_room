import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/auth.css";
import "./styles/pages.css";
import { App } from "./app/App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Không tìm thấy #root để mount ứng dụng.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

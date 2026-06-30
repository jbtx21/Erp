import "@mantine/core/styles.css";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { App } from "./App.js";
import { mantineTheme } from "./theme.js";
import { ToastProvider } from "./ui-kit.js";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={mantineTheme}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MantineProvider>
  </React.StrictMode>
);

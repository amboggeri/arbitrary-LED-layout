import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { demoProject } from "@ledlay/editor";
import { App } from "./App";
import { RuntimeProvider } from "./runtime/context";
import { StudioRuntime } from "./runtime/runtime";
import { loadAutosave } from "./state/persistence";
import { studio } from "./state/store";
import "./styles.css";

const params = new URLSearchParams(location.search);
const initial = params.has("demo") ? demoProject() : params.has("fresh") ? null : loadAutosave();
studio.getState().loadProject(initial ?? demoProject());
if (params.get("bridge")) studio.getState().setBridge({ url: params.get("bridge")! });

const runtime = new StudioRuntime(studio);
runtime.start();
(window as unknown as { __ledlay?: unknown }).__ledlay = { studio, runtime };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RuntimeProvider runtime={runtime}>
      <App />
    </RuntimeProvider>
  </StrictMode>,
);

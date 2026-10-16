import { createContext, useContext, type ReactNode } from "react";
import type { StudioRuntime } from "./runtime";

const RuntimeContext = createContext<StudioRuntime | null>(null);

export function RuntimeProvider({ runtime, children }: { runtime: StudioRuntime; children: ReactNode }) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): StudioRuntime {
  const r = useContext(RuntimeContext);
  if (!r) throw new Error("useRuntime must be used inside <RuntimeProvider>");
  return r;
}

/** Scan the LAN (via the bridge's mDNS) for WLED devices and add them as controllers. */
import { useState } from "react";
import type { DiscoveredDevice } from "@ledlay/link";
import { useRuntime } from "../runtime/context";
import { addDiscoveredController } from "../state/actions";
import { studio, useStudio } from "../state/store";

export function DiscoverButton() {
  const runtime = useRuntime();
  const status = useStudio((s) => s.bridge.status);
  const controllers = useStudio((s) => s.project.controllers);
  const hosts = new Set(controllers.map((c) => c.host));
  const [devices, setDevices] = useState<DiscoveredDevice[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    try {
      setDevices(await runtime.rpc<DiscoveredDevice[]>("discover", { timeoutMs: 2500 }));
    } catch (e) {
      studio.getState().notify("error", `Scan failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="menu">
      <button
        className="ghost add"
        disabled={status !== "open" || busy}
        title={status === "open" ? "Find WLED devices on the network" : "Connect to the bridge to scan"}
        onClick={scan}
      >
        {busy ? "Scanning…" : "⌕ Scan"}
      </button>
      {devices && (
        <div className="menu-items" role="menu" aria-label="discovered devices">
          {devices.length === 0 && <span className="muted pad">No devices found.</span>}
          {devices.map((d) => (
            <button
              key={d.host}
              role="menuitem"
              disabled={hosts.has(d.host)}
              onClick={() => {
                addDiscoveredController(studio, d);
                setDevices(null);
              }}
            >
              {d.name} <span className="muted">{d.host}</span>
              {hosts.has(d.host) && <span className="muted"> · added</span>}
            </button>
          ))}
          <button role="menuitem" onClick={() => setDevices(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

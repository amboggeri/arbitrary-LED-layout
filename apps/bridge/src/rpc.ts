/** RPC handlers exposed to the studio over the bridge socket. */
import { WledClient, type FetchLike } from "@ledlay/targets";
import type { RpcMethod } from "@ledlay/link";
import type { Discoverer } from "./discovery";

export interface RpcDeps {
  fetch?: FetchLike;
  discover?: Discoverer;
  /** Restrict which hosts RPCs may contact (private LAN ranges by default). */
  isAllowedHost?: (host: string) => boolean;
}

/** Private / link-local / loopback IPv4 and *.local mDNS names. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  if (/\.local$/i.test(h) || h === "localhost") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

function str(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || !v) throw new Error(`Missing "${key}"`);
  return v;
}

export async function handleRpc(
  method: RpcMethod,
  params: Record<string, unknown>,
  deps: RpcDeps,
): Promise<unknown> {
  const allowed = deps.isAllowedHost ?? isPrivateHost;
  const wled = () => {
    const host = str(params, "host");
    if (!allowed(host)) throw new Error(`Host ${host} is not on a private network; refusing`);
    return new WledClient(host, deps.fetch);
  };
  switch (method) {
    case "ping":
      return "pong";
    case "wled.info":
      return wled().getInfo();
    case "wled.state":
      return wled().setState((params.state as Record<string, unknown>) ?? {});
    case "wled.applyConfig": {
      const c = wled();
      await c.setConfig((params.config as Record<string, unknown>) ?? {});
      if (params.reboot) await c.reboot();
      return { applied: true, rebooting: !!params.reboot };
    }
    case "wled.uploadFile": {
      await wled().uploadFile(str(params, "path"), str(params, "content"));
      return { uploaded: true };
    }
    case "discover": {
      if (!deps.discover) throw new Error("Discovery not available");
      const t =
        typeof params.timeoutMs === "number" ? Math.min(10_000, Math.max(100, params.timeoutMs)) : 2500;
      return deps.discover(t);
    }
  }
}

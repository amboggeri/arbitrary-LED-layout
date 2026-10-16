/** mDNS discovery of WLED devices (_wled._tcp) and generic HTTP devices. */
import type { DiscoveredDevice } from "@ledlay/link";

export type Discoverer = (timeoutMs: number) => Promise<DiscoveredDevice[]>;

export const mdnsDiscover: Discoverer = async (timeoutMs) => {
  const { Bonjour } = await import("bonjour-service");
  const bonjour = new Bonjour();
  const found = new Map<string, DiscoveredDevice>();
  return new Promise((resolve) => {
    const browser = bonjour.find({ type: "wled" }, (svc) => {
      const host = svc.addresses?.find((a) => a.includes(".")) ?? svc.host;
      found.set(host, { name: svc.name, host, port: svc.port, kind: "wled" });
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve([...found.values()]);
    }, timeoutMs);
  });
};

/** Node UDP transport (dgram). One socket shared for all destinations. */
import { createSocket, type Socket } from "node:dgram";
import type { UdpTransport } from "@ledlay/targets";

export class NodeUdpTransport implements UdpTransport {
  private socket: Socket;
  private ready: Promise<void>;

  constructor(opts: { bindAddress?: string } = {}) {
    this.socket = createSocket({ type: "udp4", reuseAddr: true });
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind({ port: 0, address: opts.bindAddress }, () => {
        this.socket.off("error", reject);
        this.socket.setBroadcast(true);
        this.socket.setMulticastTTL(4);
        resolve();
      });
    });
    // Async send errors (EHOSTUNREACH etc.) arrive here; senders count errors via callbacks.
    this.socket.on("error", () => {});
  }

  async send(data: Uint8Array, host: string, port: number): Promise<void> {
    await this.ready;
    await new Promise<void>((resolve, reject) => {
      this.socket.send(data, port, host, (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    await this.ready.catch(() => {});
    await new Promise<void>((resolve) => this.socket.close(() => resolve()));
  }
}

/** Turns encoded controller buffers into protocol packets and pushes them through a transport. */
import type { Controller } from "@ledlay/core";
import {
  ARTNET_PORT,
  DDP_PORT,
  E131_PORT,
  ddpFramePackets,
  encodeArtDmx,
  encodeArtSync,
  encodeE131Packet,
  splitUniverses,
} from "@ledlay/protocols";
import type { UdpTransport } from "./transport";

export function defaultPort(protocol: Controller["protocol"]): number {
  switch (protocol) {
    case "ddp":
      return DDP_PORT;
    case "e131":
      return E131_PORT;
    case "artnet":
      return ARTNET_PORT;
  }
}

export interface SenderStats {
  frames: number;
  packets: number;
  bytes: number;
  errors: number;
  lastError: string | null;
}

export interface FrameSenderOptions {
  sourceName?: string;
  /** 16-byte E1.31 component id; random if omitted. */
  cid?: Uint8Array;
}

export class FrameSender {
  private readonly seq = new Map<string, number>();
  private readonly cid: Uint8Array;
  private readonly sourceName: string;
  readonly stats: SenderStats = { frames: 0, packets: 0, bytes: 0, errors: 0, lastError: null };

  constructor(
    private readonly transport: UdpTransport,
    opts: FrameSenderOptions = {},
  ) {
    this.sourceName = opts.sourceName ?? "ledlay";
    this.cid = opts.cid ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  }

  private nextSeq(id: string, wrap: number, min: number): number {
    const cur = this.seq.get(id) ?? min - 1;
    const next = cur + 1 > wrap ? min : cur + 1;
    this.seq.set(id, next);
    return next;
  }

  /** Build packets for one controller frame (pure; exposed for tests and dry runs). */
  packetsFor(controller: Controller, data: Uint8Array, channelsPerPixel: 3 | 4 = 3): Uint8Array[] {
    switch (controller.protocol) {
      case "ddp":
        return ddpFramePackets(data, { sequence: this.nextSeq(controller.id, 15, 1), channelsPerPixel });
      case "e131": {
        const seq = this.nextSeq(controller.id, 255, 0);
        return splitUniverses(data, Math.max(1, controller.universeStart), controller.channelsPerUniverse).map((u) =>
          encodeE131Packet({ universe: u.universe, sequence: seq, cid: this.cid, sourceName: this.sourceName }, u.data),
        );
      }
      case "artnet": {
        // Art-Net sequence 0 means "disabled"; use 1..255.
        const seq = this.nextSeq(controller.id, 255, 1);
        return splitUniverses(data, controller.universeStart, controller.channelsPerUniverse).map((u) =>
          encodeArtDmx({ universe: u.universe, sequence: seq }, u.data),
        );
      }
    }
  }

  async send(controller: Controller, data: Uint8Array, channelsPerPixel: 3 | 4 = 3): Promise<void> {
    if (!controller.enabled || !controller.host) return;
    const port = controller.port || defaultPort(controller.protocol);
    const packets = this.packetsFor(controller, data, channelsPerPixel);
    this.stats.frames++;
    for (const p of packets) {
      try {
        await this.transport.send(p, controller.host, port);
        this.stats.packets++;
        this.stats.bytes += p.length;
      } catch (e) {
        this.stats.errors++;
        this.stats.lastError = (e as Error).message;
      }
    }
  }

  /** Send ArtSync to a host (broadcast address recommended) after all ArtDmx of a frame. */
  async sendArtSync(host: string, port = ARTNET_PORT): Promise<void> {
    await this.transport.send(encodeArtSync(), host, port);
  }
}

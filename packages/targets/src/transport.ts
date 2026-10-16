/** Network transport abstraction so senders are testable and platform-neutral. */

export interface UdpTransport {
  send(data: Uint8Array, host: string, port: number): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface SentPacket {
  data: Uint8Array;
  host: string;
  port: number;
}

/** Records packets in memory. Used in tests and for dry-run/preview modes. */
export class MemoryTransport implements UdpTransport {
  readonly sent: SentPacket[] = [];
  send(data: Uint8Array, host: string, port: number): void {
    this.sent.push({ data: data.slice(), host, port });
  }
  clear(): void {
    this.sent.length = 0;
  }
}

/** JSON messages exchanged over the studio <-> bridge WebSocket. */
import { controllerSchema } from "@ledlay/core";
import { z } from "zod";

export const LINK_VERSION = 1;
export const DEFAULT_BRIDGE_PORT = 8787;

export const RPC_METHODS = [
  "wled.info",
  "wled.state",
  "wled.applyConfig",
  "wled.uploadFile",
  "discover",
  "ping",
] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), client: z.string(), version: z.number() }),
  z.object({ type: z.literal("setControllers"), controllers: z.array(controllerSchema) }),
  z.object({
    type: z.literal("rpc"),
    id: z.number().int(),
    method: z.enum(RPC_METHODS),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({ type: z.literal("blackout") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageInput = z.input<typeof clientMessageSchema>;

export interface BridgeStats {
  frames: number;
  packets: number;
  bytes: number;
  errors: number;
  lastError: string | null;
  fps: number;
}

export interface DiscoveredDevice {
  name: string;
  host: string;
  port: number;
  kind: "wled" | "other";
}

export type ServerMessage =
  | { type: "welcome"; version: number; bridge: { name: string; version: string } }
  | { type: "rpcResult"; id: number; ok: true; result: unknown }
  | { type: "rpcResult"; id: number; ok: false; error: string }
  | { type: "stats"; stats: BridgeStats }
  | { type: "error"; message: string };

export function parseClientMessage(text: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(text));
}

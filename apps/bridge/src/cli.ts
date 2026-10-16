/**
 * ledlay CLI
 *   ledlay serve [--port 8787] [--host 127.0.0.1] [--allow-origin URL]...
 *   ledlay play <project.json> [--controller ID]... [--duration S] [--brightness 0..1]
 *   ledlay bake <project.json> --controller ID [--out file.fseq] [--duration S] [--fps N]
 *   ledlay validate <project.json>
 *   ledlay wled-info <host>
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseProjectJson, totalLedCount, validatePatch } from "@ledlay/core";
import { createDefaultRegistry } from "@ledlay/effects";
import { DEFAULT_BRIDGE_PORT } from "@ledlay/link";
import { bakeFseq, WledClient } from "@ledlay/targets";
import { mdnsDiscover } from "./discovery";
import { playHeadless } from "./headless";
import { startBridge } from "./server";
import { NodeUdpTransport } from "./udp";

export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
}

const USAGE = `Usage:
  ledlay serve [--port ${DEFAULT_BRIDGE_PORT}] [--host 127.0.0.1] [--allow-origin URL]
  ledlay play <project.json> [--controller ID] [--duration SECONDS] [--brightness 0..1]
  ledlay bake <project.json> --controller ID [--out FILE.fseq] [--duration SECONDS] [--fps N]
  ledlay validate <project.json>
  ledlay wled-info <host>`;

async function loadProject(path: string | undefined) {
  if (!path) throw new Error("Missing project file");
  return parseProjectJson(await readFile(path, "utf8"));
}

export async function runCli(
  argv: string[],
  io: CliIo = { out: console.log, err: console.error },
): Promise<number> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      port: { type: "string" },
      host: { type: "string" },
      "allow-origin": { type: "string", multiple: true },
      controller: { type: "string", multiple: true },
      duration: { type: "string" },
      brightness: { type: "string" },
      out: { type: "string", short: "o" },
      fps: { type: "string" },
    },
  });
  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

  switch (command) {
    case "serve": {
      const transport = new NodeUdpTransport();
      const server = await startBridge({
        transport,
        port: num(values.port) ?? DEFAULT_BRIDGE_PORT,
        host: values.host ?? "127.0.0.1",
        allowedOrigins: values["allow-origin"],
        discover: mdnsDiscover,
        log: (m) => io.out(`[bridge] ${m}`),
      });
      const shutdown = async () => {
        await server.close();
        await transport.close();
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      return new Promise<number>(() => {}); // run until signalled
    }
    case "play": {
      const project = await loadProject(positionals[0]);
      const transport = new NodeUdpTransport();
      io.out(
        `Playing "${project.name}" (${totalLedCount(project)} LEDs) at ${project.fps} fps — Ctrl+C to stop`,
      );
      const run = playHeadless(project, {
        transport,
        registry: createDefaultRegistry(),
        controllerIds: values.controller,
        duration: num(values.duration),
        brightness: num(values.brightness),
      });
      process.once("SIGINT", () => run.stop());
      await run.done;
      await transport.close();
      io.out(
        `Sent ${run.sender.stats.frames} frames, ${run.sender.stats.packets} packets, ${run.sender.stats.errors} errors`,
      );
      return 0;
    }
    case "bake": {
      const project = await loadProject(positionals[0]);
      const controllerId = values.controller?.[0];
      if (!controllerId) throw new Error("--controller is required");
      const data = bakeFseq(project, createDefaultRegistry(), {
        controllerId,
        duration: num(values.duration),
        fps: num(values.fps),
      });
      const out = values.out ?? `${project.name.replace(/[^\w.-]+/g, "_")}-${controllerId}.fseq`;
      await writeFile(out, data);
      io.out(`Wrote ${out} (${data.length} bytes)`);
      return 0;
    }
    case "validate": {
      const project = await loadProject(positionals[0]);
      const issues = validatePatch(project);
      for (const i of issues) io.out(`${i.severity.toUpperCase()}: ${i.message}`);
      io.out(
        `${project.fixtures.length} fixtures, ${totalLedCount(project)} LEDs, ${project.controllers.length} controllers`,
      );
      return issues.some((i) => i.severity === "error") ? 1 : 0;
    }
    case "wled-info": {
      const host = positionals[0];
      if (!host) throw new Error("Missing host");
      io.out(JSON.stringify(await new WledClient(host).getInfo(), null, 2));
      return 0;
    }
    default:
      io.err(USAGE);
      return command === undefined || command === "help" || command === "--help" ? 0 : 2;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("ledlay.mjs");
if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    },
  );
}

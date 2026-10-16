# Architecture

## Principles

- **Pure core, I/O at the edges.** Everything under `packages/` except the bridge transport is
  pure TypeScript with no DOM or Node APIs. That's why it runs identically in the browser
  preview, the headless Node player, and the offline FSEQ baker.
- **One source of truth for data.** `packages/core/src/model.ts` defines zod schemas. TS types
  are inferred from them, and every file loaded from disk or the network is validated (with
  defaults filled) by `parseProject`. Format changes go through `MIGRATIONS` in `project.ts`.
- **Immutable edits.** The studio never mutates a project. Every change is an
  `@ledlay/editor` command `(project, …) => project`, built on immer for structural sharing.
  Undo is a stack of snapshots, and unchanged branches keep their identity, so the runtime
  can cheaply tell whether geometry changed (`next.fixtures !== prev.fixtures`).
- **Deterministic effects.** An effect is a function of (pixel space, params, time, state).
  Randomness comes from seeded hashes, so scrubbing, looping and baking all produce the same
  frames.

## Data flow per frame

```
Project ──compileLayout──▶ CompiledLayout { PixelSpace, fixtures, controllers[route] }
                                   │
time t ──▶ Renderer.renderProject ─┤  live layers or active timeline clips
                                   │  keyframes → resolveParams → effect.render → blendInto (mask)
                                   ▼
                          Float32 RGB frame (one entry per LED, 0..1)
                     ┌─────────────┴─────────────┐
               Viewport3D.setColors      ControllerEncoder.encode (per controller)
                                           route → RGBW split → gamma/brightness LUT
                                           → color order → power limit → Uint8Array
                                                       │
                                     BridgeClient.sendFrame (binary WS)
                                                       │
                                     bridge: FrameSender → DDP / E1.31 / Art-Net → UDP
```

### Pixel space

`PixelSpace` (`packages/effects/src/space.ts`) holds the flat typed arrays effects read:

- world `xyz`
- `unit`: 0..1 per axis
- `centered`: −1..1, aspect-preserving
- `u`: 0..1 along the fixture's wiring
- `fixture` and `indexInFixture` indices

Effects write float RGB into a shared output buffer, so there are no per-pixel allocations.

### Controller pixel space

A controller's outputs are concatenated into one flat pixel space. That matches WLED's
global LED index across buses, and how DDP and E1.31 address a device. A fixture's `patch`
says which controller, which output, and the start pixel on that output. Compilation turns
this into a `route` (controller slot → global pixel index, or −1 for gaps).

## Studio

- `state/store.ts`: zustand store holding the project, selection, transport and bridge
  status. `apply(fn, label, coalesceKey)` is the only way to edit the project.
- `runtime/runtime.ts`: `StudioRuntime`, which has no React in it.
  - Subscribes to the store and recompiles when geometry or patching changes.
  - Owns the `Player` and pushes frames to sinks: the 3D viewport, and the bridge when
    output is on.
- `viewport/Viewport3D.ts`: imperative three.js view.
  - LEDs are drawn as two point clouds: a core pass and an additive glow pass.
  - Also handles wiring lines, selection boxes, the TransformControls gizmo, and raycast
    drawing onto models.
  - React only mounts it and forwards state; nothing re-renders per frame.
- `ui/*`: panels. Each edit is a single `apply` call, so every UI action is undoable.

## Bridge

`apps/bridge/src/server.ts` is an HTTP server with a WebSocket upgrade:

- **JSON messages:** `hello`, `setControllers`, `rpc`, `blackout`.
- **Binary frame messages:** `[0x46, version, u16 controllerIndex, cpp, data…]`.
- **RPCs:** WLED HTTP calls (only to private-network hosts) and mDNS discovery.
- **Security:** binds to loopback by default and rejects WebSocket upgrades from
  non-localhost origins, so a random website can't drive your LAN devices.

## Testing strategy

| Layer     | Tests                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| core      | geometry (every wiring variant), transforms vs three.js conventions, schema, patch validation                      |
| protocols | exact header bytes vs specs, encode/decode round-trips, framing/alignment                                          |
| effects   | a contract suite every effect must pass (finite, in range, deterministic, empty/flat layouts) + behaviour tests    |
| engine    | keyframes/easing, blend modes, timeline fades/looping, routing, gamma/order/RGBW/power limiting, drift-free player |
| targets   | sender sequencing per protocol, WLED client (fake fetch), config/ledmap generation, FSEQ round-trip, baking        |
| editor    | every command: no-op on unknown ids, immutability, validity after every change                                     |
| bridge    | real UDP + WebSocket integration, origin policy, RPC host policy, headless player, CLI                             |
| studio    | store/runtime with fake clock + fake bridge, React components (RTL), Playwright e2e incl. GUI → bridge → UDP       |

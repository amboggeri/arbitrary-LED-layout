# ledlay

Design arbitrary physical LED layouts in 2D/3D, program them with spatial and temporal
effects, and drive real hardware (WLED, Art-Net, sACN/E1.31, DDP) — or bake shows to FSEQ
for standalone playback.

```
 ┌──────────── studio (browser) ────────────┐        ┌──── bridge (Node) ────┐       ┌─ devices ─┐
 │ 3D layout editor · effects · timeline    │  WS    │ frames → DDP/E1.31/   │  UDP  │ WLED      │
 │ live preview · WLED setup · FSEQ export  │ ─────▶ │ Art-Net · WLED HTTP   │ ────▶ │ Art-Net   │
 └──────────────────────────────────────────┘        │ mDNS discovery · CLI  │       │ sACN/FPP  │
                                                     └───────────────────────┘       └───────────┘
```

## Quick start

```bash
pnpm install
pnpm dev        # studio at http://localhost:5173 (opens with a demo tree/star/floor layout)
pnpm bridge     # in another terminal: ws://127.0.0.1:8787 → UDP to your controllers
```

Browsers can't send UDP, so the studio talks to hardware through the small **bridge**
process. It binds to `127.0.0.1` and only accepts connections from localhost origins.

### Drive a WLED device

1. In the studio, select the **WLED** controller (or ＋ Add one) and set its IP address.
   Leave the protocol on **DDP**.
2. Patch fixtures onto it: select a fixture and choose the controller under **Patch**, or
   click **Auto-patch unpatched fixtures** on the controller.
3. Click **Connect** in the toolbar, then **Read info** to check the device answers.
4. Optional: **Push LED config** writes the pins, LED counts and chip type, enables
   realtime receive, and reboots the device. It asks for confirmation first.
5. Tick **Output** and press **Space** to play.

WLED fits into this as the device the LEDs plug into: ledlay renders every pixel and
streams it, and WLED handles pins, color order, power limiting and timing. With
**Upload ledmap**, WLED's own 2D effects also follow your physical layout when no PC is
running.

### Standalone playback (no studio)

```bash
pnpm ledlay play show.ledlay.json                  # render + stream from Node (e.g. a Raspberry Pi)
pnpm ledlay bake show.ledlay.json --controller ID  # → .fseq for FPP / ESPixelStick / xLights
pnpm ledlay validate show.ledlay.json              # patch overlaps, overflows, missing hosts
pnpm ledlay wled-info 192.168.1.50
```

`pnpm --filter @ledlay/bridge build` produces a single-file `apps/bridge/dist/ledlay.mjs` you
can copy to a Pi and run with `node ledlay.mjs serve|play|bake …`.

## Features

- **Fixtures:** strip, ring/arc, matrix (serpentine/progressive, any start corner),
  3D cube, polyline path (drawn directly on imported models), and free point clouds.
  All have full 3D transforms.
- **Scene import:** glTF/GLB/OBJ/STL reference models, embedded in the project file.
  The **Draw** tool raycasts onto them to lay LED runs along real surfaces.
- **Point import:** CSV, [Marimapper](https://github.com/TheMariday/marimapper) camera-mapping
  output (gaps are interpolated), and xLights custom models (`.xmodel`), which also export.
- **Effects:** 15 built-ins, deterministic so they scrub and bake identically.
  - Solid, Gradient, Rainbow Wave, Plane Sweep, Shockwave, Orb, Spiral, Plasma, Noise
    Clouds, Fire, Chase, Scanner, Twinkle, Strobe.
  - **Script**: per-pixel JavaScript, Pixelblaze-style.
- **Layers:** blend modes (normal/add/multiply/screen/max/min/subtract), opacity, speed, and
  masks by fixture or tag.
- **Animation:** keyframes on any parameter (◆ in the inspector) with easing, and a
  multi-track **timeline** of clips with fades.
- **Output:** DDP, E1.31 and Art-Net. Per-controller gamma, brightness, color order (incl.
  RGBW with white extraction), and a power limiter in amps. Packets are sent as complete
  frames.
- **WLED:** read info, generate and push LED bus + realtime config, upload 2D ledmaps.
  The bridge also discovers devices over mDNS.
- **FSEQ v2 export** per controller for FPP/ESPixelStick/xLights-compatible players.
- **Editing:** undo/redo for every edit (slider drags coalesce into one step), autosave,
  and project files as plain JSON validated by a schema.

### Script effect

```js
// Variables: x y z (0..1 across layout), cx cy cz (−1..1 centered), wx wy wz (world units),
// t (seconds), i (pixel index), u (0..1 along fixture), f (fixture index), n (pixel count)
// Helpers: hsv rgb noise fbm hash fract clamp mix smoothstep triangle sin cos … PI TAU
return hsv(y * 0.5 + t * 0.2, 1, 1);
```

Scripts run as JavaScript inside the app. Only run scripts you trust.

### Keyboard

`Space` play/pause · `Q W E R` select/move/rotate/scale · `D` draw path · `F` frame all ·
`Del` delete · `Ctrl+D` duplicate · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Esc` deselect

## Repository layout

| Package              | Responsibility                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- |
| `packages/core`      | Project schema (zod), 3D math, color, fixture geometry generators, patching/validation |
| `packages/protocols` | Pure DDP / E1.31 / Art-Net packet encoders + decoders                                  |
| `packages/effects`   | Effect API, pixel space, parameter specs, noise, built-in effect library               |
| `packages/engine`    | Layout compilation, keyframes, compositing, timeline, byte encoding, playback clock    |
| `packages/targets`   | Frame sender over a pluggable transport, WLED client/config, FSEQ, baking              |
| `packages/io`        | CSV / Marimapper / xLights import-export                                               |
| `packages/editor`    | Pure immutable editing commands, undo history, templates                               |
| `packages/link`      | Studio↔bridge wire contract and reconnecting client                                    |
| `apps/bridge`        | Node bridge server, UDP transport, mDNS, headless player, `ledlay` CLI                 |
| `apps/studio`        | React + three.js GUI                                                                   |

Dependencies only flow downward (core → protocols/effects → engine → targets → apps). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details and [docs/ROADMAP.md](docs/ROADMAP.md)
for what's next.

## Development

```bash
pnpm check        # typecheck + lint + format check + unit tests
pnpm test         # vitest across all packages (≈350 tests)
pnpm test:coverage
pnpm test:e2e     # Playwright: drives the real GUI, including GUI → bridge → UDP → decoded DDP
```

## License

MIT

# Roadmap

## Phase 1: layout, effects, live output ✅

- 3D layout editor: strips, rings, matrices, cubes, paths, point clouds, with transforms
  and a gizmo.
- Effect library with layers, blend modes, masks, and a script effect.
- Live preview and DDP / E1.31 / Art-Net output through the bridge.
- WLED info, config push and ledmap upload.

## Phase 2: scene-driven programming ✅ (first pass)

- glTF/OBJ/STL import, and drawing LED paths on model surfaces.
- Keyframes on any parameter, and a multi-track timeline with fades.
- Spatial effects (orb, plane sweep, shockwave) whose positions can be animated.

Next steps:

- [ ] Effects that sample the scene itself: a light or material in the glTF drives LED color
      (e.g. bake animated glTF lights/emissive textures into per-LED colors).
- [ ] Video/image mapping: project a video onto the layout from a camera viewpoint.
- [ ] Audio-reactive parameters (FFT bands as modulation sources), plus a music track on
      the timeline with waveform display and an FSEQ `mf` header.
- [x] Parameter modulators: LFOs (sine/triangle/saw/square/random) as an alternative to keyframes.

## Phase 3: deployment ✅ (first pass)

- FSEQ v2 bake per controller, plus a headless `ledlay play` for a Pi.
- mDNS discovery over the bridge.

Next steps:

- [x] Discovery UI: scan the network, then add found WLED devices as controllers in one click.
- [ ] Upload FSEQ to FPP / ESPixelStick over their HTTP APIs, and create playlists.
- [ ] zstd-compressed FSEQ (smaller files on SD cards).
- [ ] Multi-controller sync: ArtSync / E1.31 sync universes, and DDP timecode.

## Phase 4: camera mapping

- [ ] Built-in camera mapping: light each LED in turn over the bridge, detect it in webcam
      frames, and triangulate from several views. (Today: run Marimapper and import its CSV.)

## Phase 5: on-device effects

- [ ] Compile the subset of effects that run on ESP32 to a small bytecode, plus firmware or
      a WLED usermod that runs them, so standalone devices can show live 3D effects without
      baked sequences. Alternatively, target MoonModules' MoonLight 3D layouts.

## Packaging

- [ ] Desktop app (Tauri) bundling the studio and bridge, so there's one thing to install.
- [ ] Optional WebSerial output for USB-connected controllers, with no bridge needed.

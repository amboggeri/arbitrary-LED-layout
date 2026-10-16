// Bundle the CLI into a single executable ESM file.
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/ledlay.mjs",
  // CJS deps (ws) call require() for Node builtins; give the ESM bundle a real require.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __ledlayCreateRequire } from "node:module";\nconst require = __ledlayCreateRequire(import.meta.url);',
  },
  logLevel: "info",
});

// Production build: bundles the API (and the ops scripts) into plain JS under dist/.
// @oohrena/shared ships TypeScript source, so it is bundled in; every other npm package stays external
// and is resolved from node_modules at runtime (pdfkit, mongoose etc. load their own data files).
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const bundleWorkspaceOnly = {
  name: "externalize-npm-packages",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("@oohrena/")) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: {
    server: "src/server.ts",
    "scripts/create-staff": "scripts/create-staff.ts",
    "scripts/backup-restore": "scripts/backup-restore.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  splitting: true,
  outExtension: { ".js": ".js" },
  plugins: [bundleWorkspaceOnly],
  logLevel: "info",
});

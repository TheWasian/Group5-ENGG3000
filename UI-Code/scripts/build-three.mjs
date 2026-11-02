import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = root + "backend/three/three-game.bundle.js";
const result = await build({
  absWorkingDir: root,
  entryPoints: ["backend/three/ThreeBoard.mjs"],
  outfile: output,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "eof",
  metafile: true,
  write: false,
});
if (Object.values(result.metafile.outputs).some((entry) => entry.imports.length)) {
  throw new Error("The 3D bundle must not depend on runtime module imports.");
}
const bundle = result.outputFiles[0].contents;
if (process.argv.includes("--check")) {
  const current = await readFile(output).catch(() => Buffer.alloc(0));
  if (!current.equals(Buffer.from(bundle))) {
    console.error("The 3D bundle is out of date. Run npm run build in UI-Code.");
    process.exitCode = 1;
  } else console.log("The 3D bundle matches the source modules.");
} else {
  await writeFile(output, bundle);
  console.log("Built backend/three/three-game.bundle.js (" + Math.round(bundle.length / 1024) + " KiB).");
}

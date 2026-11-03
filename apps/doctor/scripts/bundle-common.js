import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @estruyf/doctor-common is never published, so the CLI carries it as a bundled dependency.
// In the workspace it is a symlink in the root node_modules, which npm leaves out of the
// tarball. A real copy next to the CLI is packed, so one is put there before packing and
// removed after: the built package, which is its package.json and dist.
const packageDir = path.join(__dirname, "..");
const source = path.join(packageDir, "../../packages/common");
const scope = path.join(packageDir, "node_modules/@estruyf");
const target = path.join(scope, "doctor-common");

const action = process.argv[2];

if (action === "copy") {
  if (!fs.existsSync(path.join(source, "dist/index.js"))) {
    throw new Error(`${source} is not built. Run the CLI's build first.`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(source, "package.json"), path.join(target, "package.json"));
  fs.cpSync(path.join(source, "dist"), path.join(target, "dist"), { recursive: true });
} else if (action === "remove") {
  fs.rmSync(target, { recursive: true, force: true });
  // Only the folders this script made, when nothing else ended up in them
  for (const dir of [scope, path.dirname(scope)]) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  }
} else {
  throw new Error(`Unknown action "${action}", use "copy" or "remove"`);
}

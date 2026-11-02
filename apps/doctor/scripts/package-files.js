import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// npm only packs the readme and license from the package folder, and both live at the root
// of the repository, where GitHub shows them. Copied in before packing, removed after.
const files = ["readme.md", "LICENSE"];
const packageDir = path.join(__dirname, "..");
const rootDir = path.join(packageDir, "../..");

const action = process.argv[2];

for (const file of files) {
  const target = path.join(packageDir, file);
  if (action === "copy") {
    fs.copyFileSync(path.join(rootDir, file), target);
  } else if (action === "remove") {
    fs.rmSync(target, { force: true });
  } else {
    throw new Error(`Unknown action "${action}", use "copy" or "remove"`);
  }
}

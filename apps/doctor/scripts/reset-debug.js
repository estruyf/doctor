import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const doctorFile = path.join(__dirname, `../bin/doctor`);
const doctorContents = fs.readFileSync(doctorFile, { encoding: "utf-8" });

const lines = doctorContents.split(`\n`);
lines[0] = `#!/usr/bin/env node`;

const debugLineIndex = lines.findIndex(
  (line) => line.trim() === 'process.env.DEBUG = "true";',
);
if (debugLineIndex !== -1) {
  lines.splice(debugLineIndex, 1);
}

fs.writeFileSync(doctorFile, lines.join(`\n`));

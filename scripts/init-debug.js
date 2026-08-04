import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const doctorFile = path.join(__dirname, `../bin/doctor`);
const doctorContents = fs.readFileSync(doctorFile, { encoding: "utf-8" });

const lines = doctorContents.split(`\n`);
lines[0] = `#!/usr/bin/env node --inspect`;

// Enable app-level debug logging while in debug watch mode.
if (!lines.some((line) => line.trim() === 'process.env.DEBUG = "true";')) {
  lines.splice(1, 0, 'process.env.DEBUG = "true";');
}

fs.writeFileSync(doctorFile, lines.join(`\n`));

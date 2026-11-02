import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, { encoding: "utf-8" }),
);
packageJson.version += `-beta.${process.argv[process.argv.length - 1].substr(0, 7)}`;
console.log(packageJson.version);
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

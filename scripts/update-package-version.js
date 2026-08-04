import fs from "node:fs";
import path from "node:path";

const packageJsonPath = path.join(path.resolve("."), "package.json");
const packageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, { encoding: "utf-8" }),
);
packageJson.version += `-beta.${process.argv[process.argv.length - 1].substr(0, 7)}`;
console.log(packageJson.version);
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = path.join(__dirname, `../cypress.sample.json`);
const newPath = path.join(__dirname, `../cypress.json`);

if (fs.existsSync(config)) {
  const content = fs.readFileSync(config, { encoding: "utf-8" });
  if (content) {
    const configJson = JSON.parse(content);
    configJson.baseUrl = process.env.SITEURL;
    configJson.env = {};
    configJson.env.USERNAME = process.env.USERNAME;
    configJson.env.PASSWORD = process.env.PASSWORD;
    configJson.env.SITEURL = process.env.SITEURL;
    configJson.screenshotsFolder = `cypress/screenshots/${process.env.ENVIRONMENT}`;
    fs.writeFileSync(newPath, JSON.stringify(configJson), {
      encoding: "utf-8",
    });
  }
}

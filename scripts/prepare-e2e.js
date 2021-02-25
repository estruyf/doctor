const fs = require('fs');
const path = require('path');

const config = path.join(__dirname, `../cypress.sample.json`);
const newPath = path.join(__dirname, `../cypress.json`);

if (fs.existsSync(config)) {
  const content = fs.readFileSync(config, { encoding: "utf-8" });
  if (content) {
    const configJson = JSON.parse(content);
    configJson.baseUrl = process.env.SITEURL;
    fs.writeFileSync(newPath, JSON.stringify(configJson), { encoding: "utf-8" });
  }
}
const fs = require('fs');
const path = require('path');

const config = path.join(__dirname, `../doctor-sample/doctor.sample.json`);
const newPath = path.join(__dirname, `../doctor-sample/doctor.json`);
fs.copyFileSync(config, newPath);

const file = fs.readFileSync(newPath, { encoding: "utf-8" });
if (file) {
  const data = JSON.parse(file);
  if (data && data.multilingual && data.multilingual.translator) {
    data.multilingual.translator.key = process.env.TRANSLATOR_KEY;
    fs.writeFileSync(newPath, JSON.stringify(data, null, 2), { encoding: "utf-8" });
  }
}
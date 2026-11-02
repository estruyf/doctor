import fs from "node:fs";
import path from "node:path";

// CI clones the sample into the folder it runs this script from
const config = path.resolve(`doctor-sample/doctor.sample.json`);
const newPath = path.resolve(`doctor-sample/doctor.json`);
fs.copyFileSync(config, newPath);

const file = fs.readFileSync(newPath, { encoding: "utf-8" });
if (file) {
  const data = JSON.parse(file);

  console.log(`Multilingual settings`);
  console.log(`Key: ${process.env.TRANSLATOR_KEY}`);
  console.log(data.multilingual);

  if (data && data.multilingual && data.multilingual.translator) {
    data.multilingual.translator.key = process.env.TRANSLATOR_KEY;
    fs.writeFileSync(newPath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
    });
  }
}

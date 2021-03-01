const fs = require('fs');
const path = require('path');

const config = path.join(__dirname, `../doctor-sample/doctor.sample.json`);
const newPath = path.join(__dirname, `../doctor-sample/doctor.json`);
fs.copyFileSync(config, newPath);
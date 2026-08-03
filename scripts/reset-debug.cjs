const fs = require('fs');
const path = require('path');

const doctorFile = path.join(__dirname, `../bin/doctor`);
const doctorContents = fs.readFileSync(doctorFile, { encoding: "utf-8" });

const lines = doctorContents.split(`\n`);
lines[0] = `#!/usr/bin/env node`;

fs.writeFileSync(doctorFile, lines.join(`\n`));
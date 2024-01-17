import { writeFile } from "fs";
import { promisify } from "util";

export const writeFileAsync = promisify(writeFile);

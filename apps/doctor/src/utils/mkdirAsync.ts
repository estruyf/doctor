import { mkdir } from "fs";
import { promisify } from "util";

export const mkdirAsync = promisify(mkdir);

import { exists } from "fs";
import { promisify } from "util";

export const existsAsync = promisify(exists);

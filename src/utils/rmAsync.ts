import { rm } from "fs";
import { promisify } from "util";

export const rmAsync = promisify(rm);

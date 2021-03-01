import kleur = require("kleur");


export class Logger {
  private static isDebugRun: boolean = false;
  
  public static init(value: boolean = false) {
    Logger.isDebugRun = value;
  }

  public static debug(msg: any) {
    if (Logger.isDebugRun) {
      console.log(kleur.bgYellow().white("DEBUG"), typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  }

  /**
   * Mask the values in the string
   * @param value 
   * @param masks 
   */
  public static mask(value: string, masks: string[] = []): string {
    if (masks.length > 0) {
      for (const mask of masks) {
        if (mask) {
          try {
            const toReplace = new RegExp(mask, "g");
            value = value.replace(toReplace, "*****");
            value = value.replace(mask, "*****");
          } catch {
            value = value.replace(mask, "*****");
          }
        }
      }
    }

    return value;
  }
}
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
}
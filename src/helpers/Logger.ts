import kleur from "kleur";


export class Logger {
  private static isDebugRun: boolean = false;
  
  public static init(value: boolean = false) {
    Logger.isDebugRun = value;
  }

  public static reset() {
    Logger.isDebugRun = false;
  }

  public static debug(msg: any) {
    if (Logger.isDebugRun) {
      const formattedMessage = typeof msg === "string" ? msg : JSON.stringify(msg);
      process.stderr.write(
        `${kleur.bgYellow().white("DEBUG")} ${formattedMessage}\n`
      );
    }
  }

  /**
   * The settings which must never reach the output. Matched on the property
   * name, so a new secret is covered by adding it here.
   */
  private static readonly SECRET_FIELDS = [
    "password",
    "certificate",
    "key",
    "secret",
    "clientsecret",
    "accesstoken",
    "token",
  ];

  /**
   * Redact the secrets of a settings object, keeping the rest readable.
   *
   * This replaces values by property name instead of searching for the secret
   * in the serialized output. Searching corrupts unrelated values: a password
   * of "test" would turn a menu id of "tests" into "*****s".
   * @param value The settings to write to the output
   */
  public static redact(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => Logger.redact(item));
    }

    if (value === null || typeof value !== "object") {
      return value;
    }

    const redacted: any = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        Logger.SECRET_FIELDS.includes(key.toLowerCase()) &&
        item !== null &&
        typeof item !== "object"
      ) {
        // Keep undefined and empty values recognisable, they are not secrets
        redacted[key] = item ? "*****" : item;
        continue;
      }

      redacted[key] = Logger.redact(item);
    }

    return redacted;
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
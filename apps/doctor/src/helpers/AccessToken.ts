import { Logger } from "./index.js";
import { executeCommand } from "@pnp/cli-microsoft365";


/**
 * Fetching a token runs two CLI commands, and a publish makes several REST
 * calls per page, so a token is reused for a while. Never for longer than this,
 * and never past its own expiry either: the CLI hands back the token it has
 * cached, which can be minutes from expiring when doctor first sees it.
 */
const TOKEN_LIFETIME = 10 * 60 * 1000;
/** A token is dropped this long before it expires, so a call in flight never presents an expired one */
const EXPIRY_MARGIN = 2 * 60 * 1000;

export class AccessToken {
  private static cache: { [origin: string]: { token: string; until: number } } = {};

  public static reset(): void {
    AccessToken.cache = {};
  }

  /**
   * Get an access token for the site
   * @param webUrl 
   * @returns access token
   */
  public static async get(webUrl: string) {
    // `spo set` stores the URL of the *root* site collection. Passing the site URL
    // here corrupts it, as commands which talk to the admin site derive their URL
    // from it and would end up calling `https://<tenant>-admin.sharepoint.com/sites/<site>`.
    const { origin } = new URL(webUrl);

    const cached = AccessToken.cache[origin];
    if (cached && Date.now() < cached.until) {
      return cached.token;
    }

    await executeCommand("spo set", { url: origin });
    const { stdout: token } = await executeCommand("util accesstoken get", {
      resource: origin,
    });
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      throw `Failed to retrieve an access token.`;
    }

    const parsed = AccessToken.parse(token);
    AccessToken.cache[origin] = {
      token: parsed,
      until: AccessToken.cacheUntil(parsed, Date.now()),
    };
    return parsed;
  }

  /**
   * Until when a token fetched at `now` may be reused: ten minutes at most, and
   * never later than shortly before the token's own `exp` claim. A token that
   * cannot be decoded gets the ten minutes, which is what it always had.
   * @param token The access token, a JWT
   * @param now The moment it was fetched, in milliseconds
   */
  public static cacheUntil(token: string, now: number): number {
    const limit = now + TOKEN_LIFETIME;

    try {
      const payload = token.split(".")[1];
      const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof exp === "number") {
        return Math.min(limit, exp * 1000 - EXPIRY_MARGIN);
      }
    } catch {
      // Not a JWT doctor can read, the fixed window applies
    }

    return limit;
  }

  /**
   * The CLI writes its output as JSON, so a plain string result comes back
   * quoted. Those quotes are part of the value, which turns the header into
   * `Bearer "eyJ..."` and makes SharePoint answer every call with a 401.
   * @param token The raw stdout of the access token command
   */
  public static parse(token: string): string {
    const raw = token.trim();

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed) {
        return parsed.trim();
      }
    } catch {
      // Not JSON encoded, the raw value is the token
    }

    return raw;
  }
}
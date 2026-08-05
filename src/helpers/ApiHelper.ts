import { Logger } from "./index.js";

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

/**
 * SharePoint puts the reason a call was refused in the response body. Returning
 * null on failure hides that, which is why the calls that have to succeed use
 * the *OrThrow variants below.
 */
const failureMessage = async (
  method: string,
  url: string,
  response: Response
): Promise<string> => {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // Nothing to add to the message
  }

  // The SharePoint error is nested, the plain message reads much better
  try {
    const parsed = JSON.parse(body);
    const message =
      parsed?.error?.message?.value ||
      parsed?.["odata.error"]?.message?.value ||
      parsed?.error_description;
    if (message) {
      body = message;
    }
  } catch {
    // Not JSON, keep the raw body
  }

  return `${method} ${url} failed with status ${response.status}${
    response.statusText ? ` (${response.statusText})` : ""
  }.${body ? ` ${body}` : ""}`;
};

export class ApiHelper {
  /**
   * Do an API GET request which reports why it failed, instead of returning null
   */
  public static async getOrThrow(url: string, headers: any = {}) {
    Logger.debug(`GET Request URL: ${url}`);

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(await failureMessage("GET", url, response));
    }

    return await response.json();
  }

  /**
   * Do an API POST request which reports why it failed, instead of returning null
   */
  public static async postOrThrow(
    url: string,
    headers: any = {},
    body: any = {}
  ) {
    Logger.debug(`POST Request URL: ${url}`);
    Logger.debug(`POST Request BODY: ${JSON.stringify(body)}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await failureMessage("POST", url, response));
    }

    return await response.json();
  }

  /**
   * Do an API GET request
   * @param url
   * @param headers
   * @returns
   */
  public static async get(url: string, headers: any = {}) {
    try {
      Logger.debug(`GET Request URL: ${url}`);

      const data = await fetch(url, {
        method: "GET",
        headers,
      });

      if (data && data.ok) {
        const response = await data.json();
        Logger.debug(response);
        return response;
      } else {
        Logger.debug(
          `No response for GET call to ${url} - status: ${data.status}`
        );
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }

      return null;
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      Logger.debug(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Do an API POST request
   * @param url
   * @param headers
   * @param body
   * @returns
   */
  public static async post(url: string, headers: any = {}, body: any = {}) {
    try {
      Logger.debug(`POST Request URL: ${url}`);
      Logger.debug(`POST Request BODY: ${JSON.stringify(body)}`);

      const data = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (data && data.ok) {
        const response = await data.json();
        Logger.debug(response);
        return response;
      } else {
        Logger.debug(
          `No response for POST call to ${url} - status: ${data.status}`
        );
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }

      return null;
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      Logger.debug(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Do an API PATCH request
   * @param url
   * @param headers
   * @param body
   * @returns
   */
  public static async patch(
    url: string,
    headers: any = {},
    body: any = {}
  ): Promise<boolean> {
    try {
      Logger.debug(`PATCH Request URL: ${url}`);
      Logger.debug(`PATCH Request BODY: ${JSON.stringify(body)}`);

      const data = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });

      if (data && data.ok) {
        return true;
      } else {
        Logger.debug(
          `No response for PATCH call to ${url} - status: ${data.status}`
        );
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }

      return false;
    } catch (err) {
      const errorMessage = toErrorMessage(err);
      Logger.debug(errorMessage);
      throw new Error(errorMessage);
    }
  }
}

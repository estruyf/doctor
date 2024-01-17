import { Logger } from ".";

export class ApiHelper {
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
      Logger.debug(err.message);
      throw err.message;
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
      Logger.debug(err.message);
      throw err.message;
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
      Logger.debug(err.message);
      throw err.message;
    }
  }
}

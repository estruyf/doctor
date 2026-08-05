import { Logger } from "./Logger.js";
import { TranslationsResponse } from "@models";

export class Translator {
  /**
   * Translate the text
   * @param endpoint
   * @param key
   * @param language
   * @param contents
   * @param region
   * @returns
   */
  public static async translate(
    endpoint: string,
    key: string,
    language: string,
    contents: string,
    region: string = "global"
  ): Promise<TranslationsResponse[] | null> {
    Logger.debug(`Translator will translate the page to ${language}`);

    let options = {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-type": "application/json",
        "X-ClientTraceId": crypto.randomUUID(),
      },
      body: JSON.stringify([
        {
          text: contents,
        },
      ]),
    };

    const url = `${Translator.getTranslateUrl(
      endpoint
    )}?api-version=3.0&textType=html&to=${language}`;
    Logger.debug(`Translator endpoint: ${url}`);

    const response = await fetch(url, options);

    if (response && response.ok) {
      Logger.debug(
        `Translator successfully translated contents to ${language}`
      );
      return await response.json();
    } else {
      Logger.debug(`Translator failed translating the contents to ${language}`);
      Logger.debug(`${response.status} ${response.statusText} - ${url}`);

      try {
        Logger.debug(await response.text());
      } catch {
        // Nothing more to report
      }
    }

    return null;
  }

  /**
   * The Text API lives on a different path depending on the endpoint. A resource
   * specific endpoint (`<name>.cognitiveservices.azure.com`) serves it under
   * `/translator/text/v3.0`, while the global endpoint serves it at the root.
   * Calling the wrong one answers with a 404 "Resource Not Found".
   * @param endpoint The endpoint from the `multilingual.translator` settings
   */
  public static getTranslateUrl(endpoint: string): string {
    // A configured endpoint often carries a trailing slash, which would turn
    // the request into a `//translate` path
    const base = endpoint.trim().replace(/\/+$/, "");

    let host = "";
    try {
      host = new URL(base).host.toLowerCase();
    } catch {
      // Not a parsable URL, fall back to the root path
    }

    if (host.endsWith(".cognitiveservices.azure.com")) {
      return `${base}/translator/text/v3.0/translate`;
    }

    return `${base}/translate`;
  }
}

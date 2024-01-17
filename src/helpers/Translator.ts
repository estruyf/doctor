import { Logger } from "./logger";
import { v4 as uuidv4 } from "uuid";
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
  ): Promise<TranslationsResponse[]> {
    Logger.debug(`Translator will translate the page to ${language}`);

    let options = {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-type": "application/json",
        "X-ClientTraceId": uuidv4().toString(),
      },
      body: JSON.stringify([
        {
          text: contents,
        },
      ]),
    };

    const url = `${endpoint}/translate?api-version=3.0&textType=html&to=${language}`;
    const response = await fetch(url, options);

    if (response && response.ok) {
      Logger.debug(
        `Translator successfully translated contents to ${language}`
      );
      return await response.json();
    } else {
      Logger.debug(`Translator failed translating the contents to ${language}`);
      Logger.debug(response.statusText);
    }

    return null;
  }
}

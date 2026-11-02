import test from "node:test";
import assert from "node:assert/strict";

import { Translator } from "../dist/helpers/Translator.js";

test("A resource specific endpoint gets the Text API path", () => {
  // Without the path Azure answers 404 "Resource Not Found"
  assert.equal(
    Translator.getTranslateUrl("https://my-translator.cognitiveservices.azure.com"),
    "https://my-translator.cognitiveservices.azure.com/translator/text/v3.0/translate"
  );
});

test("A trailing slash never turns into a double slash", () => {
  assert.equal(
    Translator.getTranslateUrl("https://my-translator.cognitiveservices.azure.com/"),
    "https://my-translator.cognitiveservices.azure.com/translator/text/v3.0/translate"
  );
  assert.equal(
    Translator.getTranslateUrl("https://api.cognitive.microsofttranslator.com//"),
    "https://api.cognitive.microsofttranslator.com/translate"
  );
  assert.equal(
    Translator.getTranslateUrl("  https://api.cognitive.microsofttranslator.com/  "),
    "https://api.cognitive.microsofttranslator.com/translate"
  );
});

test("The global endpoint keeps serving the Text API at its root", () => {
  assert.equal(
    Translator.getTranslateUrl("https://api.cognitive.microsofttranslator.com"),
    "https://api.cognitive.microsofttranslator.com/translate"
  );
});

test("An unparsable endpoint falls back to the root path", () => {
  assert.equal(Translator.getTranslateUrl("not-a-url"), "not-a-url/translate");
});

import test from "node:test";
import assert from "node:assert/strict";

import { Logger } from "../dist/helpers/Logger.js";

test("The known secrets are redacted", () => {
  const redacted = Logger.redact({
    password: "test",
    certificate: "MIIJqQIBAzCCCW8",
    appId: "1c658734-6926-48b3-9040-d44fe3580c7a",
  });

  assert.equal(redacted.password, "*****");
  assert.equal(redacted.certificate, "*****");
  assert.equal(redacted.appId, "1c658734-6926-48b3-9040-d44fe3580c7a");
});

test("The translator key is redacted, its endpoint and region are not", () => {
  const redacted = Logger.redact({
    multilingual: {
      enableTranslations: true,
      languages: ["nl-nl"],
      translator: {
        key: "416e855b974d4af0b892",
        endpoint: "https://example.cognitiveservices.azure.com/",
        region: "global",
      },
    },
  });

  assert.equal(redacted.multilingual.translator.key, "*****");
  assert.equal(
    redacted.multilingual.translator.endpoint,
    "https://example.cognitiveservices.azure.com/"
  );
  assert.equal(redacted.multilingual.translator.region, "global");
  assert.deepEqual(redacted.multilingual.languages, ["nl-nl"]);
});

test("Values which merely contain a secret are left alone", () => {
  // Masking by value turned a menu id of "tests" into "*****s" when the
  // password happened to be "test"
  const redacted = Logger.redact({
    password: "test",
    menu: { QuickLaunch: { items: [{ id: "tests", name: "Test pages" }] } },
  });

  assert.equal(redacted.menu.QuickLaunch.items[0].id, "tests");
  assert.equal(redacted.menu.QuickLaunch.items[0].name, "Test pages");
  assert.equal(redacted.password, "*****");
});

test("Empty and missing secrets stay recognisable", () => {
  const redacted = Logger.redact({ password: "", certificate: null, key: undefined });

  assert.equal(redacted.password, "");
  assert.equal(redacted.certificate, null);
  assert.equal(redacted.key, undefined);
});

test("Redacting does not modify the settings it is given", () => {
  const options = { password: "test", multilingual: { translator: { key: "abc" } } };
  Logger.redact(options);

  assert.equal(options.password, "test");
  assert.equal(options.multilingual.translator.key, "abc");
});

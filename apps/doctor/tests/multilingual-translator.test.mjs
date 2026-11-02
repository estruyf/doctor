import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AccessToken } from "../dist/helpers/AccessToken.js";
import { ApiHelper } from "../dist/helpers/ApiHelper.js";
import { MultilingualHelper } from "../dist/helpers/MultilingualHelper.js";
import { PartialsHelper } from "../dist/helpers/PartialsHelper.js";
import { Translator } from "../dist/helpers/Translator.js";
import { StatusHelper } from "../dist/helpers/StatusHelper.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

/** Keeps linkPage away from SharePoint, the locale handling is what matters. */
const stubSharePoint = (t) => {
  const token = AccessToken.get;
  const get = ApiHelper.getOrThrow;
  AccessToken.get = async () => "token";
  ApiHelper.getOrThrow = async () => ({ Translations: { Items: [] } });
  t.after(() => {
    AccessToken.get = token;
    ApiHelper.getOrThrow = get;
  });
};

const sourcePage = async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-translator-"));
  const file = join(startFolder, "home.md");
  await writeFile(file, `---\ntitle: Home\nslug: home.aspx\n---\n\n# Home\n`, {
    encoding: "utf-8",
  });
  return file;
};

test("A locale without a language file is reported when no translator is configured", async (t) => {
  stubSharePoint(t);
  const file = await sourcePage();
  StatusHelper.reset();
  t.after(() => StatusHelper.reset());

  await MultilingualHelper.linkPage(
    { "fr-fr": null, "es-es": null },
    file,
    "home.aspx",
    {
      webUrl: WEB_URL,
      multilingual: { enableTranslations: true, translator: null },
    },
    {},
    {}
  );

  const warnings = StatusHelper.getWarnings();
  // Both locales are reported, one failing locale does not hide the next
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /"fr-fr" localization of "home.aspx"/);
  assert.match(warnings[0], /no translator is configured/);
  assert.match(warnings[1], /"es-es" localization of "home.aspx"/);
});

test("Incomplete translator settings name what is missing", async (t) => {
  stubSharePoint(t);
  const file = await sourcePage();
  StatusHelper.reset();
  t.after(() => StatusHelper.reset());

  await MultilingualHelper.linkPage(
    { "fr-fr": null },
    file,
    "home.aspx",
    {
      webUrl: WEB_URL,
      multilingual: {
        enableTranslations: true,
        translator: { endpoint: "https://api.cognitive.microsofttranslator.com" },
      },
    },
    {},
    {}
  );

  const warnings = StatusHelper.getWarnings();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing: key, region/);
});

test("A locale with a language file is not reported as missing a translator", async (t) => {
  stubSharePoint(t);
  const file = await sourcePage();
  StatusHelper.reset();
  t.after(() => StatusHelper.reset());

  // No language file on disk, so this raises instead of warning about the translator
  await assert.rejects(
    () =>
      MultilingualHelper.linkPage(
        { "nl-nl": "./home.nl.lang.md" },
        file,
        "home.aspx",
        {
          webUrl: WEB_URL,
          multilingual: { enableTranslations: true, translator: null },
        },
        {},
        {}
      ),
    /cannot be found/
  );
  assert.deepEqual(StatusHelper.getWarnings(), []);
});

test("A machine translated page gets its partials injected before translating", async (t) => {
  stubSharePoint(t);

  const root = await mkdtemp(join(tmpdir(), "doctor-machine-partials-"));
  const startFolder = join(root, "src");
  const partialsFolder = join(root, "partials");
  await mkdir(startFolder);
  await mkdir(partialsFolder);

  const file = join(startFolder, "home.md");
  await writeFile(file, `---\ntitle: Home\nslug: home.aspx\n---\n\n# Home\n`, {
    encoding: "utf-8",
  });
  await writeFile(join(partialsFolder, "banner.md"), `Published with Doctor`, {
    encoding: "utf-8",
  });
  await writeFile(join(partialsFolder, "navigation.md"), `- [Home](/home)`, {
    encoding: "utf-8",
  });

  const options = {
    webUrl: WEB_URL,
    startFolder,
    partials: { folder: partialsFolder, header: "banner", footer: "navigation" },
    multilingual: {
      enableTranslations: true,
      languages: [1036],
      translator: {
        key: "key",
        endpoint: "https://example.cognitiveservices.azure.com",
        region: "global",
      },
    },
  };

  PartialsHelper.reset();
  PartialsHelper.init(options);
  t.after(() => PartialsHelper.reset());

  // Capture what the translator is asked to translate
  const sent = [];
  const original = Translator.translate;
  Translator.translate = async (endpoint, key, language, contents) => {
    sent.push(contents);
    return null;
  };
  t.after(() => {
    Translator.translate = original;
  });

  StatusHelper.reset();
  t.after(() => StatusHelper.reset());

  await MultilingualHelper.linkPage(
    { "fr-fr": null },
    file,
    "home.aspx",
    options,
    {},
    {}
  );

  // The page body is the second call, the first one is the title. The body is
  // converted to HTML before it goes to the translator.
  const body = sent.find((c) => c && c.includes("Home") && c.length > 20);
  assert.ok(body, "the page body was sent to the translator");
  assert.match(body, /Published with Doctor/);
  assert.match(body, /<a href="\.\/home">Home<\/a>/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { MarkdownHelper } from "../dist/helpers/MarkdownHelper.js";
import { MultilingualHelper } from "../dist/helpers/MultilingualHelper.js";
import { PrecheckHelper } from "../dist/helpers/PrecheckHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";
import { isLanguageFile } from "../dist/utils/isLanguageFile.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

const SOURCE = `---
title: Home
slug: home.aspx

localization:
  "nl-nl": ./home.nl.lang.md
---

# Home
`;

const TRANSLATION = `---
title: Home
type: translation
---

# Welkom
`;

const PLAIN = `---
title: Codeblocks
slug: codeblocks.aspx
---

# Codeblocks
`;

/**
 * Creates a source page with a linked Dutch translation file, next to a page
 * without any localization.
 */
const createContentFolder = async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-multilingual-"));
  const sourceFile = join(startFolder, "home.md");
  const langFile = join(startFolder, "home.nl.lang.md");
  const plainFile = join(startFolder, "codeblocks.md");

  await writeFile(sourceFile, SOURCE, { encoding: "utf-8" });
  await writeFile(langFile, TRANSLATION, { encoding: "utf-8" });
  await writeFile(plainFile, PLAIN, { encoding: "utf-8" });

  return { startFolder, sourceFile, langFile, plainFile };
};

/** Records the linkPage calls instead of talking to SharePoint. */
const captureLinkPage = (t) => {
  const calls = [];
  const original = MultilingualHelper.linkPage;
  MultilingualHelper.linkPage = async (localization, file, slug) => {
    calls.push({ localization, file, slug });
  };
  t.after(() => {
    MultilingualHelper.linkPage = original;
  });
  return calls;
};

test("Language files are part of the markdown scan", async () => {
  const { startFolder, sourceFile, langFile, plainFile } =
    await createContentFolder();
  await writeFile(
    join(startFolder, "home.nl.machinetranslated.md"),
    TRANSLATION,
    { encoding: "utf-8" }
  );

  const ctx = {};
  await MarkdownHelper.fetchMDFiles(ctx, {}, startFolder);

  assert.deepEqual(
    ctx.files.sort(),
    [sourceFile, langFile, plainFile].sort()
  );
});

test("Language files are never processed as pages of their own", async (t) => {
  const { startFolder, sourceFile, langFile, plainFile } =
    await createContentFolder();
  t.after(() => StateHelper.reset());

  StateHelper.reset();
  StateHelper.state = { version: 1, pages: {} };
  StateHelper.loaded = true;

  const plan = await DoctorTranspiler.buildProcessingPlan(
    [sourceFile, langFile, plainFile],
    { webUrl: WEB_URL, startFolder },
    { navigation: { QuickLaunch: { items: [] } } }
  );

  assert.deepEqual(plan.filesToProcess.sort(), [sourceFile, plainFile].sort());
});

test("The translation phase runs for a source page which was skipped as unchanged", async (t) => {
  const { startFolder, sourceFile } = await createContentFolder();
  const calls = captureLinkPage(t);
  t.after(() => StateHelper.reset());

  // The source page is already published and unchanged, which is exactly the
  // case that used to leave the translation behind
  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    pages: {
      "home.aspx": {
        sourceHash: StateHelper.hashContent(SOURCE),
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  StateHelper.loaded = true;

  const options = {
    webUrl: WEB_URL,
    startFolder,
    multilingual: { enableTranslations: true },
  };

  const plan = await DoctorTranspiler.buildProcessingPlan(
    [sourceFile],
    options,
    { navigation: { QuickLaunch: { items: [] } } }
  );
  assert.deepEqual(plan.filesToProcess, []);

  const task = {};
  await DoctorTranspiler.processTranslations([sourceFile], task, options, {});

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, sourceFile);
  assert.equal(calls[0].slug, "home.aspx");
  assert.deepEqual(calls[0].localization, { "nl-nl": "./home.nl.lang.md" });
});

test("The translation phase skips pages without a localization reference", async (t) => {
  const { startFolder, sourceFile, langFile, plainFile } =
    await createContentFolder();
  const calls = captureLinkPage(t);

  const options = {
    webUrl: WEB_URL,
    startFolder,
    multilingual: { enableTranslations: true },
  };

  await DoctorTranspiler.processTranslations(
    [sourceFile, langFile, plainFile],
    {},
    options,
    {}
  );

  assert.deepEqual(
    calls.map((c) => c.file),
    [sourceFile]
  );
});

test("The translation phase does nothing when translations are disabled", async (t) => {
  const { startFolder, sourceFile } = await createContentFolder();
  const calls = captureLinkPage(t);

  await DoctorTranspiler.processTranslations(
    [sourceFile],
    {},
    { webUrl: WEB_URL, startFolder, multilingual: { enableTranslations: false } },
    {}
  );
  assert.deepEqual(calls, []);

  await DoctorTranspiler.processTranslations(
    [sourceFile],
    {},
    { webUrl: WEB_URL, startFolder },
    {}
  );
  assert.deepEqual(calls, []);
});

test("A language file is identified by its name, not by its front matter type", async () => {
  // The sample content uses both `type: translation` and `type: localization`,
  // which is exactly why the file name is what decides
  assert.equal(isLanguageFile("/src/home.nl.lang.md"), true);
  assert.equal(isLanguageFile("/src/doctor/installation.NL.LANG.MD"), true);
  assert.equal(isLanguageFile("/src/home.md"), false);
  assert.equal(isLanguageFile("/src/home.nl.machinetranslated.md"), false);
});

test("A language file never collides with the slug of its source page", async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-multilingual-slug-"));
  const sourceFile = join(startFolder, "installation.md");
  const langFile = join(startFolder, "installation.nl.lang.md");

  await writeFile(
    sourceFile,
    `---\ntitle: Installation\nslug: installation.aspx\n\nlocalization:\n  "nl-nl": ./installation.nl.lang.md\n---\n\n# Installation\n`,
    { encoding: "utf-8" }
  );
  // Declares the same slug as its source page, and a type the code does not know
  await writeFile(
    langFile,
    `---\ntitle: Installatie\nslug: installation.aspx\ntype: localization\n---\n\n# Installatie\n`,
    { encoding: "utf-8" }
  );

  await PrecheckHelper.validate(
    { files: [sourceFile, langFile] },
    {},
    { startFolder }
  );
});

test("The translated slug prefers the one SharePoint already issued", async (t) => {
  t.after(() => StateHelper.reset());

  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    pages: {
      // SharePoint names the folder after the language, not the locale, and
      // keeps the translation next to its source page
      "nl/home.aspx": {
        sourceHash: "abc",
        publishedAt: "2026-01-01T00:00:00.000Z",
        translationOf: "home.aspx",
      },
      "fr/home.aspx": {
        sourceHash: "def",
        publishedAt: "2026-01-01T00:00:00.000Z",
        translationOf: "home.aspx",
      },
      "doctor/nl/installation.aspx": {
        sourceHash: "ghi",
        publishedAt: "2026-01-01T00:00:00.000Z",
        translationOf: "doctor/installation.aspx",
      },
    },
  };
  StateHelper.loaded = true;

  assert.equal(StateHelper.getTranslationSlug("home.aspx", "nl-nl"), "nl/home.aspx");
  assert.equal(StateHelper.getTranslationSlug("home.aspx", "fr-fr"), "fr/home.aspx");
  assert.equal(
    StateHelper.getTranslationSlug("doctor/installation.aspx", "nl-nl"),
    "doctor/nl/installation.aspx"
  );
  // Sites which use the full locale as their language folder are matched too
  StateHelper.state.pages["doctor/pt-br/options.aspx"] = {
    sourceHash: "jkl",
    publishedAt: "2026-01-01T00:00:00.000Z",
    translationOf: "doctor/options.aspx",
  };
  assert.equal(
    StateHelper.getTranslationSlug("doctor/options.aspx", "pt-br"),
    "doctor/pt-br/options.aspx"
  );

  // Falls back to the expected shape when the translation was never published
  assert.equal(
    StateHelper.getTranslationSlug("doctor/commands.aspx", "nl-nl"),
    "doctor/nl-nl/commands.aspx"
  );
  assert.equal(
    StateHelper.getTranslationSlug("home.aspx", "es-es"),
    "es-es/home.aspx"
  );
});

test("A published translation is not reported as a new page", async (t) => {
  t.after(() => StateHelper.reset());

  const hash = StateHelper.hashContent(TRANSLATION);

  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    pages: {
      "home.aspx": {
        sourceHash: StateHelper.hashContent(SOURCE),
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
      "nl/home.aspx": {
        sourceHash: hash,
        publishedAt: "2026-01-01T00:00:00.000Z",
        translationOf: "home.aspx",
      },
    },
  };
  StateHelper.loaded = true;

  const slug = StateHelper.getTranslationSlug("home.aspx", "nl-nl");
  assert.equal(StateHelper.isTracked(slug), true);
  assert.equal(StateHelper.hasChanged(slug, hash), false);
  // Only a changed language file, partial or page content marks it modified
  assert.equal(StateHelper.hasChanged(slug, "changed"), true);
});

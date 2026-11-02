import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";

const entry = (extra = {}) => ({
  sourceHash: "hash",
  publishedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const primeState = (pages) => {
  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    site: "https://contoso.sharepoint.com/sites/docs",
    configHash: null,
    pages,
  };
  StateHelper.loaded = true;
};

test("Tracked pages without a local file are reported as deleted", (t) => {
  primeState({
    "index.aspx": entry(),
    "docs/removed.aspx": entry(),
  });
  t.after(() => StateHelper.reset());

  assert.deepEqual(StateHelper.getDeletedSlugs(["index.aspx"]), [
    "docs/removed.aspx",
  ]);
});

test("Slugs are matched case insensitively", (t) => {
  primeState({ "Docs/Page.aspx": entry() });
  t.after(() => StateHelper.reset());

  assert.deepEqual(StateHelper.getDeletedSlugs(["docs/page.aspx"]), []);
});

test("Translations are kept as long as their source page exists", (t) => {
  primeState({
    "index.aspx": entry(),
    "nl/index.aspx": entry({ translationOf: "index.aspx" }),
  });
  t.after(() => StateHelper.reset());

  assert.deepEqual(StateHelper.getDeletedSlugs(["index.aspx"]), []);
});

test("Translations of a removed source page are reported as deleted", (t) => {
  primeState({
    "index.aspx": entry(),
    "nl/index.aspx": entry({ translationOf: "index.aspx" }),
  });
  t.after(() => StateHelper.reset());

  assert.deepEqual(StateHelper.getDeletedSlugs(["other.aspx"]).sort(), [
    "index.aspx",
    "nl/index.aspx",
  ]);
});

test("Untracked translations from older state are kept on multilingual sites", (t) => {
  // State written before translations were linked to their source page
  primeState({
    "docs/index.aspx": entry(),
    "nl/docs/index.aspx": entry(),
  });
  t.after(() => StateHelper.reset());

  assert.deepEqual(
    StateHelper.getDeletedSlugs(["docs/index.aspx"], { multilingual: true }),
    []
  );
  assert.deepEqual(StateHelper.getDeletedSlugs(["docs/index.aspx"]), [
    "nl/docs/index.aspx",
  ]);
});

test("Nothing is reported as deleted when no state got loaded", (t) => {
  StateHelper.reset();
  t.after(() => StateHelper.reset());

  assert.deepEqual(StateHelper.getDeletedSlugs([]), []);
});

test("Recycled pages are dropped from the state", (t) => {
  primeState({ "index.aspx": entry(), "docs/removed.aspx": entry() });
  t.after(() => StateHelper.reset());

  assert.equal(StateHelper.removeTracked("docs/removed.aspx"), true);
  assert.equal(StateHelper.removeTracked("docs/removed.aspx"), false);
  assert.deepEqual(StateHelper.getTrackedSlugs(), ["index.aspx"]);
  assert.equal(StateHelper.isDirty(), true);
});

test("Local slugs are collected from the markdown files", async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-deleted-"));
  const docsFolder = join(startFolder, "docs");
  await mkdir(docsFolder);

  await writeFile(
    join(startFolder, "index.md"),
    `---\ntitle: Home\n---\n\n# Home\n`,
    { encoding: "utf-8" }
  );
  await writeFile(
    join(docsFolder, "page.md"),
    `---\ntitle: Page\nslug: docs/custom.aspx\n---\n\n# Page\n`,
    { encoding: "utf-8" }
  );
  await writeFile(
    join(docsFolder, "page.nl.md"),
    `---\ntitle: Pagina\ntype: translation\n---\n\n# Pagina\n`,
    { encoding: "utf-8" }
  );

  const { slugs, unresolved } = await DoctorTranspiler.collectLocalSlugs(
    [
      join(startFolder, "index.md"),
      join(docsFolder, "page.md"),
      join(docsFolder, "page.nl.md"),
    ],
    { startFolder }
  );

  // Without a slug in the front matter, the title is used to build one
  assert.deepEqual(slugs.sort(), ["docs/custom.aspx", "home.aspx"]);
  assert.deepEqual(unresolved, []);
});

test("Files without a title are reported as unresolved", async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-deleted-"));
  const noTitleFile = join(startFolder, "no-title.md");
  await writeFile(noTitleFile, `---\ndraft: true\n---\n\n# No title\n`, {
    encoding: "utf-8",
  });

  const { slugs, unresolved } = await DoctorTranspiler.collectLocalSlugs(
    [noTitleFile],
    { startFolder }
  );

  assert.deepEqual(slugs, []);
  assert.deepEqual(unresolved, [noTitleFile]);
});

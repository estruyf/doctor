import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DependencyHelper } from "../dist/helpers/DependencyHelper.js";
import { PartialsHelper } from "../dist/helpers/PartialsHelper.js";

const page = (title, body) => `---\ntitle: ${title}\n---\n\n${body}\n`;

const setup = async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-deps-"));
  await mkdir(join(startFolder, "assets"), { recursive: true });
  return { startFolder, options: { startFolder } };
};

const fresh = () => {
  DependencyHelper.reset();
  PartialsHelper.reset();
};

const hashOf = async (file, contents, options) => {
  fresh();
  return (await DependencyHelper.getPageHash(file, contents, options)).hash;
};

test("a page's hash changes when an image it uses changes", async () => {
  const { startFolder, options } = await setup();
  const file = join(startFolder, "index.md");
  const image = join(startFolder, "assets", "logo.png");
  const contents = page("Home", "![Logo](./assets/logo.png)");

  await writeFile(file, contents);
  await writeFile(image, "first");
  const before = await hashOf(file, contents, options);

  await writeFile(image, "second");
  const after = await hashOf(file, contents, options);

  assert.notEqual(before, after, "the page should count as changed");
});

test("an image is hashed once per run, not per page that uses it", async () => {
  const { startFolder } = await setup();
  const image = join(startFolder, "assets", "logo.png");

  fresh();
  await writeFile(image, "first");
  const first = await DependencyHelper.hashFile(image);

  // Changing it now must not be picked up until the next run
  await writeFile(image, "second");
  assert.equal(await DependencyHelper.hashFile(image), first);

  fresh();
  assert.notEqual(await DependencyHelper.hashFile(image), first);
});

test("an image that does not exist still counts, so adding it is a change", async () => {
  const { startFolder, options } = await setup();
  const file = join(startFolder, "index.md");
  const image = join(startFolder, "assets", "later.png");
  const contents = page("Home", "![Later](./assets/later.png)");

  await writeFile(file, contents);
  const before = await hashOf(file, contents, options);

  await writeFile(image, "now it exists");
  const after = await hashOf(file, contents, options);

  assert.notEqual(before, after);
});

test("a page's hash changes when a page it links to is renamed", async () => {
  const { startFolder, options } = await setup();
  const file = join(startFolder, "index.md");
  const target = join(startFolder, "other.md");
  const contents = page("Home", "[Other](./other.md)");

  await writeFile(file, contents);
  await writeFile(target, page("Other", "Body"));
  const before = await hashOf(file, contents, options);

  // The linking page is untouched; only the target's slug moves
  await writeFile(target, `---\ntitle: Other\nslug: renamed.aspx\n---\n\nBody\n`);
  const after = await hashOf(file, contents, options);

  assert.notEqual(before, after, "the linking page should count as changed");
});

test("a page's hash is unmoved by an unrelated file", async () => {
  const { startFolder, options } = await setup();
  const file = join(startFolder, "index.md");
  const contents = page("Home", "Just text");

  await writeFile(file, contents);
  const before = await hashOf(file, contents, options);

  await writeFile(join(startFolder, "unrelated.md"), page("Other", "Body"));
  const after = await hashOf(file, contents, options);

  assert.equal(before, after);
});

test("the same page hashes the same twice", async () => {
  const { startFolder, options } = await setup();
  const file = join(startFolder, "index.md");
  const contents = page("Home", "![Logo](./assets/logo.png)");

  await writeFile(file, contents);
  await writeFile(join(startFolder, "assets", "logo.png"), "same");

  assert.equal(
    await hashOf(file, contents, options),
    await hashOf(file, contents, options),
  );
});

test("the config hash follows the markdown settings", async () => {
  const { startFolder } = await setup();

  fresh();
  const dark = await DependencyHelper.getConfigHash({
    startFolder,
    markdown: { theme: "dark" },
  });

  fresh();
  const light = await DependencyHelper.getConfigHash({
    startFolder,
    markdown: { theme: "light" },
  });

  assert.notEqual(dark, light);
});

test("the config hash follows the web part title", async () => {
  const { startFolder } = await setup();

  fresh();
  const a = await DependencyHelper.getConfigHash({
    startFolder,
    webPartTitle: "doctor-placeholder",
  });
  fresh();
  const b = await DependencyHelper.getConfigHash({
    startFolder,
    webPartTitle: "content",
  });

  assert.notEqual(a, b);
});

test("the config hash follows a custom shortcode's code", async () => {
  const { startFolder } = await setup();
  const folder = join(startFolder, "shortcodes");
  await mkdir(folder, { recursive: true });
  const shortcode = join(folder, "hello.cjs");

  await writeFile(shortcode, `module.exports = { name: "hello", render: () => "a" };`);
  fresh();
  const before = await DependencyHelper.getConfigHash({
    startFolder,
    shortcodesFolder: folder,
  });

  await writeFile(shortcode, `module.exports = { name: "hello", render: () => "b" };`);
  fresh();
  const after = await DependencyHelper.getConfigHash({
    startFolder,
    shortcodesFolder: folder,
  });

  assert.notEqual(before, after, "a changed shortcode changes what pages render");
});

test("the config hash is stable when nothing relevant moved", async () => {
  const { startFolder } = await setup();
  const options = { startFolder, webPartTitle: "doctor-placeholder" };

  fresh();
  const a = await DependencyHelper.getConfigHash(options);
  fresh();
  const b = await DependencyHelper.getConfigHash({ ...options });

  assert.equal(a, b);
});

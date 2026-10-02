import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliCommand } from "../dist/helpers/CliCommand.js";
import { DependencyHelper } from "../dist/helpers/DependencyHelper.js";
import { FileHelpers } from "../dist/helpers/FileHelpers.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";

/**
 * Change detection republishes a page when an image it uses changes, but the
 * upload went by name alone: a file already in the library was kept unless
 * `--overwriteImages` was set, so the republished page still showed the old
 * image. The state now records what was uploaded, per file.
 */
const webUrl = "https://contoso.sharepoint.com/sites/docs";
const folder = "SiteAssets/img";
const libraryPath = `${folder}/logo.png`;

const sha = (value) => createHash("sha256").update(value).digest("hex");

/**
 * A stand-in for the CLI for Microsoft 365, spawned the way any other
 * `--commandName` is. It logs every command, and `spo file get` only finds
 * the files listed in FAKE_CLI_EXISTING.
 */
const fakeCli = `#!/usr/bin/env node
const { appendFileSync } = require("fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(args) + "\\n");
const url = args[args.indexOf("--url") + 1] || "";
const existing = (process.env.FAKE_CLI_EXISTING || "").split(",").filter(Boolean);
if (args[0] === "spo" && args[1] === "file" && args[2] === "get" && !existing.some((e) => url.endsWith(e))) {
  process.stderr.write("File Not Found.");
  process.exit(1);
}
process.stdout.write("{}");
`;

const setup = async (t, { image = "new", inLibrary = true, assets, loaded = true } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-assets-"));
  const cli = join(dir, "fake-m365.cjs");
  const log = join(dir, "calls.log");
  await writeFile(cli, fakeCli, "utf-8");
  await chmod(cli, 0o755);
  await writeFile(log, "", "utf-8");

  const imgPath = join(dir, "logo.png");
  await writeFile(imgPath, image, "utf-8");

  process.env.FAKE_CLI_LOG = log;
  process.env.FAKE_CLI_EXISTING = inLibrary ? libraryPath : "";

  FileHelpers.reset();
  DependencyHelper.reset();
  StateHelper.reset();
  CliCommand.reset();
  CliCommand.init({ commandName: cli });

  if (loaded) {
    StateHelper.state = {
      version: 1,
      site: webUrl,
      configHash: null,
      pages: {},
      ...(assets ? { assets } : {}),
    };
    StateHelper.loaded = true;
  }

  t.after(() => {
    FileHelpers.reset();
    DependencyHelper.reset();
    StateHelper.reset();
    CliCommand.reset();
    delete process.env.FAKE_CLI_LOG;
    delete process.env.FAKE_CLI_EXISTING;
  });

  const calls = async () =>
    (await readFile(log, "utf-8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).slice(0, 3).join(" "));

  return { imgPath, calls };
};

const skip = process.platform === "win32" && "the fake CLI is a shebang script";

test("an image that changed since its upload goes up again without --overwriteImages", { skip }, async (t) => {
  const { imgPath, calls } = await setup(t, {
    image: "new",
    assets: { "siteassets/img/logo.png": sha("old") },
  });

  await FileHelpers.create(folder, imgPath, webUrl, false);

  assert.deepEqual(await calls(), ["spo file add"]);
  assert.equal(StateHelper.getAssetHash(libraryPath), sha("new"));
  assert.equal(StateHelper.isDirty(), true);
});

test("an unchanged image already in the library is not uploaded again", { skip }, async (t) => {
  const { imgPath, calls } = await setup(t, {
    image: "same",
    assets: { "siteassets/img/logo.png": sha("same") },
  });

  await FileHelpers.create(folder, imgPath, webUrl, false);

  assert.deepEqual(await calls(), ["spo file get"]);
  assert.equal(StateHelper.isDirty(), false);
});

test("an unchanged image removed from the library is uploaded again", { skip }, async (t) => {
  const { imgPath, calls } = await setup(t, {
    image: "same",
    inLibrary: false,
    assets: { "siteassets/img/logo.png": sha("same") },
  });

  await FileHelpers.create(folder, imgPath, webUrl, false);

  assert.deepEqual(await calls(), ["spo file get", "spo file add"]);
});

test("state without asset hashes uploads an image once, then records it", { skip }, async (t) => {
  const { imgPath, calls } = await setup(t, { image: "img" });

  await FileHelpers.create(folder, imgPath, webUrl, false);
  assert.deepEqual(await calls(), ["spo file add"]);
  assert.equal(StateHelper.getAssetHash(libraryPath), sha("img"));

  // Same run, used by another page: neither checked nor uploaded again
  await FileHelpers.create(folder, imgPath, webUrl, false);
  assert.deepEqual(await calls(), ["spo file add"]);

  // Next run, with the state that run saved
  FileHelpers.reset();
  DependencyHelper.reset();
  await FileHelpers.create(folder, imgPath, webUrl, false);
  assert.deepEqual(await calls(), ["spo file add", "spo file get"]);
});

test("without a loaded state, an image in the library is kept as before", { skip }, async (t) => {
  // --disableStatePersistence: a recorded hash would never be saved, so
  // tracking would upload every image on every run
  const { imgPath, calls } = await setup(t, { loaded: false });

  await FileHelpers.create(folder, imgPath, webUrl, false);

  assert.deepEqual(await calls(), ["spo file get"]);
  assert.equal(StateHelper.getAssetHash(libraryPath), null);
});

test("--overwriteImages uploads, and records the hash for runs without it", { skip }, async (t) => {
  const { imgPath, calls } = await setup(t, {
    image: "same",
    assets: { "siteassets/img/logo.png": sha("same") },
  });

  await FileHelpers.create(folder, imgPath, webUrl, true);

  assert.deepEqual(await calls(), ["spo file add"]);
  assert.equal(StateHelper.getAssetHash(libraryPath), sha("same"));
});

test("a local image that cannot be read falls back to the library check", { skip }, async (t) => {
  const { calls } = await setup(t, {
    assets: { "siteassets/img/logo.png": sha("old") },
  });

  await FileHelpers.create(folder, "/does/not/exist/logo.png", webUrl, false);

  assert.deepEqual(await calls(), ["spo file get"]);
  assert.equal(StateHelper.getAssetHash(libraryPath), sha("old"));
});

test("asset hashes are matched regardless of case and slashes", (t) => {
  t.after(() => StateHelper.reset());
  StateHelper.reset();
  StateHelper.state = { version: 1, site: webUrl, configHash: null, pages: {} };
  StateHelper.loaded = true;

  assert.equal(StateHelper.getAssetHash("SiteAssets/Img/Logo.png"), null);

  StateHelper.setAssetHash("/SiteAssets/Img/Logo.png", "abc");
  assert.equal(StateHelper.getAssetHash("siteassets/img/logo.png"), "abc");
  assert.deepEqual(StateHelper.state.assets, { "siteassets/img/logo.png": "abc" });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  getAssetFolders,
  ASSETS_FALLBACK_FOLDER,
} from "../dist/utils/getAssetFolders.js";

const START = "/Users/dmitriy/repos/involv/intranet/docs/content";

test("an asset next to its page gets no folders of its own", () => {
  assert.deepEqual(getAssetFolders(START, START), []);
});

test("an asset in the content folder keeps the structure it has there", () => {
  assert.deepEqual(getAssetFolders(START, `${START}/guides/img`), [
    "guides",
    "img",
  ]);
});

const ROOT = "/Users/dmitriy/repos/involv/intranet";

test("an asset from outside the content folder goes in the shared folder", () => {
  // `../assets/involv.png` from the top of the content folder. Taking the path
  // literally uploaded it to Users/dmitriy/repos/... — the publishing machine's
  // own directory tree, which means nothing on SharePoint
  assert.deepEqual(getAssetFolders(START, `${ROOT}/docs/assets`, ROOT), [
    ASSETS_FALLBACK_FOLDER,
    "docs",
    "assets",
  ]);
  assert.equal(ASSETS_FALLBACK_FOLDER, "assets");
});

test("two outside folders with the same file name do not become one file", () => {
  // Collapsing every outside folder onto `assets` made ../shared/brand/logo.png
  // and ../other/brand/logo.png the same upload, so whichever went second
  // overwrote the first or was skipped, and both pages showed one image
  const shared = getAssetFolders(START, `${ROOT}/shared/brand`, ROOT);
  const other = getAssetFolders(START, `${ROOT}/other/brand`, ROOT);

  assert.deepEqual(shared, [ASSETS_FALLBACK_FOLDER, "shared", "brand"]);
  assert.deepEqual(other, [ASSETS_FALLBACK_FOLDER, "other", "brand"]);
  assert.notDeepEqual(shared, other);
});

test("a folder outside the project too keeps a name of its own", () => {
  // Nothing left to mirror, so the path is digested rather than dropped — two
  // of them still cannot land on each other
  const a = getAssetFolders(START, "/elsewhere/brand", ROOT);
  const b = getAssetFolders(START, "/somewhere-else/brand", ROOT);

  assert.equal(a[0], ASSETS_FALLBACK_FOLDER);
  assert.equal(a.length, 2);
  assert.notDeepEqual(a, b);
  // ...and the same folder always gets the same name
  assert.deepEqual(a, getAssetFolders(START, "/elsewhere/brand", ROOT));
});

test("a folder that only shares a prefix is still outside", () => {
  assert.deepEqual(getAssetFolders(START, `${START}-old/img`, ROOT), [
    ASSETS_FALLBACK_FOLDER,
    "docs",
    "content-old",
    "img",
  ]);
});

test("windows separators are handled like any other", () => {
  assert.deepEqual(
    getAssetFolders("C:\\repos\\docs\\content", "C:\\repos\\docs\\content\\img"),
    ["img"],
  );
  assert.deepEqual(
    getAssetFolders(
      "C:\\repos\\docs\\content",
      "C:\\repos\\docs\\assets",
      "C:\\repos",
    ),
    [ASSETS_FALLBACK_FOLDER, "docs", "assets"],
  );
});

test("a trailing separator on the content folder changes nothing", () => {
  assert.deepEqual(getAssetFolders(`${START}/`, `${START}/img`), ["img"]);
});

test("no content folder means no folders to mirror", () => {
  assert.deepEqual(getAssetFolders("", `${START}/img`, ROOT), []);
});

//
// The shapes the publish actually produces
//
// Every case above uses absolute paths, which is why a mismatch between the
// two sides went unnoticed: `--folder` keeps what was configured (`./src` by
// default) while `path.join` strips the `./` off the paths built from it, so
// `./src` was never a prefix of `src/guides/img` and every image in the content
// folder was treated as one from outside it.
//

const PROJECT = "/Users/dmitriy/repos/project";

test("the default configuration mirrors the content structure", () => {
  // startFolder: "./src" — what `doctor init` writes
  // assetDirectory: join(dirname("./src/guides/page.md"), "./img") => "src/guides/img"
  assert.deepEqual(getAssetFolders("./src", "src/guides/img", PROJECT), [
    "guides",
    "img",
  ]);
});

test("a configured content folder mirrors the same way", () => {
  assert.deepEqual(
    getAssetFolders("./docs/content", "docs/content/guides/img", PROJECT),
    ["guides", "img"],
  );
  assert.deepEqual(
    getAssetFolders("docs/content", "docs/content/img", PROJECT),
    ["img"],
  );
});

test("a relative and an absolute side still mean the same folder", () => {
  assert.deepEqual(
    getAssetFolders("./src", `${PROJECT}/src/guides/img`, PROJECT),
    ["guides", "img"],
  );
  assert.deepEqual(
    getAssetFolders(`${PROJECT}/src`, "src/guides/img", PROJECT),
    ["guides", "img"],
  );
});

test("an image next to its page gets no folders, whichever way the path is written", () => {
  assert.deepEqual(getAssetFolders("./src", "src", PROJECT), []);
  assert.deepEqual(getAssetFolders("./src", "./src", PROJECT), []);
  assert.deepEqual(getAssetFolders("./src", `${PROJECT}/src`, PROJECT), []);
});

test("relative outside folders stay apart from each other", () => {
  assert.deepEqual(getAssetFolders("./src", "shared/brand", PROJECT), [
    ASSETS_FALLBACK_FOLDER,
    "shared",
    "brand",
  ]);
  assert.deepEqual(getAssetFolders("./src", "other/brand", PROJECT), [
    ASSETS_FALLBACK_FOLDER,
    "other",
    "brand",
  ]);
});

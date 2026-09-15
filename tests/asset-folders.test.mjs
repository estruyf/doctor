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

test("an asset from outside the content folder goes in the shared folder", () => {
  // `../assets/involv.png` from the top of the content folder. Taking the path
  // literally uploaded it to Users/dmitriy/repos/... — the publishing machine's
  // own directory tree, which means nothing on SharePoint
  assert.deepEqual(
    getAssetFolders(START, "/Users/dmitriy/repos/involv/intranet/docs/assets"),
    [ASSETS_FALLBACK_FOLDER],
  );
  assert.equal(ASSETS_FALLBACK_FOLDER, "assets");
});

test("a folder that only shares a prefix is still outside", () => {
  assert.deepEqual(getAssetFolders(START, `${START}-old/img`), [
    ASSETS_FALLBACK_FOLDER,
  ]);
});

test("windows separators are handled like any other", () => {
  assert.deepEqual(
    getAssetFolders("C:\\repos\\docs\\content", "C:\\repos\\docs\\content\\img"),
    ["img"],
  );
  assert.deepEqual(
    getAssetFolders("C:\\repos\\docs\\content", "C:\\repos\\docs\\assets"),
    [ASSETS_FALLBACK_FOLDER],
  );
});

test("a trailing separator on the content folder changes nothing", () => {
  assert.deepEqual(getAssetFolders(`${START}/`, `${START}/img`), ["img"]);
});

test("no content folder means no folders to mirror", () => {
  assert.deepEqual(getAssetFolders("", `${START}/img`), []);
});

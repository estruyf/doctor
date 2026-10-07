import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { DependencyHelper } from "../dist/helpers/DependencyHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";

/**
 * `doctor status` answers "would the next publish do anything?", and a pipeline
 * gates on the answer. It can only answer it by asking exactly what the publish
 * asks — when the publish started folding images and linked slugs into the hash
 * and status did not, status reported a page as unchanged that the publish then
 * republished.
 */
const page = (title, body) => `---
title: ${title}
---

${body}
`;

const build = async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-status-"));
  await mkdir(join(startFolder, "img"));
  await writeFile(join(startFolder, "img", "logo.png"), "first", "utf-8");
  await writeFile(
    join(startFolder, "target.md"),
    page("Target", "The page being linked to."),
    "utf-8",
  );

  const file = join(startFolder, "page.md");
  const contents = page(
    "Page",
    "![logo](./img/logo.png)\n\nSee [target](./target.md).",
  );
  await writeFile(file, contents, "utf-8");

  return { startFolder, file, contents };
};

const hashOf = async (file, contents, options) => {
  DependencyHelper.reset();
  const { hash } = await DoctorTranspiler.getContentHash(
    file,
    contents,
    { title: "Page" },
    options,
  );
  return hash;
};

test("status asks the publish's own question about a changed image", async (t) => {
  t.after(() => {
    DependencyHelper.reset();
    StateHelper.reset();
  });

  const { startFolder, file, contents } = await build();
  const options = { startFolder, webUrl: "https://contoso.sharepoint.com/sites/d" };

  const before = await hashOf(file, contents, options);

  await writeFile(join(startFolder, "img", "logo.png"), "second", "utf-8");
  const after = await hashOf(file, contents, options);

  assert.notEqual(before, after, "a changed image has to show as modified");
});

test("status asks the publish's own question about a renamed target", async (t) => {
  t.after(() => {
    DependencyHelper.reset();
    StateHelper.reset();
  });

  const { startFolder, file, contents } = await build();
  const options = { startFolder, webUrl: "https://contoso.sharepoint.com/sites/d" };

  const before = await hashOf(file, contents, options);

  await writeFile(
    join(startFolder, "target.md"),
    `---\ntitle: Target\nslug: moved/elsewhere.aspx\n---\n\nThe page being linked to.\n`,
    "utf-8",
  );
  const after = await hashOf(file, contents, options);

  assert.notEqual(
    before,
    after,
    "a page whose link target moved has to show as modified",
  );
});

test("an untouched page keeps the same hash", async (t) => {
  t.after(() => {
    DependencyHelper.reset();
    StateHelper.reset();
  });

  const { file, contents, startFolder } = await build();
  const options = { startFolder, webUrl: "https://contoso.sharepoint.com/sites/d" };

  assert.equal(
    await hashOf(file, contents, options),
    await hashOf(file, contents, options),
  );
});

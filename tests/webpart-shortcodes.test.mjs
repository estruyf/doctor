import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ShortcodesHelpers } from "../dist/helpers/ShortcodesHelpers.js";

/**
 * `init()` resolves the shortcode files against the working directory, so the
 * fixture is loaded the way a consumer repo's `shortcodes` folder would be.
 */
const withShortcodes = async (files, assertions) => {
  const root = await mkdtemp(join(tmpdir(), "doctor-shortcodes-"));
  const cwd = process.cwd();

  await mkdir(join(root, "shortcodes"), { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(root, "shortcodes", name), contents, {
      encoding: "utf-8",
    });
  }

  try {
    process.chdir(root);
    await assertions();
  } finally {
    process.chdir(cwd);
    ShortcodesHelpers.reset();
    await rm(root, { recursive: true, force: true });
  }
};

const relatedPages = `module.exports = {
  name: "related-pages",
  kind: "webpart",
  render: (attributes) => ({
    standardWebPart: "ContentRollup",
    webPartProperties: { count: Number(attributes.count ?? 3) },
  }),
};`;

test("ShortcodesHelpers keeps the kind of a loaded shortcode", async () => {
  await withShortcodes({ "related-pages.cjs": relatedPages }, async () => {
    await ShortcodesHelpers.init("./shortcodes");

    assert.deepEqual(ShortcodesHelpers.getWebPartTags(), ["related-pages"]);
    assert.equal(ShortcodesHelpers.isWebPart("related-pages"), true);
    // The built-ins stay inline
    assert.equal(ShortcodesHelpers.isWebPart("callout"), false);
  });
});

test("ShortcodesHelpers does not render a web part shortcode as HTML", async () => {
  await withShortcodes({ "related-pages.cjs": relatedPages }, async () => {
    await ShortcodesHelpers.init("./shortcodes");

    // A web part shortcode returns a web part definition, not markup. If the
    // inline parser picked it up it would splice "[object Object]" into the page.
    for (const output of [
      await ShortcodesHelpers.parseBefore(`<related-pages count="5" />`),
      await ShortcodesHelpers.parseAfter(`<related-pages count="5" />`),
    ]) {
      assert.doesNotMatch(output, /\[object Object\]/);
      assert.match(output, /<related-pages/);
    }
  });
});

test("ShortcodesHelpers refuses an unknown shortcode kind", async () => {
  await withShortcodes(
    {
      "broken.cjs": `module.exports = { name: "broken", kind: "widget", render: () => "" };`,
    },
    async () => {
      await assert.rejects(
        () => ShortcodesHelpers.init("./shortcodes"),
        /Unknown kind "widget" for shortcode "broken"/,
      );
    },
  );
});

test("ShortcodesHelpers still loads a shortcode without a kind as inline", async () => {
  await withShortcodes(
    {
      "hello.cjs": `module.exports = { name: "hello", render: () => "<p>hi</p>" };`,
    },
    async () => {
      await ShortcodesHelpers.init("./shortcodes");

      assert.deepEqual(ShortcodesHelpers.getWebPartTags(), []);
      assert.equal(
        await ShortcodesHelpers.parseAfter(`<hello />`),
        `<p>hi</p>`,
      );
    },
  );
});

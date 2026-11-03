import test from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_SHORTCODES, CALLOUT_TYPES } from "@estruyf/doctor-common";
import { ShortcodesHelpers } from "../dist/helpers/ShortcodesHelpers.js";

/**
 * packages/common is what the VS Code extension offers while typing. doctor's
 * renderers are the truth, so the shared list is held to them here: a built-in
 * added, renamed or turned into a web part without the list fails this file.
 */

test("the shared shortcode list is exactly the shortcodes doctor ships", (t) => {
  t.after(() => ShortcodesHelpers.reset());
  ShortcodesHelpers.reset();

  const shipped = Object.entries(ShortcodesHelpers.get())
    .map(([tag, renderer]) => ({ tag, kind: renderer.kind ?? "inline" }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  const shared = BUILT_IN_SHORTCODES.map(({ tag, kind }) => ({ tag, kind })).sort((a, b) =>
    a.tag.localeCompare(b.tag),
  );

  assert.deepEqual(shared, shipped);
});

test("every shared callout type is styled as itself, anything else as a note", async (t) => {
  t.after(() => ShortcodesHelpers.reset());
  ShortcodesHelpers.reset();

  for (const type of CALLOUT_TYPES) {
    const html = await ShortcodesHelpers.parseAfter(`<callout type="${type.toUpperCase()}">x</callout>`);
    assert.match(html, new RegExp(`callout-${type}"`), type);
  }

  const html = await ShortcodesHelpers.parseAfter(`<callout type="warning">x</callout>`);
  assert.match(html, /callout-note"/);
});

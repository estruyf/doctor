import test from "node:test";
import assert from "node:assert/strict";

import { SegmentsHelper } from "../dist/helpers/SegmentsHelper.js";

const CONTROLS = ["related-pages", "events"];

test("SegmentsHelper leaves a page without control shortcodes untouched", () => {
  const markdown = `# Title\n\nSome content.\n\n<callout type="info">Inline shortcodes are not controls</callout>\n`;

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, "markdown");
  // Byte-for-byte what the single Markdown web part receives today
  assert.equal(segments[0].content, markdown);
});

test("SegmentsHelper leaves a page untouched when no control shortcodes are registered", () => {
  const markdown = `# Title\n\n<related-pages />\n`;

  const segments = SegmentsHelper.split(markdown, []);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, markdown);
});

test("SegmentsHelper cuts the page at a control shortcode", () => {
  const markdown = [
    `# Title`,
    ``,
    `Before the control.`,
    ``,
    `<related-pages />`,
    ``,
    `After the control.`,
  ].join("\n");

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], {
    type: "markdown",
    content: `# Title\n\nBefore the control.`,
  });
  assert.deepEqual(segments[1], {
    type: "control",
    shortcode: "related-pages",
    attributes: {},
  });
  assert.deepEqual(segments[2], {
    type: "markdown",
    content: `After the control.`,
  });
});

test("SegmentsHelper keeps the source order across several controls", () => {
  const markdown = [
    `Intro`,
    ``,
    `<related-pages />`,
    ``,
    `Middle`,
    ``,
    `<events />`,
    ``,
    `Outro`,
  ].join("\n");

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.deepEqual(
    segments.map((s) => (s.type === "control" ? s.shortcode : s.content)),
    ["Intro", "related-pages", "Middle", "events", "Outro"],
  );
});

test("SegmentsHelper does not emit empty markdown segments", () => {
  const markdown = `<related-pages />\n\n<events />\n`;

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => segment.type === "control"));
});

test("SegmentsHelper reads the attributes off the tag", () => {
  const markdown = `Text\n\n<related-pages count="5" tag="how-to" />`;

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.deepEqual(segments[1], {
    type: "control",
    shortcode: "related-pages",
    attributes: { count: "5", tag: "how-to" },
  });
});

test("SegmentsHelper accepts an empty paired tag", () => {
  const segments = SegmentsHelper.split(
    `Text\n\n<related-pages></related-pages>\n\nMore`,
    CONTROLS,
  );

  assert.equal(segments.length, 3);
  assert.equal(segments[1].type, "control");
});

test("SegmentsHelper ignores a control shortcode used as a code sample", () => {
  const markdown = [
    `Use it like this:`,
    ``,
    "```html",
    `<related-pages />`,
    "```",
    ``,
    "Or inline: `<related-pages />`.",
  ].join("\n");

  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, markdown);
});

test("SegmentsHelper refuses a control shortcode that is not on its own line", () => {
  for (const markdown of [
    `Related: <related-pages /> and more`,
    `- <related-pages />`,
    `> <related-pages />`,
    `  <related-pages />`,
    `<related-pages>with a body</related-pages>`,
  ]) {
    assert.throws(
      () => SegmentsHelper.split(markdown, CONTROLS),
      /has to be on a line of its own/,
      `expected a throw for: ${markdown}`,
    );
  }
});

test("SegmentsHelper reports which tags a document uses", () => {
  assert.equal(
    SegmentsHelper.hasTag(`Text\n\n<related-pages />`, CONTROLS),
    true,
  );
  // Wrapped in a paragraph it is still a use, just not a valid one
  assert.equal(SegmentsHelper.hasTag(`A <related-pages /> b`, CONTROLS), true);
  assert.equal(SegmentsHelper.hasTag(`<toc />`, ["toc"]), true);
  assert.equal(SegmentsHelper.hasTag(`Nothing here`, CONTROLS), false);
  // A code sample is not a use
  assert.equal(
    SegmentsHelper.hasTag("Like `<related-pages />` here", CONTROLS),
    false,
  );
  // A tag that only shares a prefix is a different shortcode
  assert.equal(
    SegmentsHelper.hasTag(`<related-pages-list />`, CONTROLS),
    false,
  );
});

test("SegmentsHelper reads an attribute value containing a > as part of the tag", () => {
  // A KQL query is the realistic case: `Size>1000` is a perfectly good value,
  // and the tag is still alone on its line — it used to be reported as a
  // shortcode sitting mid-paragraph instead
  const markdown = `Intro\n\n<related-pages query="Size>1000" path="/sites/docs" />\n\nOutro`;
  const segments = SegmentsHelper.split(markdown, CONTROLS);

  assert.deepEqual(
    segments.map((s) => s.type),
    ["markdown", "control", "markdown"],
  );
  assert.equal(segments[1].attributes.path, "/sites/docs");
});

test("SegmentsHelper reads an unquoted and a valueless attribute", () => {
  const segments = SegmentsHelper.split(`<related-pages count=5 compact />`, CONTROLS);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, "control");
  assert.equal(segments[0].attributes.count, "5");
});

test("SegmentsHelper reads an unquoted attribute value containing a slash", () => {
  // A server relative path is the realistic case, and it worked before the
  // quoted-value handling was tightened
  const segments = SegmentsHelper.split(
    `<related-pages path=/sites/docs count=5 />`,
    CONTROLS,
  );

  assert.equal(segments[0].type, "control");
  assert.equal(segments[0].attributes.path, "/sites/docs");
  assert.equal(segments[0].attributes.count, "5");
});

import test from "node:test";
import assert from "node:assert/strict";

import { ShortcodesHelpers } from "../dist/helpers/ShortcodesHelpers.js";

test("ShortcodesHelpers renders the shortcodes which are used in the content", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nflowchart TD\n  A[Write docs] --> B[Run doctor publish]\n</mermaid>`
  );

  assert.match(output, /<pre class="mermaid">/);
  assert.match(output, /A\[Write docs\] --> B\[Run doctor publish\]/);
});

test("ShortcodesHelpers keeps the shortcodes in fenced code blocks as-is", async () => {
  const codeBlock = [
    "```html",
    "<mermaid>",
    "flowchart TD",
    "  A[Write docs in Markdown] --> B[Run doctor publish]",
    "  style A fill:#e3f2fd,stroke:#1e88e5,stroke-width:2px",
    "</mermaid>",
    "```",
  ].join("\n");

  const output = await ShortcodesHelpers.parseBefore(codeBlock);

  assert.equal(output, codeBlock);
});

test("ShortcodesHelpers keeps the shortcodes in inline code as-is", async () => {
  const markdown = "Use `<mermaid>flowchart TD</mermaid>` to render a diagram.";

  const output = await ShortcodesHelpers.parseBefore(markdown);

  assert.equal(output, markdown);
});

test("ShortcodesHelpers renders the shortcodes around a code block", async () => {
  const markdown = [
    "<mermaid>",
    "flowchart TD",
    "  A --> B",
    "</mermaid>",
    "",
    "```html",
    "<mermaid>flowchart TD</mermaid>",
    "```",
  ].join("\n");

  const output = await ShortcodesHelpers.parseBefore(markdown);

  assert.match(output, /<pre class="mermaid">/);
  assert.match(output, /```html\n<mermaid>flowchart TD<\/mermaid>\n```/);
});

test("ShortcodesHelpers keeps an unclosed fenced code block as-is", async () => {
  const markdown = ["```html", "<mermaid>flowchart TD</mermaid>"].join("\n");

  const output = await ShortcodesHelpers.parseBefore(markdown);

  assert.equal(output, markdown);
});

test("ShortcodesHelpers renders the shortcodes after markdown processing", async () => {
  const output = await ShortcodesHelpers.parseAfter(
    `<callout type="tip" title="Custom">A callout</callout>`
  );

  assert.match(output, /class="callout callout-tip"/);
  assert.match(output, /CUSTOM/);
});

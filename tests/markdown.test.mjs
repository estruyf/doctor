import test from "node:test";
import assert from "node:assert/strict";

import { MarkdownHelper } from "../dist/helpers/MarkdownHelper.js";
import { CliCommand } from "../dist/helpers/CliCommand.js";

const OPTIONS = { tocLevels: [1, 2, 3, 4] };

const render = async (markdown, mdSettings) => {
  CliCommand.reset();
  CliCommand.init({ commandName: "m365", markdown: mdSettings });
  const html = await MarkdownHelper.getHtmlData(markdown, OPTIONS);
  CliCommand.reset();
  return html;
};

test("getHtmlData parses the first block of the content as markdown", async () => {
  const html = await render(`# First heading\n\nSome text.\n`, {
    allowHtml: true,
  });

  assert.match(html, /<h1 id="first-heading"/);
  assert.doesNotMatch(html, /# First heading/);
});

test("getHtmlData renders the extended syntax by default", async () => {
  const html = await render(
    [
      `:pushpin: pinned`,
      ``,
      `==highlighted==`,
      ``,
      `Term`,
      `: Definition`,
      ``,
      `- [ ] open`,
      `- [x] done`,
      ``,
      `Reference[^1]`,
      ``,
      `[^1]: The footnote`,
    ].join("\n"),
    { allowHtml: true }
  );

  assert.match(html, /📌/, "emoji shortcode");
  assert.match(html, /<mark>highlighted<\/mark>/, "highlight");
  assert.match(html, /<dt>Term<\/dt>/, "definition list");
  assert.match(html, /type="checkbox"/, "task list");
  assert.match(html, /class="footnote-ref"/, "footnote");
  assert.match(html, /\.task-list-item-checkbox/, "extended styles are injected");
});

test("getHtmlData skips the extended syntax when it is disabled", async () => {
  const html = await render(`:pushpin: pinned and ==highlighted==`, {
    allowHtml: true,
    extended: false,
  });

  assert.match(html, /:pushpin:/);
  assert.match(html, /==highlighted==/);
  assert.doesNotMatch(html, /\.task-list-item-checkbox/);
});

// Math is not supported: the SharePoint markdown web part strips the MathML
// elements and keeps their text nodes, which renders the formula as character
// soup followed by the raw LaTeX of the KaTeX annotation.
test("getHtmlData leaves math syntax untouched", async () => {
  const html = await render(
    `Inline $E = mc^2$ math.\n\n$$\nc = \\pm\\sqrt{a^2 + b^2}\n$$`,
    { allowHtml: true }
  );

  assert.match(html, /\$E = mc\^2\$/);
  assert.doesNotMatch(html, /<math/);
  assert.doesNotMatch(html, /katex/);
});

test("getHtmlData keeps the container structure and code highlighting", async () => {
  const html = await render("```js\nconst a = 1;\n```\n", {
    allowHtml: true,
  });

  assert.match(html, /<div class="doctor__container">/);
  assert.match(html, /<div class="doctor__container__markdown">/);
  assert.match(html, /<pre class="hljs js">/);
});

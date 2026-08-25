import test from "node:test";
import assert from "node:assert/strict";

import { ShortcodesHelpers } from "../dist/helpers/ShortcodesHelpers.js";

/**
 * The diagram travels as a `data:` URI, so assertions about what Mermaid drew
 * have to look inside the image.
 */
const decodeDiagram = (output) => {
  const match = output.match(/base64,([^"]+)"/);
  return match ? Buffer.from(match[1], "base64").toString("utf8") : "";
};

test("ShortcodesHelpers renders the shortcodes which are used in the content", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nflowchart TD\n  A[Write docs] --> B[Run doctor publish]\n</mermaid>`
  );

  assert.match(output, /<div class="doctor__mermaid"><img src="data:image\/svg\+xml;base64,/);
  // Mermaid draws a label as one tspan per word
  const svg = decodeDiagram(output);
  assert.match(svg, />\s*Write</);
  assert.match(svg, />\s*docs</);
  assert.match(svg, />\s*publish</);
  // The diagram is drawn while publishing, so SharePoint must not find a
  // `pre.mermaid` to render again with its own Mermaid build.
  assert.doesNotMatch(output, /class="mermaid"/);
});

test("ShortcodesHelpers publishes a Mermaid diagram without inline styles", async () => {
  // SharePoint drops `style` attributes from the HTML it injects, so the size
  // and the colours have to travel in the stylesheet instead.
  const output = await ShortcodesHelpers.parseBefore(
    [
      "<mermaid>",
      "flowchart TD",
      "  A[Start] --> B[Done]",
      "  style A fill:#e1f5fe,stroke:#0288d1",
      "</mermaid>",
    ].join("\n")
  );

  const svg = decodeDiagram(output);
  assert.doesNotMatch(svg, / style="/);
  assert.match(svg, /fill:#e1f5fe !important/);
});

test("ShortcodesHelpers sizes a Mermaid diagram with attributes", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nflowchart TD\n  A --> B\n</mermaid>`
  );

  const root = decodeDiagram(output).match(/<svg[^>]*>/)[0];

  assert.doesNotMatch(root, /width="100%"/);
  assert.match(root, /width="\d+"/);
  assert.match(root, /height="\d+"/);
  // The image itself has to be sized too, so the page can lay it out.
  assert.match(output, /<img [^>]*width="\d+" height="\d+"/);
});

test("ShortcodesHelpers outranks the Mermaid theme with the lifted styles", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    [
      "<mermaid>",
      "flowchart TD",
      "  A[Start] --> B[Done]",
      "  style A fill:#e1f5fe",
      "</mermaid>",
    ].join("\n")
  );

  // Mermaid styles its shapes through `#<id> .node rect`, so a plain class
  // would lose on specificity wherever `!important` is not honoured.
  assert.match(
    decodeDiagram(output),
    /#(doctor-mermaid-[a-f0-9]+) \.\1-s\d+\.\1-s\d+\{/
  );
});

test("ShortcodesHelpers keeps the diagram out of the page HTML", async () => {
  // SharePoint removes `<style>` elements and the root `<svg>` from the HTML it
  // injects, so nothing the diagram needs may be left for it to sanitize.
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nflowchart TD\n  A --> B\n</mermaid>`
  );

  assert.doesNotMatch(output, /<svg/);
  assert.doesNotMatch(output, /<style/);
  assert.match(decodeDiagram(output), /^<svg /);
});

test("ShortcodesHelpers gives every Mermaid diagram its own id", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    [
      "<mermaid>",
      "flowchart TD",
      "  A --> B",
      "</mermaid>",
      "",
      "<mermaid>",
      "sequenceDiagram",
      "  Alice->>John: Hello",
      "</mermaid>",
    ].join("\n")
  );

  const ids =
    [...output.matchAll(/base64,([^"]+)"/g)]
      .map(([, data]) => Buffer.from(data, "base64").toString("utf8"))
      .map((svg) => (svg.match(/id="doctor-mermaid-[a-f0-9]+"/) ?? [])[0]) ?? [];

  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test("ShortcodesHelpers renders the same Mermaid diagram identically", async () => {
  const diagram = `<mermaid>\nflowchart TD\n  A --> B\n</mermaid>`;

  const first = await ShortcodesHelpers.parseBefore(diagram);
  const second = await ShortcodesHelpers.parseBefore(diagram);

  assert.equal(first, second);
});

test("ShortcodesHelpers decodes the entities in a Mermaid diagram", async () => {
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nflowchart TD\n  A["a &lt; b"] --> B\n</mermaid>`
  );

  assert.match(output, /<div class="doctor__mermaid"><img src="data:image\/svg\+xml;base64,/);
  assert.match(decodeDiagram(output), />\s*&lt;</);
});

test("ShortcodesHelpers keeps a Mermaid diagram it cannot render", async () => {
  // Doctor renders without a browser, which does not cover every diagram type.
  // Those still have to reach the page, so SharePoint can try to render them.
  const output = await ShortcodesHelpers.parseBefore(
    `<mermaid>\nmindmap\n  root((doctor))\n    Pages\n</mermaid>`
  );

  assert.match(output, /<pre class="mermaid">/);
  assert.match(output, /root\(\(doctor\)\)/);
});

test("ShortcodesHelpers renders the diagrams that need a layout engine", async () => {
  // `architecture` and `gantt` lay out through Cytoscape, and `sankey` orders
  // its nodes through the DOM. All three need parts of the DOM that svgdom
  // leaves out.
  const diagrams = {
    architecture: [
      "architecture-beta",
      "  group api(cloud)[API]",
      "  service db(database)[Database] in api",
      "  service server(server)[Server] in api",
      "  db:L -- R:server",
    ].join("\n"),
    gantt: [
      "gantt",
      "  dateFormat YYYY-MM-DD",
      "  section Build",
      "  Write docs :a1, 2026-01-01, 20d",
    ].join("\n"),
    sankey: "sankey-beta\nDoctor,SharePoint,10",
  };

  for (const [name, diagram] of Object.entries(diagrams)) {
    const output = await ShortcodesHelpers.parseBefore(
      `<mermaid>\n${diagram}\n</mermaid>`
    );

    assert.match(output, /<div class="doctor__mermaid"><img src="data:image\/svg\+xml;base64,/, name);
  }
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

  assert.match(output, /<div class="doctor__mermaid"><img src="data:image\/svg\+xml;base64,/);
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

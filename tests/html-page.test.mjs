import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_HTML_TEMPLATE,
  HtmlPageHelper,
} from "../dist/helpers/HtmlPageHelper.js";
import { MarkdownHelper } from "../dist/helpers/MarkdownHelper.js";
import { CliCommand } from "../dist/helpers/CliCommand.js";
import { DependencyHelper } from "../dist/helpers/DependencyHelper.js";
import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";
import { OutputHelper } from "../dist/helpers/OutputHelper.js";
import { ShortcodesHelpers } from "../dist/helpers/ShortcodesHelpers.js";
import { StatusHelper } from "../dist/helpers/StatusHelper.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const OPTIONS = {
  commandName: "m365",
  pageMode: "html",
  tocLevels: [1, 2, 3],
  webUrl: null,
};

/** A run in html mode, with the helpers reset around it */
const htmlRun = async (options, fn) => {
  CliCommand.reset();
  OutputHelper.reset();
  HtmlPageHelper.reset();
  ShortcodesHelpers.reset();
  CliCommand.init({ ...OPTIONS, ...options });
  try {
    return await fn({ ...OPTIONS, ...options });
  } finally {
    CliCommand.reset();
    OutputHelper.reset();
    HtmlPageHelper.reset();
  }
};

const withContent = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-html-"));
  try {
    await mkdir(join(dir, "docs", "images"), { recursive: true });
    await writeFile(join(dir, "docs", "images", "pixel.png"), PNG);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** A local server standing in for a host the sandbox blocks */
const withImageServer = async (fn) => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.url === "/pixel.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    } else if (req.url === "/page") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, () => requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("fillTemplate escapes the text values and leaves markup as it is", () => {
  const html = HtmlPageHelper.fillTemplate(
    `<title>{{ title }}</title><p>{{description}}</p><main>{{ content }}</main>{{ unknown }}`,
    {
      title: `Tips & "tricks"`,
      description: `<b>bold</b>`,
      lang: "en",
      styles: "",
      header: "",
      content: "<h1>Hello</h1>",
    },
  );

  assert.equal(
    html,
    `<title>Tips &amp; &quot;tricks&quot;</title><p>&lt;b&gt;bold&lt;/b&gt;</p><main><h1>Hello</h1></main>{{ unknown }}`,
  );
});

test("fillTemplate leaves placeholders written in the content alone", () => {
  const html = HtmlPageHelper.fillTemplate(DEFAULT_HTML_TEMPLATE, {
    title: "Templates",
    description: "",
    lang: "en",
    styles: "",
    header: "",
    content: "<code>{{ title }}</code>",
  });

  assert.match(html, /<code>\{\{ title \}\}<\/code>/);
});

test("renderHeader shows the title and description in a banner", async () => {
  const header = await HtmlPageHelper.renderHeader(
    { title: "Getting started", description: "Read this first" },
    "page.md",
  );

  assert.match(header, /<header class="doctor-hero">/);
  assert.match(header, /<h1 class="doctor-hero__title">Getting started<\/h1>/);
  assert.match(header, /<p class="doctor-hero__description">Read this first<\/p>/);
});

test("renderHeader inlines the banner image, and leaves it out when asked", async () => {
  await withContent(async (dir) => {
    const file = join(dir, "docs", "page.md");
    const header = { image: "./images/pixel.png", altText: "A pixel", textAlignment: "Center" };

    const withImage = await HtmlPageHelper.renderHeader({ title: "Page", header }, file);
    assert.match(withImage, /doctor-hero--image doctor-hero--center/);
    assert.match(withImage, /background-image: url\('data:image\/png;base64,/);
    assert.match(withImage, /aria-label="A pixel"/);

    const noImage = await HtmlPageHelper.renderHeader(
      { title: "Page", header: { ...header, layout: "NoImage" } },
      file,
    );
    assert.doesNotMatch(noImage, /background-image/);

    const none = await HtmlPageHelper.renderHeader(
      { title: "Page", header: { type: "None" } },
      file,
    );
    assert.equal(none, "");
  });
});

test("inlineImages inlines local images and keeps the tenant's own", async () => {
  await withContent(async (dir) => {
    const html = await HtmlPageHelper.inlineImages(
      [
        `<img src="./images/pixel.png" alt="one">`,
        `<img src="images/pixel.png?v=2" alt="two">`,
        `<img src="${WEB_URL}/SiteAssets/logo.png" alt="tenant">`,
      ].join(""),
      join(dir, "docs", "page.md"),
      WEB_URL,
    );

    assert.equal((html.match(/src="data:image\/png;base64,/g) ?? []).length, 2);
    assert.match(html, /src="https:\/\/contoso\.sharepoint\.com\/sites\/docs\/SiteAssets\/logo\.png"/);
    assert.deepEqual(HtmlPageHelper.getSandboxIssues(html, WEB_URL), []);
  });
});

test("inlineImages downloads images from other hosts, once each", async () => {
  await withImageServer(async (base, requests) => {
    const html = await htmlRun({}, () =>
      HtmlPageHelper.inlineImages(
        [
          `<img src="${base}/pixel.png">`,
          `<img src="${base}/pixel.png">`,
          `<img src="${base}/page">`,
          `<img src="${base}/missing.png">`,
        ].join(""),
        "page.md",
        WEB_URL,
      ),
    );

    assert.equal((html.match(/src="data:image\/png;base64,/g) ?? []).length, 2);
    assert.match(html, /src="http:\/\/127\.0\.0\.1:\d+\/page"/, "not an image: kept");
    assert.match(html, /src="http:\/\/127\.0\.0\.1:\d+\/missing\.png"/, "failed: kept");
    assert.equal(requests(), 3, "the repeated image is downloaded once");
    assert.equal(HtmlPageHelper.getSandboxIssues(html, WEB_URL).length, 2);
  });
});

test("inlineImages fails on a local image that does not exist", async () => {
  await withContent(async (dir) => {
    await assert.rejects(
      HtmlPageHelper.inlineImages(`<img src="./images/missing.png">`, join(dir, "docs", "page.md")),
      /could not be found/,
    );
    await assert.rejects(
      HtmlPageHelper.inlineImages(`<img src="./notes.txt">`, join(dir, "docs", "page.md")),
      /not a file type/,
    );
  });
});

test("getSandboxIssues reports what the HTML page sandbox blocks", () => {
  const issues = HtmlPageHelper.getSandboxIssues(
    [
      `<link rel="stylesheet" href="https://cdn.example.com/site.css">`,
      `<script src="https://cdn.example.com/app.js"></script>`,
      `<script>console.log("inline is fine")</script>`,
      `<iframe src="https://example.com"></iframe>`,
      `<img src="./relative.png">`,
      `<img src="https://example.com/remote.png">`,
      `<form action="/submit"></form>`,
    ].join(""),
    WEB_URL,
  );

  assert.deepEqual(
    issues.map((issue) => issue.element),
    [
      `<link href="https://cdn.example.com/site.css">`,
      `<script src="https://cdn.example.com/app.js">`,
      `<iframe>`,
      `<img src="./relative.png">`,
      `<img src="https://example.com/remote.png">`,
      `<form>`,
    ],
  );
});

test("render produces a complete, self-contained page", async () => {
  await withContent(async (dir) => {
    const file = join(dir, "docs", "page.md");
    const html = await htmlRun({}, (options) =>
      HtmlPageHelper.render(
        [
          `<toc title="On this page"></toc>`,
          ``,
          `## Install`,
          ``,
          "```js",
          "const doctor = require('@estruyf/doctor');",
          "```",
          ``,
          `<callout type="tip">Run it in CI.</callout>`,
          ``,
          `![Pixel](./images/pixel.png)`,
        ].join("\n"),
        { title: "Getting started", description: "Read this first" },
        file,
        options,
      ),
    );

    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<title>Getting started<\/title>/);
    assert.match(html, /<meta name="description" content="Read this first" \/>/);
    assert.match(html, /<h1 class="doctor-hero__title">Getting started<\/h1>/);
    assert.match(html, /<h2 id="install"/, "headings get anchors");
    assert.match(html, /doctor__container__toc/, "the toc shortcode renders without allowHtml");
    assert.match(html, /<a href="#install">Install<\/a>/, "the toc links to the heading");
    assert.match(html, /<pre class="hljs js"><code><span class="hljs-keyword">const<\/span>/, "code is highlighted");
    assert.match(html, /class="callout callout-tip"/);
    assert.match(html, /<img src="data:image\/png;base64,[^"]+" alt="Pixel"/);
    assert.match(html, /--doctor-accent/, "the default design is included");
    assert.match(html, /\.hljs/, "the highlighting theme is included");
    assert.equal((html.match(/<style>/g) ?? []).length, 1, "one stylesheet, in the head");
    assert.deepEqual(HtmlPageHelper.getSandboxIssues(html), []);
  });
});

test("render draws Mermaid diagrams as inline SVG", async () => {
  const html = await htmlRun({}, (options) =>
    HtmlPageHelper.render(
      `<mermaid>\nflowchart TD\n  A[Write docs] --> B[Run doctor]\n</mermaid>`,
      { title: "Diagram" },
      "page.md",
      options,
    ),
  );

  assert.match(html, /<div class="doctor__mermaid"><svg /);
  assert.doesNotMatch(html, /<img src="data:image\/svg/);
});

test("render uses a custom template and adds custom styles", async () => {
  await withContent(async (dir) => {
    const template = join(dir, "layout.html");
    const styles = join(dir, "brand.css");
    await writeFile(template, `<html><body class="brand"><h1>{{ title }}</h1>{{ content }}</body></html>`);
    await writeFile(styles, `:root { --doctor-accent: #c00; }`);

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const html = await htmlRun(
        { htmlTemplate: "layout.html", htmlStyles: "brand.css" },
        (options) => HtmlPageHelper.render("Hello", { title: "Branded" }, "page.md", options),
      );
      assert.match(html, /^<html><body class="brand"><h1>Branded<\/h1>/);
      assert.match(html, /<p>Hello<\/p>/);

      const withStyles = await htmlRun({ htmlStyles: "brand.css" }, (options) =>
        HtmlPageHelper.render("Hello", { title: "Branded" }, "page.md", options),
      );
      assert.match(withStyles, /--doctor-accent: #c00;[\s\S]*<\/style>/);

      await writeFile(template, `<html><body>{{ title }}</body></html>`);
      await assert.rejects(
        htmlRun({ htmlTemplate: "layout.html" }, (options) =>
          HtmlPageHelper.render("Hello", { title: "Lost" }, "page.md", options),
        ),
        /no \{\{ content \}\} placeholder/,
      );
    } finally {
      process.chdir(cwd);
    }
  });
});

test("render reports what the sandbox will block", async () => {
  StatusHelper.reset();
  // Warnings are collected, rather than printed, for the JSON output
  await htmlRun({ output: "json" }, (options) => {
    OutputHelper.init(options);
    return HtmlPageHelper.render(
      `<script src="https://cdn.example.com/app.js"></script>\n\nText`,
      { title: "Scripted" },
      "page.md",
      options,
    );
  });
  const warnings = StatusHelper.getWarnings();
  StatusHelper.reset();

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"Scripted": <script src="https:\/\/cdn\.example\.com\/app\.js"> — external scripts are blocked/);
});

test("getSlug gives HTML pages an .html slug", async () => {
  await htmlRun({}, () => {
    assert.equal(
      FrontMatterHelper.getSlug({ title: "My Page" }, "./src", "./src/guides/page.md"),
      "guides/my-page.html",
    );
    assert.equal(
      FrontMatterHelper.getSlug({ title: "x", slug: "index.aspx" }, "./src", "./src/index.md"),
      "index.html",
      "a slug written for a modern page names the same page",
    );
    assert.equal(
      FrontMatterHelper.getSlug({ title: "x", slug: "about" }, "./src", "./src/about.md"),
      "about.html",
    );
  });

  CliCommand.reset();
  assert.equal(
    FrontMatterHelper.getSlug({ title: "x", slug: "index.aspx" }, "./src", "./src/index.md"),
    "index.aspx",
  );
});

test("parsePageMode defaults to webpart and refuses an unknown mode", () => {
  assert.equal(OptionsHelper.parsePageMode(undefined), "webpart");
  assert.equal(OptionsHelper.parsePageMode("HTML"), "html");
  assert.throws(() => OptionsHelper.parsePageMode("static"), /must be one of: webpart, html/);

  const parsed = OptionsHelper.parseArguments(
    { pageMode: "webpart", html: { template: "layout.html", styles: "brand.css" } },
    ["node", "doctor", "publish", "--pageMode", "html"],
  );
  assert.equal(parsed.pageMode, "html", "the argument wins over doctor.json");
  assert.equal(parsed.htmlTemplate, "layout.html");
  assert.equal(parsed.htmlStyles, "brand.css");
});

test("the config hash of a modern page site does not move, and html mode changes it", async () => {
  const base = { webPartTitle: "doctor-placeholder", shortcodesFolder: "./missing" };

  DependencyHelper.reset();
  const before = await DependencyHelper.getConfigHash(base);
  DependencyHelper.reset();
  const webpart = await DependencyHelper.getConfigHash({ ...base, pageMode: "webpart" });
  DependencyHelper.reset();
  const html = await DependencyHelper.getConfigHash({ ...base, pageMode: "html" });
  DependencyHelper.reset();

  assert.equal(before, webpart, "upgrading does not republish every modern page");
  assert.notEqual(webpart, html, "switching modes republishes every page");
});

test("getStyles is the stylesheet getHtmlData appends", async () => {
  CliCommand.reset();
  CliCommand.init({ commandName: "m365", markdown: { allowHtml: true } });
  const html = await MarkdownHelper.getHtmlData("# Title", {
    tocLevels: [1, 2],
  });
  const styles = MarkdownHelper.getStyles();
  CliCommand.reset();

  assert.ok(html.endsWith(`<style>${styles}</style>`));
});

test("the pre-check refuses two pages marked as the homepage", async () => {
  const { PrecheckHelper } = await import("../dist/helpers/PrecheckHelper.js");
  await withContent(async (dir) => {
    const startFolder = join(dir, "docs");
    const a = join(startFolder, "a.md");
    const b = join(startFolder, "b.md");
    await writeFile(a, `---\ntitle: A\nhomepage: true\n---\nA`);
    await writeFile(b, `---\ntitle: B\nhomepage: true\n---\nB`);

    await assert.rejects(
      PrecheckHelper.validate({ files: [a, b] }, {}, { startFolder }),
      /More than one page is marked as the homepage/,
    );

    await writeFile(b, `---\ntitle: B\n---\nB`);
    await PrecheckHelper.validate({ files: [a, b] }, {}, { startFolder });
  });
});

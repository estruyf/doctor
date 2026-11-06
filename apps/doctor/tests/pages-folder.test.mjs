import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "cheerio";

import { CliCommand } from "../dist/helpers/CliCommand.js";
import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { FolderHelpers } from "../dist/helpers/FolderHelpers.js";
import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";
import { ListHelpers } from "../dist/helpers/ListHelpers.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";

/**
 * `pagesFolder` puts every page doctor publishes in one folder of Site Pages,
 * so a site with pages of its own (its `Home.aspx`) never gets them written
 * over or cleaned up by doctor.
 */
const webUrl = "https://contoso.sharepoint.com/sites/dept";

/** The run's options, as the CLI builds them from these arguments and doctor.json */
const useOptions = (t, config = {}, args = []) => {
  const options = OptionsHelper.parseArguments(config, [
    "node",
    "doctor",
    "publish",
    ...args,
  ]);
  CliCommand.reset();
  CliCommand.init(options);
  t.after(() => CliCommand.reset());
  return options;
};

test("the folder is read without leading and trailing slashes", () => {
  assert.equal(OptionsHelper.parsePagesFolder(undefined), "");
  assert.equal(OptionsHelper.parsePagesFolder(""), "");
  assert.equal(OptionsHelper.parsePagesFolder("/"), "");
  assert.equal(OptionsHelper.parsePagesFolder("docs"), "docs");
  assert.equal(OptionsHelper.parsePagesFolder("/docs/"), "docs");
  assert.equal(OptionsHelper.parsePagesFolder(" docs//v2/ "), "docs/v2");
  assert.equal(OptionsHelper.parsePagesFolder("\\docs\\v2\\"), "docs/v2");
  assert.equal(OptionsHelper.parsePagesFolder("./docs"), "docs");
  assert.throws(
    () => OptionsHelper.parsePagesFolder("docs/../other"),
    /"pagesFolder" option has to be a folder inside Site Pages/
  );
});

test("the argument wins over doctor.json", (t) => {
  assert.equal(useOptions(t, { pagesFolder: "/docs/" }).pagesFolder, "docs");
  assert.equal(
    useOptions(t, { pagesFolder: "docs" }, ["--pagesFolder", "manual/"]).pagesFolder,
    "manual"
  );
  assert.equal(useOptions(t, {}).pagesFolder, "");
});

test("without a folder the slugs stay as they were", (t) => {
  useOptions(t);

  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "./src", "./src/home.md"),
    "home.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "custom/page" }, "./src", "./src/x.md"),
    "custom/page.aspx"
  );
});

test("the auto slug and a front matter slug both go in the folder", (t) => {
  useOptions(t, { pagesFolder: "docs" });

  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "./src", "./src/home.md"),
    "docs/home.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "Setup" }, "./src", "./src/guides/setup.md"),
    "docs/guides/setup.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "custom/page" }, "./src", "./src/x.md"),
    "docs/custom/page.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "/rooted.aspx" }, "./src", "./src/x.md"),
    "docs/rooted.aspx"
  );
});

test("a front matter slug already in the folder is not prefixed twice", (t) => {
  useOptions(t, { pagesFolder: "docs" });

  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "docs/page.aspx" }, "./src", "./src/x.md"),
    "docs/page.aspx"
  );
  // SharePoint URLs do not care about case, so neither does the check
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "Docs/Page" }, "./src", "./src/x.md"),
    "Docs/Page.aspx"
  );
  // Only a whole folder name counts
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "docsite/page" }, "./src", "./src/x.md"),
    "docs/docsite/page.aspx"
  );
});

test("a content folder named like the pages folder keeps its own level", (t) => {
  useOptions(t, { pagesFolder: "docs" });

  // Otherwise src/docs/page.md and src/page.md would publish to the same page
  assert.equal(
    FrontMatterHelper.getSlug({ title: "Page" }, "./src", "./src/docs/page.md"),
    "docs/docs/page.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "Page" }, "./src", "./src/page.md"),
    "docs/page.aspx"
  );
});

test("a nested folder is used as a whole", (t) => {
  useOptions(t, { pagesFolder: "/docs/v2/" });

  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "./src", "./src/home.md"),
    "docs/v2/home.aspx"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "docs/v2/page" }, "./src", "./src/x.md"),
    "docs/v2/page.aspx"
  );
  // Only the first level of the folder is not enough to count as inside it
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "docs/page" }, "./src", "./src/x.md"),
    "docs/v2/docs/page.aspx"
  );
});

test("HTML pages go in the folder with their own extension", (t) => {
  useOptions(t, { pagesFolder: "docs", pageMode: "html" });

  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "./src", "./src/home.md"),
    "docs/home.html"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "docs/page.aspx" }, "./src", "./src/x.md"),
    "docs/page.html"
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "custom/page" }, "./src", "./src/x.md"),
    "docs/custom/page.html"
  );
});

test("whether a page is inside the folder", (t) => {
  useOptions(t, { pagesFolder: "docs/v2" });

  assert.equal(FrontMatterHelper.isInPagesFolder("docs/v2/page.aspx"), true);
  assert.equal(FrontMatterHelper.isInPagesFolder("Docs/V2/nl/page.aspx"), true);
  assert.equal(FrontMatterHelper.isInPagesFolder("docs/page.aspx"), false);
  assert.equal(FrontMatterHelper.isInPagesFolder("docs/v2.aspx"), false);
  assert.equal(FrontMatterHelper.isInPagesFolder("home.aspx"), false);
});

test("links between pages point into the folder", async (t) => {
  const options = useOptions(t, { pagesFolder: "docs", url: webUrl });
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-pages-folder-"));
  await mkdir(join(startFolder, "guides"));
  const file = join(startFolder, "index.md");
  await writeFile(join(startFolder, "guides", "setup.md"), `---\ntitle: Setup\n---\n`, "utf-8");
  await writeFile(
    join(startFolder, "custom.md"),
    `---\ntitle: Custom\nslug: docs/custom.aspx\n---\n`,
    "utf-8"
  );

  const content = `[a](./guides/setup.md) [b](./custom.md#part)`;
  const $ = load(`<a href="./guides/setup.md">a</a><a href="./custom.md#part">b</a>`);

  const result = await DoctorTranspiler.processLinks(
    $,
    $("a").toArray(),
    file,
    content,
    { ...options, startFolder }
  );

  assert.equal(
    result,
    `[a](${webUrl}/sitepages/docs/guides/setup.aspx) [b](${webUrl}/sitepages/docs/custom.aspx#part)`
  );
});

test("deleted pages are found by their slug in the folder", async (t) => {
  useOptions(t, { pagesFolder: "docs" });
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-pages-folder-"));
  await writeFile(join(startFolder, "index.md"), `---\ntitle: Home\n---\n`, "utf-8");
  await writeFile(
    join(startFolder, "page.md"),
    `---\ntitle: Page\nslug: docs/page.aspx\n---\n`,
    "utf-8"
  );

  const { slugs, unresolved } = await DoctorTranspiler.collectLocalSlugs(
    [join(startFolder, "index.md"), join(startFolder, "page.md")],
    { startFolder }
  );
  assert.deepEqual(slugs.sort(), ["docs/home.aspx", "docs/page.aspx"]);
  assert.deepEqual(unresolved, []);

  StateHelper.reset();
  t.after(() => StateHelper.reset());
  StateHelper.state = {
    version: 1,
    site: webUrl,
    configHash: null,
    pages: {
      "docs/home.aspx": { sourceHash: "a", publishedAt: "2026-01-01T00:00:00.000Z" },
      "docs/page.aspx": { sourceHash: "b", publishedAt: "2026-01-01T00:00:00.000Z" },
      "docs/gone.aspx": { sourceHash: "c", publishedAt: "2026-01-01T00:00:00.000Z" },
    },
  };
  StateHelper.loaded = true;

  assert.deepEqual(StateHelper.getDeletedSlugs(slugs), ["docs/gone.aspx"]);
});

/**
 * A stand-in for the CLI for Microsoft 365 that logs every call with its
 * options as one JSON line. `spo page get` finds nothing, so a page is new.
 */
const fakeCli = `#!/usr/bin/env node
const { appendFileSync } = require("fs");
const args = process.argv.slice(2);
const command = args.slice(0, 3).join(" ");
const options = {};
for (let i = 3; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const next = args[i + 1];
    options[args[i].slice(2)] = next && !next.startsWith("--") ? args[++i] : true;
  }
}
appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ command, options }) + "\\n");
// Pages already in the root of Site Pages: adding one fails, looking it up works
const rootPages = (process.env.FAKE_CLI_ROOT_PAGES || "").split(",").filter(Boolean);
if (command === "spo page add" && rootPages.includes(options.name)) {
  process.stderr.write("A file with this name already exists."); process.exit(1);
}
if (command === "spo page get" && rootPages.includes(options.name)) {
  process.stdout.write(JSON.stringify({ ListItemAllFields: { Id: 3 } })); process.exit(0);
}
if (command === "spo page get") {
  process.stderr.write("File Not Found."); process.exit(1);
}
if (command === "spo list list") {
  process.stdout.write(JSON.stringify([{ Id: "1", Title: "Site Pages", RootFolder: { ServerRelativeUrl: "/sites/dept/SitePages" } }]));
  process.exit(0);
}
process.stdout.write("{}");
`;

const skip = process.platform === "win32" && "the fake CLI is a shebang script";

const setupCli = async (t, config) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-pages-folder-cli-"));
  const cli = join(dir, "fake-m365.cjs");
  const log = join(dir, "calls.log");
  await writeFile(cli, fakeCli, "utf-8");
  await chmod(cli, 0o755);
  await writeFile(log, "", "utf-8");
  process.env.FAKE_CLI_LOG = log;

  PagesHelper.reset();
  FolderHelpers.reset?.();
  ListHelpers.reset?.();
  useOptions(t, { ...config, commandName: cli });

  t.after(() => {
    PagesHelper.reset();
    FolderHelpers.reset?.();
    ListHelpers.reset?.();
    delete process.env.FAKE_CLI_LOG;
    delete process.env.FAKE_CLI_ROOT_PAGES;
  });

  return async () =>
    (await readFile(log, "utf-8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
};

test("cleanup only removes pages inside the folder", { skip }, async (t) => {
  const calls = await setupCli(t, { pagesFolder: "docs" });
  PagesHelper.pages = [
    "/sites/dept/SitePages/Home.aspx",
    "/sites/dept/SitePages/news/update.aspx",
    "/sites/dept/SitePages/docs/stale.aspx",
    "/sites/dept/SitePages/docs/nl/stale.aspx",
    "/sites/dept/SitePages/docs/kept.aspx",
    "/sites/dept/SitePages/docsite/other.aspx",
  ].map((FileRef, ID) => ({ FileRef, ID }));
  PagesHelper.markKnown("docs/kept.aspx");

  await PagesHelper.clean(webUrl, { output: "" }, { continueOnError: false });

  assert.deepEqual(
    (await calls())
      .filter((call) => call.command === "spo file remove")
      .map((call) => call.options.url),
    ["/sites/dept/sitepages/docs/stale.aspx", "/sites/dept/sitepages/docs/nl/stale.aspx"]
  );
});

test("cleanup without a folder still covers all of Site Pages", { skip }, async (t) => {
  const calls = await setupCli(t, {});
  PagesHelper.pages = [
    "/sites/dept/SitePages/Home.aspx",
    "/sites/dept/SitePages/docs/stale.aspx",
  ].map((FileRef, ID) => ({ FileRef, ID }));

  await PagesHelper.clean(webUrl, { output: "" }, { continueOnError: false });

  assert.equal(
    (await calls()).filter((call) => call.command === "spo file remove").length,
    2
  );
});

test("a new page in a folder never moves a root page with the same name", { skip }, async (t) => {
  const calls = await setupCli(t, { pagesFolder: "docs" });
  // The folder is there already, so it is not looked up with the real CLI
  FolderHelpers.checkedFolders = ["/sitepages/docs"];

  const existed = await PagesHelper.createPageIfNotExists(webUrl, "docs/home.aspx", "Home");
  assert.equal(existed, false);

  const log = await calls();
  const add = log.find((call) => call.command === "spo page add");
  const move = log.find((call) => call.command === "spo file move");

  // Created under a name of its own, as the site's Home.aspx may sit in the root
  assert.match(add.options.name, /^home-doctor-[0-9a-f]{12}\.aspx$/);
  assert.equal(add.options.name, PagesHelper.getTemporaryPageName("docs/home.aspx"));
  assert.equal(add.options.title, "Home");
  assert.equal(move.options.sourceUrl, `/sites/dept/SitePages/${add.options.name}`);
  assert.equal(move.options.targetUrl, "/sites/dept/SitePages/docs");
  assert.equal(move.options.newName, "home.aspx");
});

test("a new page in the root keeps its own name", { skip }, async (t) => {
  const calls = await setupCli(t, {});

  await PagesHelper.createPageIfNotExists(webUrl, "home.aspx", "Home");

  const log = await calls();
  assert.equal(log.find((call) => call.command === "spo page add").options.name, "home.aspx");
  assert.equal(log.some((call) => call.command === "spo file move"), false);
});

test("the temporary name is the same on every run, whatever the case", () => {
  const name = PagesHelper.getTemporaryPageName("docs/home.aspx");
  // SharePoint does not tell the two apart, so neither does the hash
  assert.equal(PagesHelper.getTemporaryPageName("Docs/Home.aspx").toLowerCase(), name);
  assert.notEqual(PagesHelper.getTemporaryPageName("other/home.aspx"), name);
});

test("a page left in the root by an earlier run is moved, not the root page with the real name", { skip }, async (t) => {
  const temporary = PagesHelper.getTemporaryPageName("docs/home.aspx");
  // The site's own Home.aspx and the leftover of a run that stopped before the move
  process.env.FAKE_CLI_ROOT_PAGES = `home.aspx,${temporary}`;
  const calls = await setupCli(t, { pagesFolder: "docs" });
  FolderHelpers.checkedFolders = ["/sitepages/docs"];

  const existed = await PagesHelper.createPageIfNotExists(webUrl, "docs/home.aspx", "Home");
  assert.equal(existed, false);

  const log = await calls();
  assert.deepEqual(
    log
      .filter((call) => ["spo page add", "spo page get", "spo file move"].includes(call.command))
      .map((call) => [call.command, call.options.name ?? call.options.sourceUrl]),
    [
      ["spo page get", "docs/home.aspx"],
      ["spo page add", temporary],
      ["spo page get", temporary],
      ["spo file move", `/sites/dept/SitePages/${temporary}`],
    ]
  );
  const move = log.find((call) => call.command === "spo file move");
  assert.equal(move.options.targetUrl, "/sites/dept/SitePages/docs");
  assert.equal(move.options.newName, "home.aspx");
});

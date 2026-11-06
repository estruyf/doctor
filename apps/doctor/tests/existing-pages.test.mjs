import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliCommand } from "../dist/helpers/CliCommand.js";
import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { ExistingPagesHelper } from "../dist/helpers/ExistingPagesHelper.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";
import { StatusHelper } from "../dist/helpers/StatusHelper.js";

/**
 * `existingPages` lets doctor publish into a site that has pages of its own.
 * The publish state is the test of ownership: a page on the site that is not in
 * it belongs to the site, and `protect` and `fail` keep doctor's hands off it.
 */
const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

const listed = (...slugs) =>
  slugs.map((slug) => ({ FileRef: `/sites/docs/SitePages/${slug}` }));

const tracked = (...slugs) => {
  StateHelper.state = {
    version: 1,
    site: WEB_URL,
    configHash: null,
    pages: Object.fromEntries(
      slugs.map((slug) => [
        slug,
        { sourceHash: "old", publishedAt: "2026-01-01T00:00:00.000Z" },
      ]),
    ),
  };
  StateHelper.loaded = true;
};

const resetAll = () => {
  StateHelper.reset();
  PagesHelper.reset();
  StatusHelper.reset();
  ExistingPagesHelper.reset();
  CliCommand.reset();
};

/**
 * A stand-in for the CLI for Microsoft 365. Every call is logged with its
 * arguments. FAKE_CLI_RESPONSES maps a command to what it prints; with
 * FAKE_CLI_FAIL set, every command fails, which stops a page at its first
 * write so a test can see how far it got.
 */
const fakeCli = `#!/usr/bin/env node
const { appendFileSync } = require("fs");
const args = process.argv.slice(2);
const command = args.slice(0, 3).join(" ");
appendFileSync(process.env.FAKE_CLI_LOG, args.join(" ") + "\\n");
if (process.env.FAKE_CLI_FAIL) { process.stderr.write("stopped by the test"); process.exit(1); }
const responses = JSON.parse(process.env.FAKE_CLI_RESPONSES || "{}");
process.stdout.write(responses[command] ?? "{}");
`;

const skipFake = process.platform === "win32" && "the fake CLI is a shebang script";

const setupCli = async (t, { fail = false, responses = {}, options = {} } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-existing-"));
  const cli = join(dir, "fake-m365.cjs");
  const log = join(dir, "calls.log");
  await writeFile(cli, fakeCli, "utf-8");
  await chmod(cli, 0o755);
  await writeFile(log, "", "utf-8");

  process.env.FAKE_CLI_LOG = log;
  process.env.FAKE_CLI_RESPONSES = JSON.stringify(responses);
  if (fail) process.env.FAKE_CLI_FAIL = "1";

  CliCommand.init({ commandName: cli, ...options });

  t.after(() => {
    delete process.env.FAKE_CLI_LOG;
    delete process.env.FAKE_CLI_RESPONSES;
    delete process.env.FAKE_CLI_FAIL;
  });

  return async () => (await readFile(log, "utf-8")).split("\n").filter(Boolean);
};

const writePage = async (folder, name, frontMatter) => {
  const file = join(folder, name);
  const yaml = Object.entries(frontMatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await writeFile(file, `---\n${yaml}\n---\n\n# Hello\n`, "utf-8");
  return file;
};

const task = () => ({ output: "", skip() {} });

test("existingPages defaults to update and refuses an unknown value", () => {
  assert.equal(OptionsHelper.parseExistingPages(undefined), "update");
  assert.equal(OptionsHelper.parseExistingPages(""), "update");
  assert.equal(OptionsHelper.parseExistingPages("Protect"), "protect");
  assert.equal(OptionsHelper.parseExistingPages("fail"), "fail");
  assert.throws(
    () => OptionsHelper.parseExistingPages("protcet"),
    /must be one of: update, protect, fail/,
  );
});

test("the argument wins over doctor.json", () => {
  const options = OptionsHelper.parseArguments(
    { existingPages: "fail" },
    ["node", "doctor", "publish", "--existingPages", "protect"],
  );
  assert.equal(options.existingPages, "protect");
  assert.equal(
    OptionsHelper.parseArguments({ existingPages: "fail" }, ["node", "doctor", "publish"])
      .existingPages,
    "fail",
  );
});

test("protect and fail are refused without the publish state", () => {
  assert.match(
    ExistingPagesHelper.validate({ existingPages: "protect", disableStatePersistence: true }),
    /needs the publish state.*--disableStatePersistence/,
  );
  assert.ok(ExistingPagesHelper.validate({ existingPages: "fail", disableStatePersistence: true }));
  assert.equal(
    ExistingPagesHelper.validate({ existingPages: "update", disableStatePersistence: true }),
    null,
  );
  assert.equal(
    ExistingPagesHelper.validate({ existingPages: "protect", disableStatePersistence: false }),
    null,
  );
});

test("a listed page is foreign unless the state tracks it, in any case", (t) => {
  t.after(resetAll);
  resetAll();
  PagesHelper.pages = listed("about.aspx", "Guides/Start.aspx", "news.aspx");
  tracked("guides/start.aspx");

  assert.equal(ExistingPagesHelper.isForeign(WEB_URL, "about.aspx"), true);
  assert.equal(ExistingPagesHelper.isForeign(WEB_URL, "guides/start.aspx"), false);
  assert.equal(ExistingPagesHelper.isForeign(WEB_URL, "Guides/Start.aspx"), false);
  // Not on the site: doctor creates it, there is nothing to protect
  assert.equal(ExistingPagesHelper.isForeign(WEB_URL, "new.aspx"), false);
});

test("fail lists every conflict at once", (t) => {
  t.after(resetAll);
  resetAll();
  PagesHelper.pages = listed("about.aspx", "news.aspx", "mine.aspx");
  tracked("mine.aspx");

  const conflicts = ExistingPagesHelper.findConflicts(WEB_URL, [
    "about.aspx",
    "mine.aspx",
    "new.aspx",
    "news.aspx",
    "About.aspx",
  ]);
  assert.deepEqual(conflicts, ["about.aspx", "news.aspx"]);

  const message = ExistingPagesHelper.getConflictMessage(conflicts);
  assert.match(message, /2 pages on the site/);
  assert.match(message, /- about\.aspx\n {2}- news\.aspx/);
  assert.match(message, /Nothing was written/);
});

test("the recovery hint says the state is empty when it is", (t) => {
  t.after(resetAll);
  resetAll();
  tracked();
  assert.match(
    ExistingPagesHelper.getConflictMessage(["a.aspx", "b.aspx"]),
    /lists no pages at all.*--existingPages update' adopts them again/,
  );
});

for (const pageMode of ["webpart", "html"]) {
  const ext = pageMode === "html" ? "html" : "aspx";

  test(`protect skips an untracked page on the site (${pageMode})`, { skip: skipFake }, async (t) => {
    t.after(resetAll);
    resetAll();
    const calls = await setupCli(t, { fail: true, options: { pageMode } });
    const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
    const file = await writePage(startFolder, "about.md", {
      title: "About",
      homepage: "true",
      "menu": "{ QuickLaunch: { id: about } }",
    });
    PagesHelper.pages = listed(`about.${ext}`);
    tracked("other.aspx");

    const output = { navigation: { QuickLaunch: { items: [] } } };
    await DoctorTranspiler.processFile(
      file,
      task(),
      { webUrl: WEB_URL, startFolder, pageMode, existingPages: "protect" },
      output,
    );

    // Left before anything reached SharePoint
    assert.deepEqual(await calls(), []);
    assert.equal(ExistingPagesHelper.getProtectedCount(), 1);
    assert.equal(ExistingPagesHelper.isProtected(`about.${ext}`), true);
    assert.equal(StatusHelper.getPagesSkipped(), 1);
    assert.deepEqual(output.navigation.QuickLaunch.items, []);
    assert.equal(PagesHelper.getHomepage(), null);
    const [warning] = StatusHelper.getWarnings();
    assert.match(warning, /Skipped ".*about\.md": the site already has a page/);
    assert.match(warning, /--existingPages update' adopts it again/);
  });

  test(`protect still updates a tracked page (${pageMode})`, { skip: skipFake }, async (t) => {
    t.after(resetAll);
    resetAll();
    const calls = await setupCli(t, { fail: true, options: { pageMode } });
    const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
    const file = await writePage(startFolder, "about.md", { title: "About" });
    PagesHelper.pages = listed(`about.${ext}`);
    tracked(`about.${ext}`);

    await assert.rejects(
      DoctorTranspiler.processFile(
        file,
        task(),
        { webUrl: WEB_URL, startFolder, pageMode, existingPages: "protect" },
        { navigation: null },
      ),
      /stopped by the test/,
    );

    // It went on to write the page
    const written = (await calls()).join("\n");
    assert.match(written, pageMode === "html" ? /spo file add/ : /spo page get/);
    assert.equal(ExistingPagesHelper.getProtectedCount(), 0);
    assert.deepEqual(StatusHelper.getWarnings(), []);
  });

  test(`fail stops on an untracked page that slipped past the check (${pageMode})`, async (t) => {
    t.after(resetAll);
    resetAll();
    CliCommand.init({ commandName: "m365", pageMode });
    const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
    const file = await writePage(startFolder, "about.md", { title: "About" });
    PagesHelper.pages = listed(`about.${ext}`);
    tracked();

    await assert.rejects(
      DoctorTranspiler.processFile(
        file,
        task(),
        { webUrl: WEB_URL, startFolder, pageMode, existingPages: "fail" },
        { navigation: null },
      ),
      new RegExp(`1 page on the site has the name.*\\n  - about\\.${ext}`),
    );
  });
}

test("update writes over an untracked page, as before", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  const calls = await setupCli(t, { fail: true });
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
  const file = await writePage(startFolder, "about.md", { title: "About" });
  PagesHelper.pages = listed("about.aspx");
  tracked();

  await assert.rejects(
    DoctorTranspiler.processFile(
      file,
      task(),
      { webUrl: WEB_URL, startFolder, existingPages: "update" },
      { navigation: null },
    ),
    /stopped by the test/,
  );
  assert.match((await calls()).join("\n"), /spo page get/);
});

test("a translation page is never treated as foreign", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  const calls = await setupCli(t, { fail: true });
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
  const file = await writePage(startFolder, "about.nl.lang.md", { title: "Over" });
  // SharePoint made the page moments ago, so the state does not have it yet
  PagesHelper.pages = listed("nl/about.aspx");
  tracked("about.aspx");

  await assert.rejects(
    DoctorTranspiler.processFile(
      file,
      task(),
      { webUrl: WEB_URL, startFolder, existingPages: "protect" },
      { navigation: null },
      "nl/about.aspx",
      0,
      0,
      "about.aspx",
    ),
    /stopped by the test/,
  );
  assert.match((await calls()).join("\n"), /spo page get/);
  assert.equal(ExistingPagesHelper.getProtectedCount(), 0);
});

test("the translations of a protected page are skipped", async (t) => {
  t.after(resetAll);
  resetAll();
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-existing-"));
  const file = join(startFolder, "home.md");
  await writeFile(
    file,
    `---\ntitle: Home\nslug: home.aspx\nlocalization:\n  "nl-nl": ./home.nl.lang.md\n---\n\n# Home\n`,
    "utf-8",
  );
  ExistingPagesHelper.protect("home.aspx", "home.md");

  // Reaching SharePoint here would fail: there is no access token to get
  await DoctorTranspiler.processTranslations(
    [file],
    task(),
    {
      webUrl: WEB_URL,
      startFolder,
      multilingual: { enableTranslations: true, languages: [1043] },
    },
    { navigation: {} },
  );

  assert.ok(
    StatusHelper.getWarnings().some((w) =>
      /localizations of ".*home\.md" were skipped, as the site's page "home\.aspx" is not doctor's/.test(w),
    ),
  );
});

test("the cleanup only removes doctor's pages under protect and fail", (t) => {
  t.after(resetAll);
  resetAll();
  tracked("guides/start.aspx");
  const untouched = ["guides/start.aspx", "about.aspx"];

  assert.deepEqual(ExistingPagesHelper.onlyOwned(untouched, { existingPages: "update" }), untouched);
  assert.deepEqual(ExistingPagesHelper.onlyOwned(untouched, { existingPages: "protect" }), [
    "guides/start.aspx",
  ]);
  assert.deepEqual(ExistingPagesHelper.onlyOwned(untouched, { existingPages: "fail" }), [
    "guides/start.aspx",
  ]);
});

test("--cleanEnd under protect leaves the site's own pages", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  const calls = await setupCli(t);
  PagesHelper.pages = listed("old-doctor-page.aspx", "about.aspx", "kept.aspx");
  tracked("old-doctor-page.aspx", "kept.aspx");
  PagesHelper.markKnown("kept.aspx");

  await PagesHelper.clean(WEB_URL, task(), { existingPages: "protect" });
  const removed = (await calls()).filter((c) => c.startsWith("spo file remove"));
  assert.equal(removed.length, 1);
  assert.match(removed[0], /old-doctor-page\.aspx/);
});

test("--cleanEnd under update removes every untouched page, as before", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  const calls = await setupCli(t);
  PagesHelper.pages = listed("old-doctor-page.aspx", "about.aspx");
  tracked("old-doctor-page.aspx");

  await PagesHelper.clean(WEB_URL, task(), { existingPages: "update" });
  assert.equal((await calls()).filter((c) => c.startsWith("spo file remove")).length, 2);
});

test("--cleanStart under protect removes the tracked pages only", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  const calls = await setupCli(t);
  tracked("guides/start.aspx", "nl/home.aspx");

  const removed = await ExistingPagesHelper.removeOwnedPages(WEB_URL, task(), {});
  assert.equal(removed, 2);
  const log = (await calls()).join("\n");
  assert.match(log, /spo file remove .*sitepages\/guides\/start\.aspx/);
  assert.match(log, /spo file remove .*sitepages\/nl\/home\.aspx/);
  assert.doesNotMatch(log, /spo folder remove/);
  // Dropped from the state, so a surviving state file cannot call them unchanged
  assert.deepEqual(StateHelper.getTrackedSlugs(), []);
});

test("only a welcome page doctor published may be replaced", (t) => {
  t.after(resetAll);
  resetAll();
  tracked("home.aspx");

  assert.equal(ExistingPagesHelper.isOwnedWelcomePage("SitePages/Home.aspx"), true);
  assert.equal(ExistingPagesHelper.isOwnedWelcomePage("SitePages/Department.aspx"), false);
  assert.equal(ExistingPagesHelper.isOwnedWelcomePage("Pages/default.aspx"), false);
  assert.equal(ExistingPagesHelper.isOwnedWelcomePage(""), true);
});

test("the site's own homepage is reported, doctor's is not", { skip: skipFake }, async (t) => {
  t.after(resetAll);
  resetAll();
  tracked("home.aspx");

  await setupCli(t, {
    responses: { "spo web get": JSON.stringify({ WelcomePage: "SitePages/Department.aspx" }) },
  });
  assert.equal(
    await ExistingPagesHelper.getForeignHomepage(WEB_URL),
    "SitePages/Department.aspx",
  );

  await setupCli(t, {
    responses: { "spo web get": JSON.stringify({ WelcomePage: "SitePages/Home.aspx" }) },
  });
  assert.equal(await ExistingPagesHelper.getForeignHomepage(WEB_URL), null);
});

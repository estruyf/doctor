import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliCommand } from "../dist/helpers/CliCommand.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";

/**
 * `createPageIfNotExists` creates a page when looking it up fails. A lookup can
 * fail for a page that is there — a timeout, a 5xx — and creating it then
 * replaced it: a page in a folder is created at the root and moved over the
 * existing one with `nameConflictBehavior: replace`.
 */
const webUrl = "https://contoso.sharepoint.com/sites/docs";

/**
 * A stand-in for the CLI for Microsoft 365. `spo page get` answers the way
 * FAKE_CLI_PAGE_GET says, and `spo page set` fails when FAKE_CLI_SET_FAILS is
 * set; everything else succeeds. Every command is logged.
 */
const fakeCli = `#!/usr/bin/env node
const { appendFileSync } = require("fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CLI_LOG, args.slice(0, 3).join(" ") + "\\n");
const command = args.slice(0, 3).join(" ");
if (command === "spo page get") {
  const mode = process.env.FAKE_CLI_PAGE_GET;
  if (mode === "missing") { process.stderr.write("File Not Found."); process.exit(1); }
  if (mode === "unreachable") { process.stderr.write("socket hang up"); process.exit(1); }
  process.stdout.write(JSON.stringify({ ListItemAllFields: { Id: 7 }, title: "Old title", layoutType: "Article", commentsDisabled: false }));
  process.exit(0);
}
if (command === "spo page set" && process.env.FAKE_CLI_SET_FAILS) {
  process.stderr.write("Service Unavailable"); process.exit(1);
}
process.stdout.write("{}");
`;

const setup = async (t, { pageGet, setFails = false, listed = [] }) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-lookup-"));
  const cli = join(dir, "fake-m365.cjs");
  const log = join(dir, "calls.log");
  await writeFile(cli, fakeCli, "utf-8");
  await chmod(cli, 0o755);
  await writeFile(log, "", "utf-8");

  process.env.FAKE_CLI_LOG = log;
  process.env.FAKE_CLI_PAGE_GET = pageGet;
  if (setFails) process.env.FAKE_CLI_SET_FAILS = "1";

  PagesHelper.reset();
  PagesHelper.pages = listed.map((FileRef, ID) => ({ FileRef, ID }));
  CliCommand.reset();
  CliCommand.init({ commandName: cli });

  t.after(() => {
    PagesHelper.reset();
    CliCommand.reset();
    delete process.env.FAKE_CLI_LOG;
    delete process.env.FAKE_CLI_PAGE_GET;
    delete process.env.FAKE_CLI_SET_FAILS;
  });

  return async () => (await readFile(log, "utf-8")).split("\n").filter(Boolean);
};

const skip = process.platform === "win32" && "the fake CLI is a shebang script";

test("a listed page that cannot be read is left alone, not created again", { skip }, async (t) => {
  const calls = await setup(t, {
    pageGet: "unreachable",
    listed: ["/sites/docs/SitePages/setup.aspx"],
  });

  await assert.rejects(
    PagesHelper.createPageIfNotExists(webUrl, "setup.aspx", "Setup"),
    /exists on the site, but could not be read/,
  );
  assert.deepEqual(await calls(), ["spo page get"]);
});

test("a page that is not there is created", { skip }, async (t) => {
  const calls = await setup(t, { pageGet: "missing" });

  const existed = await PagesHelper.createPageIfNotExists(webUrl, "new-page.aspx", "New page");

  assert.equal(existed, false);
  assert.deepEqual(await calls(), ["spo page get", "spo page add"]);
});

test("a page that was found is not created when updating it fails", { skip }, async (t) => {
  const calls = await setup(t, { pageGet: "found", setFails: true });

  await assert.rejects(
    PagesHelper.createPageIfNotExists(webUrl, "setup.aspx", "New title"),
    /Service Unavailable/,
  );
  assert.deepEqual(await calls(), ["spo page get", "spo page set"]);
});

test("a listed page on a root site is recognised too", { skip }, async (t) => {
  // The relative url used to be cut out of the site url at "sharepoint.com",
  // which leaves `//sitepages/...` for a root site and never matched
  const calls = await setup(t, {
    pageGet: "unreachable",
    listed: ["/SitePages/setup.aspx"],
  });

  await assert.rejects(
    PagesHelper.createPageIfNotExists("https://contoso.sharepoint.com", "setup.aspx", "Setup"),
    /exists on the site, but could not be read/,
  );
  assert.deepEqual(await calls(), ["spo page get"]);
});

test("a listed page on another cloud's domain is recognised too", { skip }, async (t) => {
  await setup(t, {
    pageGet: "unreachable",
    listed: ["/sites/docs/SitePages/guides/Setup.aspx"],
  });

  await assert.rejects(
    PagesHelper.createPageIfNotExists("https://contoso.sharepoint.us/sites/docs", "guides/setup.aspx", "Setup"),
    /exists on the site, but could not be read/,
  );
});

test("skipExistingPages finds a page on a root site without asking for it", { skip }, async (t) => {
  const calls = await setup(t, { pageGet: "unreachable", listed: ["/SitePages/setup.aspx"] });

  const existed = await PagesHelper.createPageIfNotExists(
    "https://contoso.sharepoint.com",
    "setup.aspx",
    "Setup",
    "Article",
    false,
    "",
    null,
    true,
  );

  assert.equal(existed, true);
  assert.deepEqual(await calls(), []);
});

test("a translation is never created by doctor, even when it is not listed yet", { skip }, async (t) => {
  // SharePoint creates a translation's page during the run, after the list of
  // pages was read, so the list cannot vouch for it
  const calls = await setup(t, { pageGet: "unreachable" });

  await assert.rejects(
    PagesHelper.createPageIfNotExists(
      webUrl,
      "nl/setup.aspx",
      "Installatie",
      "Article",
      false,
      "",
      null,
      false,
      false,
      true,
    ),
    /exists on the site, but could not be read/,
  );
  assert.deepEqual(await calls(), ["spo page get"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliCommand } from "../dist/helpers/CliCommand.js";
import { FolderHelpers } from "../dist/helpers/FolderHelpers.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";

/**
 * SharePoint words the "already exists" error in the site's language. On a
 * French site, adding the `.doctor` folder of the publish state a second time
 * failed with "Un fichier ou un dossier nommé ... existe déjà", which did not
 * read as "already exists" and stopped the publish (#210). Whether the folder
 * or page is there is now asked of the site instead.
 */
const webUrl = "https://contoso.sharepoint.com/sites/docs";
const FRENCH_EXISTS =
  "Un fichier ou un dossier nommé sites/docs/DoctorPages/.doctor existe déjà.";

/**
 * A stand-in for the CLI for Microsoft 365. `spo folder add` and `spo page add`
 * fail with FAKE_CLI_ADD_ERROR when it is set. `spo folder get` finds the folder
 * when FAKE_CLI_EXISTS is set, and `spo page get` finds the page once an add
 * was attempted and FAKE_CLI_EXISTS is set. Every command is logged.
 */
const fakeCli = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("fs");
const args = process.argv.slice(2);
const command = args.slice(0, 3).join(" ");
const before = readFileSync(process.env.FAKE_CLI_LOG, "utf-8");
appendFileSync(process.env.FAKE_CLI_LOG, command + "\\n");
const exists = !!process.env.FAKE_CLI_EXISTS;
if ((command === "spo folder add" || command === "spo page add") && process.env.FAKE_CLI_ADD_ERROR) {
  process.stderr.write(process.env.FAKE_CLI_ADD_ERROR); process.exit(1);
}
if (command === "spo folder get" && !exists) {
  process.stderr.write("Le fichier est introuvable."); process.exit(1);
}
if (command === "spo page get" && !(exists && before.includes("spo page add"))) {
  process.stderr.write("Le fichier est introuvable."); process.exit(1);
}
process.stdout.write(JSON.stringify({ Exists: true, ListItemAllFields: { Id: 7 } }));
`;

const setup = async (t, { addError, exists }) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-exists-"));
  const cli = join(dir, "fake-m365.cjs");
  const log = join(dir, "calls.log");
  await writeFile(cli, fakeCli, "utf-8");
  await chmod(cli, 0o755);
  await writeFile(log, "", "utf-8");

  process.env.FAKE_CLI_LOG = log;
  if (addError) process.env.FAKE_CLI_ADD_ERROR = addError;
  if (exists) process.env.FAKE_CLI_EXISTS = "1";

  PagesHelper.reset();
  CliCommand.reset();
  CliCommand.init({ commandName: cli });

  t.after(() => {
    PagesHelper.reset();
    CliCommand.reset();
    delete process.env.FAKE_CLI_LOG;
    delete process.env.FAKE_CLI_ADD_ERROR;
    delete process.env.FAKE_CLI_EXISTS;
  });

  return async () => (await readFile(log, "utf-8")).split("\n").filter(Boolean);
};

const skip = process.platform === "win32" && "the fake CLI is a shebang script";

test("a folder that already exists on a French site is accepted", { skip }, async (t) => {
  const calls = await setup(t, { addError: FRENCH_EXISTS, exists: true });

  await FolderHelpers.add(webUrl, "/DoctorPages", ".doctor");

  assert.deepEqual(await calls(), ["spo folder add", "spo folder get"]);
});

test("a folder that could not be added and is not there fails with the add's error", { skip }, async (t) => {
  const calls = await setup(t, { addError: "Accès refusé." });

  await assert.rejects(
    FolderHelpers.add(webUrl, "/DoctorPages", ".doctor"),
    /spo folder add\. Accès refusé\./
  );
  assert.deepEqual(await calls(), ["spo folder add", "spo folder get"]);
});

test("a folder that is added is not looked up", { skip }, async (t) => {
  const calls = await setup(t, {});

  await FolderHelpers.add(webUrl, "/DoctorPages", ".doctor");

  assert.deepEqual(await calls(), ["spo folder add"]);
});

test("a page that already exists on a French site is accepted", { skip }, async (t) => {
  const calls = await setup(t, {
    addError: "Un fichier nommé SitePages/setup.aspx existe déjà.",
    exists: true,
  });

  const existed = await PagesHelper.createPageIfNotExists(webUrl, "setup.aspx", "Setup");

  assert.equal(existed, false);
  assert.deepEqual(await calls(), ["spo page get", "spo page add", "spo page get"]);
});

test("a page that could not be added and is not there fails with the add's error", { skip }, async (t) => {
  await setup(t, { addError: "Accès refusé." });

  await assert.rejects(
    PagesHelper.createPageIfNotExists(webUrl, "setup.aspx", "Setup"),
    /spo page add\. Accès refusé\./
  );
});

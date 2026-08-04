import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";
import { NavigationHelper } from "../dist/helpers/NavigationHelper.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";
import {
  CliCommand,
  DEFAULT_COMMAND_TIMEOUT,
} from "../dist/helpers/CliCommand.js";
import { relativePath } from "../dist/utils/relativePath.js";

test("FrontMatterHelper.getSlug generates slug from title and folder path", () => {
  const slug = FrontMatterHelper.getSlug(
    { title: "Getting Started" },
    "./docs",
    "./docs/guides/intro.md"
  );

  assert.equal(slug, "guides/getting-started.aspx");
});

test("FrontMatterHelper.getSlug appends .aspx to explicit slug", () => {
  const slug = FrontMatterHelper.getSlug(
    { title: "Ignored", slug: "custom/page" },
    "./docs",
    "./docs/intro.md"
  );

  assert.equal(slug, "custom/page.aspx");
});

test("NavigationHelper.hierarchy creates nested parents and page link", () => {
  const result = NavigationHelper.hierarchy(
    "https://contoso.sharepoint.com/sites/docs",
    {},
    {
      QuickLaunch: {
        id: "gettingstarted",
        name: "Getting Started",
        parent: "Docs/Guides",
        weight: 1,
      },
    },
    "getting-started.aspx",
    "Getting Started"
  );

  const root = result.QuickLaunch.items[0];
  assert.equal(root.id, "docs");
  assert.equal(root.items?.[0]?.id, "guides");
  assert.equal(root.items?.[0]?.items?.[0]?.id, "gettingstarted");
  assert.equal(
    root.items?.[0]?.items?.[0]?.url,
    "https://contoso.sharepoint.com/sites/docs/sitepages/getting-started.aspx"
  );
});

test("OptionsHelper.parseArguments maps raw CLI arguments", () => {
  const parsed = OptionsHelper.parseArguments({}, [
    "node",
    "doctor",
    "publish",
    "--url",
    "https://contoso.sharepoint.com/sites/docs",
    "--folder",
    "./docs",
    "--forceAll",
    "--applyTheme",
  ]);

  assert.equal(parsed.task, "publish");
  assert.equal(parsed.webUrl, "https://contoso.sharepoint.com/sites/docs");
  assert.equal(parsed.startFolder, "./docs");
  assert.equal(parsed.forceAll, true);
  assert.equal(parsed.applyTheme, true);
  assert.equal(parsed.auth, "certificate");
});

test("OptionsHelper.parseArguments always resolves to certificate authentication", () => {
  const parsed = OptionsHelper.parseArguments({ auth: "deviceCode" }, [
    "node",
    "doctor",
    "publish",
    "--auth",
    "password",
  ]);

  assert.equal(parsed.auth, "certificate");
});

test("OptionsHelper.parseArguments takes the options from the doctor.json config", () => {
  const config = {
    url: "https://contoso.sharepoint.com/sites/docs",
    folder: "./docs",
    library: "Documents",
    stateFile: "publish/state.json",
    disableStatePersistence: true,
    forceAll: true,
    skipPrecheck: true,
    applyTheme: true,
    verbose: true,
    timingDetails: true,
  };

  const parsed = OptionsHelper.parseArguments(config, ["node", "doctor", "publish"]);

  assert.equal(parsed.webUrl, config.url);
  assert.equal(parsed.assetLibrary, "Documents");
  assert.equal(parsed.stateFile, "publish/state.json");
  assert.equal(parsed.disableStatePersistence, true);
  assert.equal(parsed.forceAll, true);
  assert.equal(parsed.skipPrecheck, true);
  assert.equal(parsed.applyTheme, true);
  assert.equal(parsed.verbose, true);
  assert.equal(parsed.timingDetails, true);
});

test("OptionsHelper.parseArguments falls back to the default state file", () => {
  const parsed = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);

  assert.equal(parsed.stateFile, ".doctor/state.json");
  assert.equal(parsed.disableStatePersistence, false);
  assert.equal(parsed.applyTheme, false);
});

test("OptionsHelper.parseArguments takes the commandTimeout from the arguments and config", () => {
  const fromArgs = OptionsHelper.parseArguments({ commandTimeout: 60000 }, [
    "node",
    "doctor",
    "publish",
    "--commandTimeout",
    "300000",
  ]);
  assert.equal(fromArgs.commandTimeout, 300000);

  const fromConfig = OptionsHelper.parseArguments({ commandTimeout: 60000 }, [
    "node",
    "doctor",
    "publish",
  ]);
  assert.equal(fromConfig.commandTimeout, 60000);

  const notProvided = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);
  assert.equal(notProvided.commandTimeout, null);
});

test("CliCommand.getTimeout uses the configured command timeout", (t) => {
  t.after(() => CliCommand.reset());

  CliCommand.init({ commandTimeout: 300000 });
  assert.equal(CliCommand.getTimeout(), 300000);

  // The value can come from doctor.json, so it can be a string as well
  CliCommand.init({ commandTimeout: "45000" });
  assert.equal(CliCommand.getTimeout(), 45000);
});

test("CliCommand.getTimeout falls back to the default for missing or invalid values", (t) => {
  t.after(() => CliCommand.reset());

  for (const value of [undefined, null, "", 0, -1000, "abc", 12.5, Infinity]) {
    CliCommand.init({ commandTimeout: value });
    assert.equal(
      CliCommand.getTimeout(),
      DEFAULT_COMMAND_TIMEOUT,
      `Expected the default timeout for value "${value}"`
    );
  }
});

test("CliCommand.reset restores the default command timeout", () => {
  CliCommand.init({ commandTimeout: 300000 });
  CliCommand.reset();

  assert.equal(CliCommand.getTimeout(), DEFAULT_COMMAND_TIMEOUT);
});

test("relativePath makes paths relative to the working directory", () => {
  const filePath = join(process.cwd(), "src", "docs", "guides", "index.md");

  assert.equal(relativePath(filePath), "src/docs/guides/index.md");
});

test("relativePath keeps paths outside the working directory absolute", () => {
  const filePath = join(process.cwd(), "..", "elsewhere", "index.md");

  assert.equal(relativePath(filePath), filePath);
});

test("relativePath returns falsy values untouched", () => {
  assert.equal(relativePath(""), "");
});

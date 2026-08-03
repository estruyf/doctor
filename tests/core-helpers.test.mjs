import test from "node:test";
import assert from "node:assert/strict";

import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";
import { NavigationHelper } from "../dist/helpers/NavigationHelper.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";

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
  assert.equal(parsed.auth, "deviceCode");
});

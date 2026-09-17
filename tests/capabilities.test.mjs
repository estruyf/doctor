import test from "node:test";
import assert from "node:assert/strict";

import { CapabilitiesHelper } from "../dist/helpers/CapabilitiesHelper.js";

// SharePoint returns the 64-bit permission mask as two 32-bit halves, as strings
const mask = (...permissions) => {
  const BITS = {
    viewListItems: 1,
    addListItems: 2,
    editListItems: 3,
    deleteListItems: 4,
    openItems: 6,
    manageLists: 12,
    manageWeb: 31,
  };
  let low = 0;
  let high = 0;
  for (const name of permissions) {
    const bit = BITS[name] - 1;
    if (bit < 32) low += Math.pow(2, bit);
    else high += Math.pow(2, bit - 32);
  }
  return { High: String(high), Low: String(low) };
};

const READS = { termStore: true, siteUsers: true };

test("a permission is read out of the mask", () => {
  const m = mask("addListItems", "editListItems");
  assert.equal(CapabilitiesHelper.hasPermission(m, "addListItems"), true);
  assert.equal(CapabilitiesHelper.hasPermission(m, "editListItems"), true);
  assert.equal(CapabilitiesHelper.hasPermission(m, "manageLists"), false);
  assert.equal(CapabilitiesHelper.hasPermission(m, "manageWeb"), false);
});

test("manageWeb is read correctly despite sitting on bit 31", () => {
  // `1 << 31` is negative in JavaScript, which is the bug this guards
  const m = mask("manageWeb");
  assert.equal(CapabilitiesHelper.hasPermission(m, "manageWeb"), true);
  assert.equal(CapabilitiesHelper.hasPermission(m, "addListItems"), false);
});

test("a missing or unreadable mask grants nothing", () => {
  assert.equal(CapabilitiesHelper.hasPermission(null, "manageWeb"), false);
  assert.equal(CapabilitiesHelper.hasPermission(undefined, "manageWeb"), false);
  assert.equal(
    CapabilitiesHelper.hasPermission({ High: "x", Low: "y" }, "manageWeb"),
    false,
  );
});

test("an account that can edit pages but not the web can still publish", () => {
  // The shape the reported run had: rights on Site Pages, none on the site
  const c = CapabilitiesHelper.toCapabilities(
    mask("viewListItems"),
    mask("addListItems", "editListItems"),
    mask("addListItems", "editListItems"),
    READS,
  );

  assert.equal(c.determined, true);
  assert.equal(c.publishPages, true);
  assert.equal(c.setMetadata, true);
  assert.equal(c.writeAssets, true);
  // The ones that were failing the run at the very end
  assert.equal(c.manageNavigation, false);
  assert.equal(c.manageSiteDesign, false);
  assert.equal(c.systemUpdate, false);
});

test("a site collection administrator can do everything", () => {
  const all = mask(
    "viewListItems",
    "addListItems",
    "editListItems",
    "deleteListItems",
    "openItems",
    "manageLists",
    "manageWeb",
  );
  const c = CapabilitiesHelper.toCapabilities(all, all, all, READS);

  for (const [name, value] of Object.entries(c)) {
    assert.equal(value, true, `${name} should be allowed`);
  }
});

test("read-only access cannot publish", () => {
  const c = CapabilitiesHelper.toCapabilities(
    mask("viewListItems"),
    mask("viewListItems"),
    mask("viewListItems"),
    READS,
  );

  assert.equal(c.publishPages, false);
  assert.equal(c.setMetadata, false);
});

test("an unreadable asset library is not taken as a refusal", () => {
  const c = CapabilitiesHelper.toCapabilities(
    mask("manageWeb"),
    mask("addListItems", "editListItems"),
    null,
    READS,
  );
  assert.equal(c.writeAssets, true);
});

test("a failed read marks the capability it belongs to", () => {
  const c = CapabilitiesHelper.toCapabilities(
    mask("manageWeb"),
    mask("addListItems", "editListItems"),
    null,
    { termStore: false, siteUsers: false },
  );
  assert.equal(c.readTermStore, false);
  assert.equal(c.readSiteUsers, false);
});

test("the report says what will not run, and why", () => {
  const c = CapabilitiesHelper.toCapabilities(
    mask("viewListItems"),
    mask("addListItems", "editListItems"),
    null,
    READS,
  );
  const lines = CapabilitiesHelper.describe(c, {
    assetLibrary: "Shared Documents",
    siteDesign: { theme: "Red" },
    menu: {},
  });

  const joined = lines.join("\n");
  assert.match(joined, /yes {2}Publish pages/);
  assert.match(joined, / no {2}Manage the site navigation — the 'menu' setting is skipped/);
  assert.match(joined, / no {2}Change the look of the site/);
  assert.match(joined, / no {2}Update a page without changing its history/);
});

test("the report leaves out the steps this run was not going to take", () => {
  const c = CapabilitiesHelper.toCapabilities(
    mask("viewListItems"),
    mask("addListItems", "editListItems"),
    null,
    READS,
  );
  // No menu and no siteDesign configured
  const lines = CapabilitiesHelper.describe(c, { assetLibrary: "Shared Documents" });

  assert.equal(lines.some((l) => l.includes("navigation")), false);
  assert.equal(lines.some((l) => l.includes("look of the site")), false);
});

test("a probe that could not run says so and assumes nothing is blocked", () => {
  const lines = CapabilitiesHelper.describe(CapabilitiesHelper.get(), {});
  assert.match(lines.join(""), /could not read this site's permissions/);
  assert.equal(CapabilitiesHelper.get().manageNavigation, true);
});

//
// The gates behind the report
//

test("the report only promises a skip for a step that is gated", () => {
  // Every "no" line which says something is skipped has to have a gate behind
  // it in the publish path, or the report is describing something that will
  // not happen. These are the four:
  //   publish.ts                      navigation, site design
  //   PagesHelper.resolveMetadata     columns and author
  //   DoctorTranspiler.processFile    pages which reference an image
  //   StateHelper.save                the state file
  const lines = CapabilitiesHelper.describe(
    {
      determined: true,
      publishPages: true,
      setMetadata: false,
      systemUpdate: false,
      manageNavigation: false,
      manageSiteDesign: false,
      writeAssets: false,
      readTermStore: false,
      readSiteUsers: false,
    },
    {
      webUrl: "https://contoso.sharepoint.com/sites/docs",
      assetLibrary: "Shared Documents",
      menu: { QuickLaunch: {} },
      siteDesign: { theme: "Red" },
    },
  );

  const skips = lines.filter((line) => line.startsWith(" no") && / is skipped| are skipped/.test(line));

  assert.deepEqual(
    skips.map((line) => line.replace(/^ no\s+/, "").split(" — ")[0]).sort(),
    [
      "Change the look of the site",
      "Manage the site navigation",
      "Read the site users",
      "Read the term store",
      "Set page metadata",
      `Upload assets to "Shared Documents"`,
    ],
  );

  // The one that is not a skip says what it costs instead
  const systemUpdate = lines.find((line) => line.includes("without changing its history"));
  assert.match(systemUpdate, /'Modified' and 'Modified By'/);
  assert.ok(!/ is skipped/.test(systemUpdate));
});

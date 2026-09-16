import test from "node:test";
import assert from "node:assert/strict";

import { CapabilitiesHelper } from "../dist/helpers/CapabilitiesHelper.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";
import { OutputHelper } from "../dist/helpers/OutputHelper.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

const ALL_BUT = (overrides) => ({
  determined: true,
  publishPages: true,
  setMetadata: true,
  systemUpdate: true,
  manageNavigation: true,
  manageSiteDesign: true,
  writeAssets: true,
  readTermStore: true,
  readSiteUsers: true,
  ...overrides,
});

/** Puts the probed capabilities in place and captures what gets warned about */
const withCapabilities = (t, capabilities) => {
  const realWarning = OutputHelper.warning;
  const warnings = [];
  OutputHelper.warning = (message) => warnings.push(message);

  CapabilitiesHelper.reset();
  Object.assign(CapabilitiesHelper.get(), capabilities);

  t.after(() => {
    OutputHelper.warning = realWarning;
    CapabilitiesHelper.reset();
    PagesHelper.reset();
    StateHelper.reset();
  });
  PagesHelper.reset();
  StateHelper.reset();

  return warnings;
};

test("Metadata is not worked out at all when it cannot be written", async (t) => {
  // Resolving would walk the term store and look users up on every page, to
  // produce values that cannot land anywhere
  const warnings = withCapabilities(t, ALL_BUT({ setMetadata: false }));

  const result = await PagesHelper.resolveMetadata(
    WEB_URL,
    "page.aspx",
    { Category: "Finance" },
    "author@contoso.com",
  );

  assert.deepEqual(result.values, {});
  assert.deepEqual(result.problems, [], "the page is published, not skipped");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not allowed to set columns/);
});

test("The account being unable to set columns is said once, not per page", async (t) => {
  const warnings = withCapabilities(t, ALL_BUT({ setMetadata: false }));

  for (const slug of ["a.aspx", "b.aspx", "c.aspx"]) {
    await PagesHelper.resolveMetadata(WEB_URL, slug, { Category: "Finance" });
  }

  assert.equal(warnings.length, 1);
});

test("Metadata is still worked out when it can be written", async (t) => {
  withCapabilities(t, ALL_BUT({}));

  // No metadata and no author short-circuits before any call, which is enough
  // to show the gate above is not swallowing the normal path
  const result = await PagesHelper.resolveMetadata(WEB_URL, "page.aspx", null);
  assert.deepEqual(result, { values: {}, problems: [] });
});

test("The publish state is not saved when the asset library is not writable", async (t) => {
  // The state is saved after every page, so without this the run would fail
  // once per page instead of carrying on
  const warnings = withCapabilities(t, ALL_BUT({ writeAssets: false }));

  StateHelper.state = { version: 1, pages: {} };

  await StateHelper.save(WEB_URL, "Shared Documents", ".doctor/state.json");
  await StateHelper.save(WEB_URL, "Shared Documents", ".doctor/state.json");

  assert.equal(warnings.length, 1, "said once, not per page");
  assert.match(warnings[0], /publish state was not saved/);
});

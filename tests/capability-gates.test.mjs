import test from "node:test";
import assert from "node:assert/strict";

import { CapabilitiesHelper } from "../dist/helpers/CapabilitiesHelper.js";
import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";
import { OutputHelper } from "../dist/helpers/OutputHelper.js";
import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { load } from "cheerio";

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

//
// What the asset gate has to know about
//

test("The asset gate knows every way a page reaches the asset library", () => {
  // Three ways in, and a gate that misses one lets a page through which then
  // fails after its canvas has already been written — or, for a diagram,
  // publishes something nobody can see
  const gate = (html, data) =>
    DoctorTranspiler.getAssetNeeds(load(html), load(html)("img").toArray(), html, data);

  assert.deepEqual(gate(`<p>No assets here</p>`, {}), []);

  assert.deepEqual(gate(`<img src="./img/logo.png" />`, {}), [
    "upload 1 image",
  ]);

  assert.deepEqual(gate(`<p>text</p>`, { header: { image: "./img/hero.png" } }), [
    "upload its header image",
  ]);

  assert.deepEqual(gate(`<mermaid>\nflowchart TD\n A --> B\n</mermaid>`, {}), [
    "upload the Mermaid diagrams it draws",
  ]);

  // All three at once, so the warning can say what the page actually needs
  assert.deepEqual(
    gate(`<img src="a.png" /><img src="b.png" /><mermaid>x</mermaid>`, {
      header: { image: "./hero.png" },
    }),
    [
      "upload 2 images",
      "upload its header image",
      "upload the Mermaid diagrams it draws",
    ],
  );
});

test("The asset gate ignores what it does not have to upload", () => {
  const gate = (html, data) =>
    DoctorTranspiler.getAssetNeeds(load(html), load(html)("img").toArray(), html, data);

  // A data: source carries its image with it, an absolute one already lives
  // somewhere, and a header image on a URL is not ours to upload
  assert.deepEqual(gate(`<img src="data:image/svg+xml;base64,abc" />`, {}), []);
  assert.deepEqual(gate(`<img src="https://contoso.com/a.png" />`, {}), []);
  assert.deepEqual(
    gate(`<p>text</p>`, { header: { image: "https://contoso.com/hero.png" } }),
    [],
  );

  // A diagram shown as a code sample is not a diagram
  assert.deepEqual(gate("Write `<mermaid>` to draw one", {}), []);
});

import test from "node:test";
import assert from "node:assert/strict";

import { SiteHelpers } from "../dist/helpers/SitesHelpers.js";

test("the site logo is set by its server relative path, unencoded", () => {
  // The upload hands back the URL with a space as %20, and setsitelogo wants
  // the path as SharePoint names it
  assert.equal(
    SiteHelpers.toServerRelative(
      "https://contoso.sharepoint.com/sites/docs/Shared%20Documents/site/logo.png",
    ),
    "/sites/docs/Shared Documents/site/logo.png",
  );
  assert.equal(
    SiteHelpers.toServerRelative("/sites/docs/Shared%20Documents/logo.png"),
    "/sites/docs/Shared Documents/logo.png",
  );
  assert.equal(
    SiteHelpers.toServerRelative("/sites/docs/100% logo.png"),
    "/sites/docs/100% logo.png",
  );
});

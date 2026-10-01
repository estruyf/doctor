import test from "node:test";
import assert from "node:assert/strict";

import { toODataPath } from "../dist/utils/toODataPath.js";
import { CanvasHelper } from "../dist/helpers/CanvasHelper.js";
import { CapabilitiesHelper } from "../dist/helpers/CapabilitiesHelper.js";
import { ApiHelper } from "../dist/helpers/ApiHelper.js";
import { AccessToken } from "../dist/helpers/AccessToken.js";

/**
 * A page's slug goes inside an OData string: `GetByUrl('sitepages/<slug>')`.
 * `encodeURIComponent` leaves a `'` alone, so a page titled "What's new" ended
 * the string early and SharePoint refused every call for it.
 */

test("a quote in an OData path is doubled", () => {
  assert.equal(toODataPath("what's-new.aspx"), "what''s-new.aspx");
  assert.equal(toODataPath("guides/it's here.aspx"), "guides%2Fit''s%20here.aspx");
});

test("the segments can be encoded with the slashes kept", () => {
  assert.equal(
    toODataPath("guides/it's here.aspx", true),
    "guides/it''s%20here.aspx",
  );
});

test("a page with a quote in its slug is addressed by a well-formed URL", async (t) => {
  const realPost = ApiHelper.postOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.postOrThrow = realPost;
    AccessToken.get = realToken;
  });

  const requested = [];
  AccessToken.get = async () => "token";
  ApiHelper.postOrThrow = async (url) => {
    requested.push(url);
    return {};
  };

  await CanvasHelper.checkout("https://contoso.sharepoint.com/sites/docs", "what's-new.aspx");
  await CanvasHelper.save("https://contoso.sharepoint.com/sites/docs", "what's-new.aspx", []);

  assert.deepEqual(requested, [
    "https://contoso.sharepoint.com/sites/docs/_api/sitepages/pages/GetByUrl('sitepages/what''s-new.aspx')/checkoutpage",
    "https://contoso.sharepoint.com/sites/docs/_api/sitepages/pages/GetByUrl('sitepages/what''s-new.aspx')/SavePageAsDraft",
  ]);
});

test("the permission probe quotes a library path holding a quote", async (t) => {
  const realGet = ApiHelper.getOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.getOrThrow = realGet;
    AccessToken.get = realToken;
    CapabilitiesHelper.reset();
  });

  const requested = [];
  AccessToken.get = async () => "token";
  ApiHelper.getOrThrow = async (url) => {
    requested.push(url);
    return { High: "2147483647", Low: "4294967295" };
  };

  await CapabilitiesHelper.probe("https://contoso.sharepoint.com/sites/docs", {
    assetLibrary: "Team's Assets",
  });

  assert.ok(
    requested.some((url) => url.includes("GetList('%2Fsites%2Fdocs%2FTeam''s%20Assets')")),
    `asked: ${requested.join("\n")}`,
  );
});

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

test("a page in a folder is addressed with its slashes kept", async (t) => {
  const realPost = ApiHelper.postOrThrow;
  const realGet = ApiHelper.getOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.postOrThrow = realPost;
    ApiHelper.getOrThrow = realGet;
    AccessToken.get = realToken;
  });

  const requested = [];
  AccessToken.get = async () => "token";
  ApiHelper.postOrThrow = async (url) => {
    requested.push(url);
    return {};
  };
  ApiHelper.getOrThrow = async (url) => {
    requested.push(url);
    return {};
  };

  const web = "https://contoso.sharepoint.com/sites/docs";
  await CanvasHelper.checkout(web, "nl/what's new.aspx");
  await CanvasHelper.read(web, "templates/guide.aspx");

  assert.deepEqual(requested, [
    `${web}/_api/sitepages/pages/GetByUrl('sitepages/nl/what''s%20new.aspx')/checkoutpage`,
    `${web}/_api/sitepages/pages/GetByUrl('sitepages/templates/guide.aspx')`,
  ]);
});

test("a page with a quote in its slug is published by a well-formed URL", async (t) => {
  // `spo page set --publish` put the path into DecodedUrl='…' unescaped, so the
  // page was written and then failed to publish
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

  const web = "https://contoso.sharepoint.com/sites/doctor";
  await CanvasHelper.publish(web, "tests/what's-new-in-doctor-2.3.aspx");
  await CanvasHelper.setCommentsDisabled(web, "tests/what's-new-in-doctor-2.3.aspx", true);

  assert.deepEqual(requested, [
    `${web}/_api/sitepages/pages/GetByUrl('sitepages/tests/what''s-new-in-doctor-2.3.aspx')/checkoutpage`,
    `${web}/_api/web/GetFileByServerRelativePath(DecodedUrl='/sites/doctor/sitepages/tests/what''s-new-in-doctor-2.3.aspx')/CheckIn(comment=@a1,checkintype=@a2)?@a1=''&@a2=1`,
    `${web}/_api/web/GetFileByServerRelativePath(DecodedUrl='/sites/doctor/sitepages/tests/what''s-new-in-doctor-2.3.aspx')/ListItemAllFields/SetCommentsDisabled(true)`,
  ]);
});

test("a page is published with a JSON request SharePoint accepts", async (t) => {
  // Without a content type fetch labels the body text/plain, which `_api/web`
  // refuses with a 400 — the publish failed on every page
  const realFetch = globalThis.fetch;
  const realToken = AccessToken.get;
  t.after(() => {
    globalThis.fetch = realFetch;
    AccessToken.get = realToken;
  });

  const requests = [];
  AccessToken.get = async () => "token";
  globalThis.fetch = async (url, init) => {
    requests.push({ url, headers: init.headers });
    return new Response(JSON.stringify({ "odata.null": true }), { status: 200 });
  };

  const web = "https://contoso.sharepoint.com/sites/doctor";
  await CanvasHelper.publish(web, "home.aspx");
  await CanvasHelper.setCommentsDisabled(web, "home.aspx", false);

  assert.equal(requests.length, 3);
  for (const { url, headers } of requests) {
    assert.equal(headers["content-type"], "application/json", url);
  }
});

test("a content type the caller gives is kept", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = init.headers;
    return new Response("{}", { status: 200 });
  };

  await ApiHelper.postOrThrow("https://contoso.sharepoint.com/_api/x", {
    "Content-Type": "application/json;odata=verbose",
  });

  assert.deepEqual(sent, { "Content-Type": "application/json;odata=verbose" });
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

test("a canvas SharePoint cannot read is cleared, and the checkout taken again", async (t) => {
  // Creating a translation copies the source page through SharePoint's HTML
  // sanitizer, which can leave a canvas SharePoint itself cannot read. Every
  // call on the page then answers 500, the checkout included.
  const realFetch = globalThis.fetch;
  const realToken = AccessToken.get;
  t.after(() => {
    globalThis.fetch = realFetch;
    AccessToken.get = realToken;
  });

  const requests = [];
  let cleared = false;
  AccessToken.get = async () => "token";
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: init.body });
    if (url.endsWith("/checkoutpage") && !cleared) {
      return new Response(
        JSON.stringify({
          "odata.error": { message: { value: "Error reading JObject from JsonReader. Path '', line 1, position 1." } },
        }),
        { status: 500 },
      );
    }
    if (url.endsWith("/ValidateUpdateListItem")) {
      cleared = true;
      return new Response(
        JSON.stringify({ value: [{ FieldName: "CanvasContent1", HasException: false }] }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ CanvasContent1: "[]" }), { status: 200 });
  };

  const web = "https://contoso.sharepoint.com/sites/doctor";
  const page = await CanvasHelper.checkout(web, "doctor/nl/page-creation.aspx");

  assert.equal(page.CanvasContent1, "[]");
  assert.deepEqual(
    requests.map(({ url }) => url.split("/").pop()),
    ["checkoutpage", "ValidateUpdateListItem", "checkoutpage"],
  );
  assert.match(
    requests[1].url,
    /GetFileByServerRelativePath\(DecodedUrl='\/sites\/doctor\/sitepages\/doctor\/nl\/page-creation\.aspx'\)\/ListItemAllFields/,
  );
  assert.deepEqual(JSON.parse(requests[1].body).formValues, [
    { FieldName: "CanvasContent1", FieldValue: "<div></div>" },
  ]);
});

test("any other failed checkout is not mistaken for an unreadable canvas", async (t) => {
  const realFetch = globalThis.fetch;
  const realToken = AccessToken.get;
  t.after(() => {
    globalThis.fetch = realFetch;
    AccessToken.get = realToken;
  });

  const requests = [];
  AccessToken.get = async () => "token";
  globalThis.fetch = async (url) => {
    requests.push(url);
    return new Response(
      JSON.stringify({ "odata.error": { message: { value: "Access denied." } } }),
      { status: 500 },
    );
  };

  await assert.rejects(
    CanvasHelper.checkout("https://contoso.sharepoint.com/sites/doctor", "home.aspx"),
    /Access denied/,
  );
  assert.equal(requests.length, 1);
  assert.equal(CanvasHelper.isUnreadableCanvas(new Error("failed with status 404. Error reading JObject")), false);
});

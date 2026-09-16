import test from "node:test";
import assert from "node:assert/strict";

import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { ApiHelper } from "../dist/helpers/ApiHelper.js";
import { AccessToken } from "../dist/helpers/AccessToken.js";
import { OutputHelper } from "../dist/helpers/OutputHelper.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";
const CLAIM = "i:0#.f|membership|";

/**
 * Stands in for the site: `ensureuser` resolves a principal against the tenant
 * directory, adds the site user when it is not there yet, and answers with the
 * login name it stored.
 */
const withSite = (t, respond) => {
  const realPost = ApiHelper.postOrThrow;
  const realToken = AccessToken.get;
  const realWarning = OutputHelper.warning;
  const calls = [];
  const warnings = [];

  AccessToken.get = async () => "token";
  OutputHelper.warning = (message) => warnings.push(message);
  ApiHelper.postOrThrow = async (url, _headers, body) => {
    calls.push({ url, body });
    return respond(body?.logonName);
  };

  t.after(() => {
    ApiHelper.postOrThrow = realPost;
    AccessToken.get = realToken;
    OutputHelper.warning = realWarning;
    PagesHelper.reset();
  });
  PagesHelper.reset();

  return { calls, warnings };
};

test("A person column is resolved through the site, not assembled locally", async (t) => {
  const { calls } = withSite(t, (logonName) => ({
    LoginName: `${CLAIM}${logonName.toLowerCase()}`,
  }));

  const claim = await PagesHelper.ensureUserClaim(WEB_URL, "User@contoso.com");

  assert.equal(claim, `${CLAIM}user@contoso.com`);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/_api\/web\/ensureuser$/);
  assert.deepEqual(calls[0].body, { logonName: "User@contoso.com" });
});

test("The login name the site returns is used as it stands", async (t) => {
  // A guest's claim is not the shape a principal name is assembled into, so
  // building it locally would produce one SharePoint never matches
  const guest = "i:0#.f|membership|guest_contoso.com#ext#@fabrikam.onmicrosoft.com";
  withSite(t, () => ({ LoginName: guest }));

  assert.equal(
    await PagesHelper.ensureUserClaim(WEB_URL, "guest@contoso.com"),
    guest,
  );
});

test("A name the tenant does not have fails, so the page is skipped", async (t) => {
  // resolveMetadata turns this into a problem, which is what skips the page
  withSite(t, () => {
    throw new Error("The specified user nosuch@contoso.com could not be found.");
  });

  await assert.rejects(
    PagesHelper.transformUserSingle(WEB_URL, "nosuch@contoso.com"),
    /nosuch@contoso\.com.*is not a user of this tenant/,
  );
});

test("One name that cannot be resolved rejects the whole person column", async (t) => {
  // Writing the people who did resolve would put a shorter list on the page
  // than the markdown asks for
  withSite(t, (logonName) => {
    if (logonName === "nosuch@contoso.com") {
      throw new Error("The specified user could not be found.");
    }
    return { LoginName: `${CLAIM}${logonName}` };
  });

  await assert.rejects(
    PagesHelper.transformUserMulti(WEB_URL, [
      "real@contoso.com",
      "nosuch@contoso.com",
    ]),
    /is not a user of this tenant/,
  );
});

test("A person column carries everyone, in the order they were written", async (t) => {
  withSite(t, (logonName) => ({ LoginName: `${CLAIM}${logonName}` }));

  assert.equal(
    await PagesHelper.transformUserMulti(WEB_URL, [
      "b@contoso.com",
      "a@contoso.com",
    ]),
    `[{'Key':'${CLAIM}b@contoso.com'},{'Key':'${CLAIM}a@contoso.com'}]`,
  );
});

test("A single person column takes one claim, in the same shape", async (t) => {
  withSite(t, (logonName) => ({ LoginName: `${CLAIM}${logonName}` }));

  assert.equal(
    await PagesHelper.transformUserSingle(WEB_URL, "a@contoso.com"),
    `[{'Key':'${CLAIM}a@contoso.com'}]`,
  );
});

test("A name is resolved once per run, however many pages use it", async (t) => {
  const { calls } = withSite(t, (logonName) => ({
    LoginName: `${CLAIM}${logonName}`,
  }));

  await PagesHelper.ensureUserClaim(WEB_URL, "author@contoso.com");
  await PagesHelper.ensureUserClaim(WEB_URL, "author@contoso.com");
  await PagesHelper.ensureUserClaim(WEB_URL, "AUTHOR@contoso.com");

  assert.equal(calls.length, 1);
});

test("A name that failed is not retried on every page either", async (t) => {
  const { calls } = withSite(t, () => {
    throw new Error("The specified user could not be found.");
  });

  await assert.rejects(PagesHelper.ensureUserClaim(WEB_URL, "nosuch@contoso.com"));
  await assert.rejects(PagesHelper.ensureUserClaim(WEB_URL, "nosuch@contoso.com"));

  assert.equal(calls.length, 1);
});

test("Not being allowed to look a user up does not skip every page", async (t) => {
  // A refusal says nothing about whether the user exists. Doctor falls back to
  // the claim it assembled before it asked, and says so once.
  const { warnings } = withSite(t, () => {
    throw new Error("Access is denied. (Exception from HRESULT: 0x80070005 (E_ACCESSDENIED))");
  });

  const first = await PagesHelper.ensureUserClaim(WEB_URL, "a@contoso.com");
  const second = await PagesHelper.ensureUserClaim(WEB_URL, "b@contoso.com");

  assert.equal(first, `${CLAIM}a@contoso.com`);
  assert.equal(second, `${CLAIM}b@contoso.com`);
  assert.equal(warnings.length, 1, "reported once, not per page");
});

test("A person value that is not a name at all is rejected without asking", async (t) => {
  const { calls } = withSite(t, () => ({ LoginName: "never" }));

  for (const value of [42, null, "", "   "]) {
    await assert.rejects(
      PagesHelper.ensureUserClaim(WEB_URL, value),
      /is not a user principal name/,
    );
  }

  assert.equal(calls.length, 0);
});

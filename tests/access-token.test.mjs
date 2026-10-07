import test from "node:test";
import assert from "node:assert/strict";

import { AccessToken } from "../dist/helpers/AccessToken.js";

test("A JSON encoded access token is unwrapped", () => {
  // The CLI writes its output as JSON, so a plain string result is quoted.
  // Leaving the quotes in place makes every REST call answer with a 401.
  assert.equal(AccessToken.parse('"eyJ0eXAiOiJKV1Qi.payload.signature"'), "eyJ0eXAiOiJKV1Qi.payload.signature");
  assert.equal(AccessToken.parse('  "eyJhbGciOi.a.b"\n'), "eyJhbGciOi.a.b");
});

test("A raw access token is left untouched", () => {
  assert.equal(AccessToken.parse("eyJ0eXAiOiJKV1Qi.payload.signature"), "eyJ0eXAiOiJKV1Qi.payload.signature");
  assert.equal(AccessToken.parse("  eyJhbGciOi.a.b \n"), "eyJhbGciOi.a.b");
});

test("The parsed token never keeps a quote which would break the header", () => {
  for (const raw of ['"eyJ.a.b"', "eyJ.a.b", '\n"eyJ.a.b"\n']) {
    assert.equal(AccessToken.parse(raw).includes('"'), false);
  }
});

const jwt = (claims) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

test("A token is reused for ten minutes at most", () => {
  const now = Date.UTC(2026, 0, 1);
  const exp = now / 1000 + 60 * 60;
  assert.equal(AccessToken.cacheUntil(jwt({ exp }), now), now + 10 * 60 * 1000);
});

test("A token close to its expiry is not reused past it", () => {
  // The CLI hands back its own cached token, which can have minutes left
  const now = Date.UTC(2026, 0, 1);
  const exp = now / 1000 + 3 * 60;
  const until = AccessToken.cacheUntil(jwt({ exp }), now);
  assert.ok(until < exp * 1000, "cached until after the token expires");
  assert.equal(until, exp * 1000 - 2 * 60 * 1000);
});

test("A token doctor cannot decode keeps the fixed window", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(AccessToken.cacheUntil("not-a-jwt", now), now + 10 * 60 * 1000);
});

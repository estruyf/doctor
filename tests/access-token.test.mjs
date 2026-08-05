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

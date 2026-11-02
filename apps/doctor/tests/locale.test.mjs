import test from "node:test";
import assert from "node:assert/strict";

import { LocaleHelper } from "../dist/helpers/LocaleHelper.js";

test("Locale names resolve to the LCID SharePoint uses", () => {
  assert.equal(LocaleHelper.getLcid("nl-nl"), 1043);
  assert.equal(LocaleHelper.getLcid("fr-fr"), 1036);
  assert.equal(LocaleHelper.getLcid("es-es"), 3082);
  assert.equal(LocaleHelper.getLcid("NL-NL"), 1043);
  assert.equal(LocaleHelper.getLcid(" nl-nl "), 1043);
  assert.equal(LocaleHelper.getLcid("xx-xx"), null);
});

test("A locale outside the configured languages is not enabled", () => {
  // doctor enables exactly what is listed, so fr and es are not available
  assert.equal(LocaleHelper.isEnabled("nl-nl", [1043]), true);
  assert.equal(LocaleHelper.isEnabled("fr-fr", [1043]), false);
  assert.equal(LocaleHelper.isEnabled("es-es", [1043, 1036]), false);
  assert.equal(LocaleHelper.isEnabled("es-es", [1043, 1036, 3082]), true);
});

test("Without a configured language list nothing is held back", () => {
  // The site keeps whatever languages it already had, so SharePoint decides
  assert.equal(LocaleHelper.isEnabled("fr-fr", undefined), true);
  assert.equal(LocaleHelper.isEnabled("fr-fr", []), true);
});

test("An unknown locale is left for SharePoint to judge", () => {
  assert.equal(LocaleHelper.isEnabled("xx-xx", [1043]), true);
});

test("Locale names and LCIDs both resolve for the languages setting", () => {
  assert.equal(LocaleHelper.toLcid("nl-nl"), 1043);
  assert.equal(LocaleHelper.toLcid("NL-NL"), 1043);
  assert.equal(LocaleHelper.toLcid(1043), 1043);
  // An LCID which came out of JSON as a string
  assert.equal(LocaleHelper.toLcid("1043"), 1043);
  assert.equal(LocaleHelper.toLcid("klingon"), null);
});

test("The configured languages resolve to the LCIDs SharePoint expects", () => {
  assert.deepEqual(
    LocaleHelper.resolveLanguages(["nl-nl", "fr-fr", "es-es"]),
    { lcids: [1043, 1036, 3082], unresolved: [] }
  );
  // Mixing the two styles stays supported, and duplicates collapse
  assert.deepEqual(
    LocaleHelper.resolveLanguages([1043, "nl-nl", "fr-fr"]),
    { lcids: [1043, 1036], unresolved: [] }
  );
  assert.deepEqual(LocaleHelper.resolveLanguages(undefined), {
    lcids: [],
    unresolved: [],
  });
});

test("An unresolvable language is reported instead of dropped", () => {
  // Silently dropping it would change which languages the site ends up with
  assert.deepEqual(LocaleHelper.resolveLanguages(["nl-nl", "klingon"]), {
    lcids: [1043],
    unresolved: ["klingon"],
  });
});

test("isEnabled accepts locale names in the languages setting", () => {
  assert.equal(LocaleHelper.isEnabled("fr-fr", ["nl-nl"]), false);
  assert.equal(LocaleHelper.isEnabled("fr-fr", ["nl-nl", "fr-fr"]), true);
  assert.equal(LocaleHelper.isEnabled("fr-fr", [1043, "fr-fr"]), true);
});

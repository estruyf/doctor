import test from "node:test";
import assert from "node:assert/strict";

import { TermsHelper } from "../dist/helpers/TermsHelper.js";
import { ApiHelper } from "../dist/helpers/ApiHelper.js";
import { AccessToken } from "../dist/helpers/AccessToken.js";

const term = (id, label, path = [], labels = [label]) => ({
  id,
  label,
  labels,
  path,
});

const TERMS = [
  term("1", "Finance"),
  term("2", "Regions"),
  term("3", "Europe", ["Regions"]),
  term("4", "Asia", ["Regions"]),
  term("5", "Products"),
  term("6", "Europe", ["Products"]),
  term("7", "Human Resources", [], ["Human Resources", "HR"]),
];

const ids = (matches) => matches.map((m) => m.id);

test("TermsHelper matches a term by its label", () => {
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Finance")), ["1"]);
});

test("TermsHelper matches regardless of case and surrounding whitespace", () => {
  assert.deepEqual(ids(TermsHelper.match(TERMS, "  fINaNce ")), ["1"]);
});

test("TermsHelper matches a term by any of its labels", () => {
  // The picker shows the default label, but a synonym is a legitimate way to
  // write the term in front matter
  assert.deepEqual(ids(TermsHelper.match(TERMS, "HR")), ["7"]);
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Human Resources")), ["7"]);
});

test("TermsHelper reports every term sharing an ambiguous label", () => {
  // Two different "Europe" terms in different branches — the caller turns this
  // into an error naming both paths rather than silently picking one
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Europe")), ["3", "6"]);
});

test("TermsHelper resolves an ambiguous label by its path", () => {
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Regions > Europe")), ["3"]);
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Products > Europe")), ["6"]);
});

test("TermsHelper accepts a path written without spaces", () => {
  assert.deepEqual(ids(TermsHelper.match(TERMS, "Regions>Europe")), ["3"]);
  assert.deepEqual(ids(TermsHelper.match(TERMS, "regions  >  europe")), ["3"]);
});

test("TermsHelper treats a label that looks like a path as ambiguous", () => {
  // A term literally labelled "Regions > Europe" is indistinguishable from the
  // path to the "Europe" term under "Regions", so both come back and the caller
  // reports the ambiguity rather than guessing
  const withLiteral = [...TERMS, term("8", "Regions > Europe")];
  assert.deepEqual(ids(TermsHelper.match(withLiteral, "Regions > Europe")), [
    "3",
    "8",
  ]);
});

test("TermsHelper returns nothing for a term that does not exist", () => {
  assert.deepEqual(TermsHelper.match(TERMS, "Marketing"), []);
});

test("TermsHelper does not match a parent by its child's path", () => {
  assert.deepEqual(TermsHelper.match(TERMS, "Europe > Regions"), []);
});

//
// Reading the term store
//

test("TermsHelper reads every page of a term set, not just the first", async (t) => {
  // The term store answers in pages. Reading only the first one made every term
  // past it invisible, so a valid label in a large set was reported as not
  // being in it — and its page skipped over a term that was there all along.
  const realGet = ApiHelper.getOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.getOrThrow = realGet;
    AccessToken.get = realToken;
    TermsHelper.reset();
  });
  TermsHelper.reset();

  AccessToken.get = async () => "token";

  const requested = [];
  const labels = (name) => [{ name, isDefault: true }];

  ApiHelper.getOrThrow = async (url) => {
    requested.push(url);

    if (url.endsWith("/page2")) {
      return { value: [{ id: "t2", labels: labels("Second page term") }] };
    }

    // Every term's children are asked for; only the set's own root pages
    if (url.includes("/terms/")) {
      return { value: [] };
    }

    return {
      value: [{ id: "t1", labels: labels("First page term") }],
      "@odata.nextLink": "https://contoso.sharepoint.com/sites/docs/page2",
    };
  };

  const resolved = await TermsHelper.resolve(
    "https://contoso.sharepoint.com/sites/docs",
    "set-1",
    "Second page term",
  );

  assert.equal(resolved.id, "t2");
  assert.ok(
    requested.some((url) => url.endsWith("/page2")),
    "the next page was followed",
  );
});

test("TermsHelper stops when a page points at itself", async (t) => {
  const realGet = ApiHelper.getOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.getOrThrow = realGet;
    AccessToken.get = realToken;
    TermsHelper.reset();
  });
  TermsHelper.reset();

  AccessToken.get = async () => "token";

  let calls = 0;
  ApiHelper.getOrThrow = async (url) => {
    calls++;
    if (calls > 10) {
      throw new Error("followed the same page over and over");
    }
    return { value: [], "@odata.nextLink": url };
  };

  await assert.rejects(
    TermsHelper.resolve("https://contoso.sharepoint.com/sites/docs", "set-1", "Nope"),
    /does not exist in term set/,
  );
  assert.ok(calls <= 10, "gave up instead of looping");
});

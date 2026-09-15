import test from "node:test";
import assert from "node:assert/strict";

import { TermsHelper } from "../dist/helpers/TermsHelper.js";

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

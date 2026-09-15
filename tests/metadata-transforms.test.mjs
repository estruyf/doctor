import test from "node:test";
import assert from "node:assert/strict";

import { MetadataHelper } from "../dist/helpers/MetadataHelper.js";

const CLAIM = "i:0#.f|membership|";

//
// Taxonomy (managed metadata)
//

test("Taxonomy: a plain string is the term label", () => {
  assert.deepEqual(MetadataHelper.normalizeTaxonomyTerm("Finance"), {
    label: "Finance",
  });
});

test("Taxonomy: surrounding whitespace is not part of the label", () => {
  assert.deepEqual(MetadataHelper.normalizeTaxonomyTerm("  Finance \n"), {
    label: "Finance",
  });
});

test("Taxonomy: an object can name the term outright", () => {
  assert.deepEqual(
    MetadataHelper.normalizeTaxonomyTerm({
      label: "Finance",
      termGuid: "550e8400-e29b-41d4-a716-446655440000",
    }),
    { label: "Finance", termGuid: "550e8400-e29b-41d4-a716-446655440000" },
  );
});

test("Taxonomy: a value without a usable label is rejected", () => {
  for (const value of [null, undefined, "", "   ", 123, false, {}, { termGuid: "x" }]) {
    assert.equal(
      MetadataHelper.normalizeTaxonomyTerm(value),
      null,
      `expected null for ${JSON.stringify(value)}`,
    );
  }
});

test("Taxonomy: a term is stored as label and guid, pipe separated", () => {
  assert.equal(
    MetadataHelper.toTaxonomyValue("Finance", "550e8400-e29b-41d4-a716-446655440000"),
    "Finance|550e8400-e29b-41d4-a716-446655440000",
  );
});

test("Taxonomy: the label written is the one it is given", () => {
  // The caller passes the resolved term's own label, which differs from what
  // the author wrote when the term was addressed by a synonym or by its path
  assert.equal(MetadataHelper.toTaxonomyValue("Europe", "guid-1"), "Europe|guid-1");
});

test("Taxonomy: several terms are separated by a semicolon", () => {
  // SharePoint separates taxonomy values with `;` — unlike lookup and choice
  // columns below, which use `;#`
  assert.equal(
    MetadataHelper.joinTaxonomyValues(["A|guid-1", "B|guid-2"]),
    "A|guid-1;B|guid-2",
  );
});

test("Taxonomy: no terms means no value to set", () => {
  assert.equal(MetadataHelper.joinTaxonomyValues([]), undefined);
});

//
// People
//

test("User: a UPN becomes a person claim", () => {
  assert.equal(
    MetadataHelper.toUserClaim("john.doe@contoso.com"),
    `[{'Key':'${CLAIM}john.doe@contoso.com'}]`,
  );
});

test("User: the claim is lower cased, the way SharePoint stores it", () => {
  assert.equal(
    MetadataHelper.toUserClaim("  John.Doe@Contoso.COM  "),
    `[{'Key':'${CLAIM}john.doe@contoso.com'}]`,
  );
});

test("User: a value that is not a name is skipped", () => {
  for (const value of [null, undefined, "", "   ", 123, false, {}]) {
    assert.equal(
      MetadataHelper.toUserClaim(value),
      undefined,
      `expected undefined for ${JSON.stringify(value)}`,
    );
  }
});

test("UserMulti: several UPNs become an array of claims", () => {
  assert.equal(
    MetadataHelper.toUserClaims(["user1@contoso.com", "user2@contoso.com"]),
    `[{'Key':'${CLAIM}user1@contoso.com'},{'Key':'${CLAIM}user2@contoso.com'}]`,
  );
});

test("UserMulti: a single value does not have to be an array", () => {
  assert.equal(
    MetadataHelper.toUserClaims("user1@contoso.com"),
    `[{'Key':'${CLAIM}user1@contoso.com'}]`,
  );
});

test("UserMulti: the invalid entries are dropped, the rest still land", () => {
  assert.equal(
    MetadataHelper.toUserClaims(["user1@contoso.com", "", null, 42]),
    `[{'Key':'${CLAIM}user1@contoso.com'}]`,
  );
});

test("UserMulti: nothing valid means no value to set", () => {
  assert.equal(MetadataHelper.toUserClaims([]), undefined);
  assert.equal(MetadataHelper.toUserClaims([null, "", "   "]), undefined);
});

//
// DateTime
//

test("DateTime: an already normalized value is left alone", () => {
  assert.equal(
    MetadataHelper.transformDateTime("2026-03-15 14:30:00"),
    "2026-03-15 14:30:00",
  );
});

test("DateTime: a date without a time becomes midnight", () => {
  assert.equal(
    MetadataHelper.transformDateTime("2026-03-15"),
    "2026-03-15 00:00:00",
  );
});

test("DateTime: an ISO 8601 value is reformatted", () => {
  assert.equal(
    MetadataHelper.transformDateTime("2026-03-15T14:30:00"),
    "2026-03-15 14:30:00",
  );
});

test("DateTime: a UTC value keeps pointing at the same moment", () => {
  const output = MetadataHelper.transformDateTime("2026-03-15T14:30:00Z");

  assert.match(output, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(
    new Date(output).getTime(),
    new Date("2026-03-15T14:30:00Z").getTime(),
  );
});

test("DateTime: something unparseable is passed through untouched", () => {
  assert.equal(MetadataHelper.transformDateTime("not a date"), "not a date");
  assert.equal(MetadataHelper.transformDateTime(42), 42);
});

//
// Lookup
//

test("Lookup: an item id is used as is", () => {
  assert.equal(MetadataHelper.transformLookupSingle(7), 7);
});

test("Lookup: a numeric string is an id too", () => {
  assert.equal(MetadataHelper.transformLookupSingle(" 7 "), 7);
});

test("Lookup: anything that is not an id is skipped", () => {
  for (const value of ["seven", "7.5", 7.5, null, undefined, "", {}]) {
    assert.equal(
      MetadataHelper.transformLookupSingle(value),
      undefined,
      `expected undefined for ${JSON.stringify(value)}`,
    );
  }
});

test("LookupMulti: several ids are joined with ;#", () => {
  assert.equal(MetadataHelper.transformLookupMulti([1, "2", 3]), "1;#2;#3");
});

test("LookupMulti: the invalid entries are dropped", () => {
  assert.equal(MetadataHelper.transformLookupMulti([1, "nope", 3]), "1;#3");
});

test("LookupMulti: nothing valid means no value to set", () => {
  assert.equal(MetadataHelper.transformLookupMulti([]), undefined);
  assert.equal(MetadataHelper.transformLookupMulti(["nope"]), undefined);
});

//
// URL
//

test("URL: a string is used as is", () => {
  assert.equal(
    MetadataHelper.transformUrl("https://contoso.com, Contoso"),
    "https://contoso.com, Contoso",
  );
});

test("URL: an object becomes url and description", () => {
  assert.equal(
    MetadataHelper.transformUrl({
      url: "https://contoso.com",
      description: "Contoso",
    }),
    "https://contoso.com, Contoso",
  );
});

test("URL: a description is optional", () => {
  assert.equal(
    MetadataHelper.transformUrl({ url: "https://contoso.com" }),
    "https://contoso.com",
  );
});

test("URL: an object without a url is skipped", () => {
  assert.equal(MetadataHelper.transformUrl({ description: "Contoso" }), undefined);
  assert.equal(MetadataHelper.transformUrl({ url: "   " }), undefined);
  assert.equal(MetadataHelper.transformUrl(null), undefined);
});

//
// MultiChoice
//

test("MultiChoice: an array is joined with ;#", () => {
  assert.equal(
    MetadataHelper.transformMultiChoice(["Draft", "Review"]),
    "Draft;#Review",
  );
});

test("MultiChoice: the blank entries are dropped", () => {
  assert.equal(
    MetadataHelper.transformMultiChoice(["Draft", "", "   ", "Review"]),
    "Draft;#Review",
  );
});

test("MultiChoice: a string is passed through, already delimited", () => {
  assert.equal(
    MetadataHelper.transformMultiChoice("Draft;#Review"),
    "Draft;#Review",
  );
});

//
// Field types passed through untouched
//

test("Simple columns are the ones doctor does not transform", () => {
  for (const type of ["Text", "Note", "Number", "Currency", "Boolean", "Choice"]) {
    assert.equal(
      MetadataHelper.SIMPLE_FIELD_TYPES.has(type),
      true,
      `${type} should be a simple field type`,
    );
  }

  for (const type of ["TaxonomyFieldType", "User", "DateTime", "Lookup", "URL"]) {
    assert.equal(
      MetadataHelper.SIMPLE_FIELD_TYPES.has(type),
      false,
      `${type} needs transforming`,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import { PagesHelper } from "../dist/helpers/PagesHelper.js";

const TEMPLATES = [
  {
    Id: 144,
    Title: "Documentation Template",
    FileName: "Documentation-Template.aspx",
    Url: "SitePages/Templates/Documentation-Template.aspx",
  },
  {
    Id: 12,
    Title: "News",
    FileName: "News.aspx",
    Url: "SitePages/Templates/News.aspx",
  },
];

const found = (wanted) => PagesHelper.findPageTemplate(TEMPLATES, wanted)?.Id;

test("a template is found by its page title", () => {
  assert.equal(found("Documentation Template"), 144);
});

test("a template is found by the file name in its URL", () => {
  // What someone reads off the address bar, which is rarely the title
  assert.equal(found("Documentation-Template.aspx"), 144);
  assert.equal(found("Documentation-Template"), 144);
});

test("a template is found by its page id", () => {
  assert.equal(found("144"), 144);
});

test("the name is matched regardless of case and padding", () => {
  assert.equal(found("  documentation template "), 144);
  assert.equal(found("DOCUMENTATION-TEMPLATE"), 144);
});

test("an exact title wins over a loose match on another template", () => {
  const ambiguous = [
    { Id: 1, Title: "News.aspx", FileName: "Announcements.aspx" },
    { Id: 2, Title: "Announcements", FileName: "News.aspx" },
  ];
  assert.equal(PagesHelper.findPageTemplate(ambiguous, "News.aspx").Id, 1);
});

test("a name that matches nothing finds nothing", () => {
  assert.equal(PagesHelper.findPageTemplate(TEMPLATES, "Nope"), undefined);
  assert.equal(PagesHelper.findPageTemplate([], "Documentation Template"), undefined);
});

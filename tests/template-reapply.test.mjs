import test from "node:test";
import assert from "node:assert/strict";

import { PagesHelper } from "../dist/helpers/PagesHelper.js";
import { ApiHelper } from "../dist/helpers/ApiHelper.js";
import { AccessToken } from "../dist/helpers/AccessToken.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";
import { MARKDOWN_WEB_PART_ID } from "../dist/models/StandardWebPart.js";

/**
 * Re-applying a template composes the page into the template's canvas. A
 * template made from a page doctor published carries a Markdown web part with
 * doctor's title, and the title fallback — meant for a page with no recorded
 * ids — took it over on the first run, then left it alone on every run after.
 */
const webUrl = "https://contoso.sharepoint.com/sites/docs";

const markdownPart = (id, code, zoneIndex) => ({
  controlType: 3,
  id,
  webPartId: MARKDOWN_WEB_PART_ID,
  position: { zoneIndex, sectionIndex: 1, sectionFactor: 12, layoutIndex: 1, controlIndex: 1 },
  webPartData: {
    title: "doctor-placeholder",
    serverProcessedContent: { searchablePlainTexts: { code } },
  },
});

test("a template's own Markdown web part is never taken over, not even on the first run", async (t) => {
  const realPost = ApiHelper.postOrThrow;
  const realToken = AccessToken.get;
  t.after(() => {
    ApiHelper.postOrThrow = realPost;
    AccessToken.get = realToken;
    StateHelper.reset();
  });
  StateHelper.reset();

  // The page as an earlier version of doctor left it: no ids recorded
  const page = [markdownPart("page-md", "old page content", 1)];
  const template = [markdownPart("template-md", "the template's text", 1)];

  let saved = null;
  AccessToken.get = async () => "token";
  ApiHelper.postOrThrow = async (url, _headers, body) => {
    if (url.endsWith("/checkoutpage")) {
      return { CanvasContent1: JSON.stringify(page) };
    }
    saved = JSON.parse(body.CanvasContent1);
    return {};
  };

  await PagesHelper.applySegments(
    "doctor-placeholder",
    [{ type: "markdown", content: "fresh content" }],
    "page.aspx",
    webUrl,
    { webPartTitle: "doctor-placeholder" },
    null,
    false,
    null,
    template,
    true,
  );

  const templatePart = saved.find((control) => control.id === "template-md");
  assert.ok(templatePart, "the template's web part is still there");
  assert.equal(
    templatePart.webPartData.serverProcessedContent.searchablePlainTexts.code,
    "the template's text",
  );

  const content = saved.find(
    (control) =>
      control.id !== "template-md" &&
      control.webPartData?.serverProcessedContent?.searchablePlainTexts?.code?.includes("fresh content"),
  );
  assert.ok(content, "the page's content is on the page");
  assert.notEqual(content.position.zoneIndex, templatePart.position.zoneIndex);
});

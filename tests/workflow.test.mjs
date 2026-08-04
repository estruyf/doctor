import test from "node:test";
import assert from "node:assert/strict";

import { Workflow } from "../dist/commands/workflow.js";

test("Workflow.getContents requires all secrets when nothing is configured", () => {
  const contents = Workflow.getContents({ startFolderRel: "./src" });

  assert.match(contents, /name: Publish documentation/);
  assert.match(contents, /- "src\/\*\*"/);
  assert.match(contents, /--certificate "\$\{\{ secrets.CERTIFICATE \}\}"/);
  assert.match(
    contents,
    /--password "\$\{\{ secrets.CERTIFICATE_PASSWORD \}\}"/
  );
  assert.match(contents, /--appId "\$\{\{ secrets.APP_ID \}\}"/);
  assert.match(contents, /--tenant "\$\{\{ secrets.TENANT_ID \}\}"/);
  assert.match(contents, /--url "\$\{\{ secrets.SITE_URL \}\}"/);
});

test("Workflow.getContents leaves out the arguments known by the doctor.json file", () => {
  const contents = Workflow.getContents({
    startFolderRel: "./docs",
    webUrl: "https://contoso.sharepoint.com/sites/docs",
    appId: "0000-1111",
    tenant: "2222-3333",
  });

  assert.match(contents, /- "docs\/\*\*"/);
  assert.match(contents, /--certificate "\$\{\{ secrets.CERTIFICATE \}\}"/);
  assert.doesNotMatch(contents, /secrets.APP_ID/);
  assert.doesNotMatch(contents, /secrets.TENANT_ID/);
  assert.doesNotMatch(contents, /secrets.SITE_URL/);
});

test("Workflow.getContents keeps the last publish argument without a line continuation", () => {
  const contents = Workflow.getContents({});

  assert.match(contents, /--confirm\n$/);
  assert.doesNotMatch(contents, /--confirm \\/);
});

test("Workflow.getContents falls back to the default content folder", () => {
  const contents = Workflow.getContents({});

  assert.match(contents, /- "src\/\*\*"/);
});

test("Workflow.getRequiredSecrets only returns the certificate secrets for a full config", () => {
  const secrets = Workflow.getRequiredSecrets({
    webUrl: "https://contoso.sharepoint.com/sites/docs",
    appId: "0000-1111",
    tenant: "2222-3333",
  });

  assert.deepEqual(secrets, ["CERTIFICATE", "CERTIFICATE_PASSWORD"]);
});

test("Workflow.getRequiredSecrets documents every secret it returns", () => {
  const contents = Workflow.getContents({});

  for (const secret of Workflow.getRequiredSecrets({})) {
    assert.match(contents, new RegExp(`#   - ${secret}: \\w`));
  }
});

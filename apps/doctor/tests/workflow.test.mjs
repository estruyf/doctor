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

test("Workflow.getProvider defaults to GitHub and accepts the known aliases", () => {
  assert.equal(Workflow.getProvider({}), "github");
  assert.equal(Workflow.getProvider({ provider: "" }), "github");
  assert.equal(Workflow.getProvider({ provider: "GitHub" }), "github");
  assert.equal(Workflow.getProvider({ provider: "azdo" }), "azdo");
  assert.equal(Workflow.getProvider({ provider: " Azure-DevOps " }), "azdo");
});

test("Workflow.getProvider throws for an unknown provider", () => {
  assert.throws(() => Workflow.getProvider({ provider: "gitlab" }), {
    message: /The "gitlab" provider is unknown/,
  });
});

test("Workflow.getContents generates an Azure DevOps pipeline", () => {
  const contents = Workflow.getContents({
    startFolderRel: "./docs",
    provider: "azdo",
  });

  assert.match(contents, /^trigger:$/m);
  assert.match(contents, /vmImage: ubuntu-latest/);
  assert.match(contents, /- task: NodeTool@0/);
  assert.match(contents, /npm install -g @estruyf\/doctor/);
  assert.doesNotMatch(contents, /uses: actions\//);
  assert.doesNotMatch(contents, /secrets\./);
});

test("Workflow.getContents uses a wildcard-free path filter for Azure DevOps", () => {
  const contents = Workflow.getContents({
    startFolderRel: "./docs",
    provider: "azdo",
  });

  assert.match(contents, /paths:\n    include:\n      - docs\n/);
  assert.doesNotMatch(contents, /docs\/\*\*/);
});

test("Workflow.getContents maps the Azure DevOps secrets to environment variables", () => {
  const contents = Workflow.getContents({ provider: "azdo" });

  assert.match(contents, /--certificate "\$CERTIFICATE"/);
  assert.match(contents, /--password "\$CERTIFICATE_PASSWORD"/);
  assert.match(contents, /--appId "\$APP_ID"/);
  assert.match(contents, /--tenant "\$TENANT_ID"/);
  assert.match(contents, /--url "\$SITE_URL"/);

  for (const secret of Workflow.getRequiredSecrets({})) {
    assert.match(contents, new RegExp(`^      ${secret}: \\$\\(${secret}\\)$`, "m"));
  }
});

test("Workflow.getContents leaves the known arguments out of the Azure DevOps pipeline", () => {
  const contents = Workflow.getContents({
    provider: "azdo",
    webUrl: "https://contoso.sharepoint.com/sites/docs",
    appId: "0000-1111",
    tenant: "2222-3333",
  });

  assert.match(contents, /--certificate "\$CERTIFICATE"/);
  assert.doesNotMatch(contents, /APP_ID/);
  assert.doesNotMatch(contents, /TENANT_ID/);
  assert.doesNotMatch(contents, /SITE_URL/);
});

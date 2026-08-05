import { join } from "path";
import kleur from "kleur";
import { OutputHelper } from "@helpers";
import { CommandArguments, WorkflowProvider } from "@models";
import { existsAsync, mkdirAsync, writeFileAsync } from "@utils";

export class Workflow {
  private static readonly gitHubFolder = join(".github", "workflows");
  private static readonly gitHubFile = "doctor.yml";
  private static readonly azdoFile = "azure-pipelines.yml";

  /**
   * The provider values which can be passed to the `--provider` argument.
   */
  public static readonly providers: WorkflowProvider[] = ["github", "azdo"];

  /**
   * Alternative names which are accepted for the supported providers.
   */
  private static readonly providerAliases: { [alias: string]: WorkflowProvider } = {
    github: "github",
    gh: "github",
    "github-actions": "github",
    actions: "github",
    azdo: "azdo",
    ado: "azdo",
    devops: "azdo",
    "azure-devops": "azdo",
    azuredevops: "azdo",
    "azure-pipelines": "azdo",
  };

  /**
   * Creates the workflow/pipeline definition which publishes the documentation.
   * The output folder is created when it does not exist yet, and an existing
   * file is never overwritten.
   * @param options Command options used to generate the workflow contents.
   * @returns A promise that resolves when the workflow file is in place.
   */
  public static async start(options: CommandArguments) {
    const provider = this.getProvider(options);
    const crntFolder = process.cwd();
    const folder = provider === "github" ? this.gitHubFolder : "";
    const file = provider === "github" ? this.gitHubFile : this.azdoFile;

    const folderPath = join(crntFolder, folder);
    const filePath = join(folderPath, file);
    const relPath = folder
      ? `${folder.replace(/\\/g, "/")}/${file}`
      : file;

    if (await existsAsync(filePath)) {
      OutputHelper.log(
        kleur.bold().bgYellow().black(` Skipped: `),
        `The "${relPath}" file already exists. Delete or rename it when you want to generate a new one.`
      );
      return;
    }

    if (folder && !(await existsAsync(folderPath))) {
      await mkdirAsync(folderPath, { recursive: true });
    }

    await writeFileAsync(filePath, this.getContents(options), {
      encoding: "utf-8",
    });

    OutputHelper.log(
      kleur.bold().bgGreen().black(` Created: `),
      `The "${relPath}" ${
        provider === "github" ? "workflow" : "pipeline"
      } file has been created.`
    );
    OutputHelper.log("");
    OutputHelper.log(
      provider === "github"
        ? `Add the following secrets to your repository before running the workflow: ${this.getRequiredSecrets(
            options
          ).join(", ")}.`
        : `Add the following secret variables to your pipeline, or to a linked variable group, before running it: ${this.getRequiredSecrets(
            options
          ).join(", ")}.`
    );
  }

  /**
   * Retrieve the provider to generate the workflow for.
   * @param options Command options which can contain the `provider` value.
   * @returns The normalized provider name. Defaults to `github`.
   * @throws When an unknown provider is passed.
   */
  public static getProvider(options: CommandArguments): WorkflowProvider {
    const provider = (options.provider || "").toString().trim().toLowerCase();

    if (!provider) {
      return "github";
    }

    const known = this.providerAliases[provider];
    if (!known) {
      throw new Error(
        `The "${options.provider}" provider is unknown. Use one of the following: ${this.providers.join(
          ", "
        )}.`
      );
    }

    return known;
  }

  /**
   * Retrieve the secrets which the generated workflow expects.
   * Values which are already known from the `doctor.json` file are passed by
   * the config itself, so they do not need a secret.
   * @param options Command options which can already contain the values.
   * @returns The list of secret names used in the workflow.
   */
  public static getRequiredSecrets(options: CommandArguments): string[] {
    const secrets = [`CERTIFICATE`, `CERTIFICATE_PASSWORD`];

    if (!options.appId) {
      secrets.push(`APP_ID`);
    }

    if (!options.tenant) {
      secrets.push(`TENANT_ID`);
    }

    if (!options.webUrl) {
      secrets.push(`SITE_URL`);
    }

    return secrets;
  }

  /**
   * Generates the contents of the workflow/pipeline file for the provider.
   * Arguments which are already defined in the `doctor.json` file are left out,
   * as `doctor` picks these up on its own.
   * @param options Command options used to fill in the workflow.
   * @returns The workflow YAML contents.
   */
  public static getContents(options: CommandArguments): string {
    return this.getProvider(options) === "azdo"
      ? this.getAzdoContents(options)
      : this.getGitHubContents(options);
  }

  /**
   * Generates the contents of the GitHub Actions workflow file.
   * @param options Command options used to fill in the workflow.
   * @returns The workflow YAML contents.
   */
  private static getGitHubContents(options: CommandArguments): string {
    const secretDocs = this.getSecretDocs(options);
    const publishCommand = this.getPublishCommand(
      options,
      (secret) => `\${{ secrets.${secret} }}`,
      `            `
    );

    return `# This workflow has been generated by the "doctor workflow" command.
#
# Add the following secrets to your repository before running it:
${secretDocs}
#
# More information: https://github.com/estruyf/doctor

name: Publish documentation

on:
  push:
    branches:
      - main
    paths:
      - "${this.getContentPath(options)}/**"
  workflow_dispatch:

jobs:
  publish:
    name: Publish the documentation
    runs-on: ubuntu-latest

    steps:
      - name: Checkout the repository
        uses: actions/checkout@v6

      - name: Use Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22

      - name: Install Doctor
        run: npm install -g @estruyf/doctor

      - name: Publish the documentation
        run: |
          doctor publish \\
${publishCommand}
`;
  }

  /**
   * Generates the contents of the Azure DevOps pipeline file.
   * The secrets are mapped to environment variables, as Azure DevOps does not
   * pass secret variables to the pipeline environment on its own.
   * @param options Command options used to fill in the pipeline.
   * @returns The pipeline YAML contents.
   */
  private static getAzdoContents(options: CommandArguments): string {
    const secretDocs = this.getSecretDocs(options);
    const publishCommand = this.getPublishCommand(
      options,
      (secret) => `$${secret}`,
      `        `
    );
    const env = this.getRequiredSecrets(options)
      .map((secret) => `      ${secret}: $(${secret})`)
      .join(`\n`);

    return `# This pipeline has been generated by the "doctor workflow --provider azdo" command.
#
# Add the following secret variables to your pipeline, or to a linked variable
# group, before running it:
${secretDocs}
#
# More information: https://github.com/estruyf/doctor

trigger:
  branches:
    include:
      - main
  paths:
    include:
      - ${this.getContentPath(options)}

pr: none

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    displayName: Use Node.js
    inputs:
      versionSpec: 22.x

  - script: npm install -g @estruyf/doctor
    displayName: Install Doctor

  - script: |
      doctor publish \\
${publishCommand}
    displayName: Publish the documentation
    env:
${env}
`;
  }

  /**
   * Generates the commented list of secrets to add to the header of the file.
   * @param options Command options which can already contain the values.
   * @returns The commented documentation of every required secret.
   */
  private static getSecretDocs(options: CommandArguments): string {
    return this.getRequiredSecrets(options)
      .map((secret) => `#   - ${secret}: ${this.getSecretDescription(secret)}`)
      .join(`\n`);
  }

  /**
   * Generates the indented arguments of the `doctor publish` command.
   * @param options Command options used to know which arguments to pass.
   * @param getSecret Turns a secret name into the token of the provider.
   * @param indent The indentation to prefix every argument with.
   * @returns The argument lines, joined with line continuations.
   */
  private static getPublishCommand(
    options: CommandArguments,
    getSecret: (secret: string) => string,
    indent: string
  ): string {
    const publishArgs = [
      `--certificate "${getSecret(`CERTIFICATE`)}"`,
      `--password "${getSecret(`CERTIFICATE_PASSWORD`)}"`,
    ];

    if (!options.appId) {
      publishArgs.push(`--appId "${getSecret(`APP_ID`)}"`);
    }

    if (!options.tenant) {
      publishArgs.push(`--tenant "${getSecret(`TENANT_ID`)}"`);
    }

    if (!options.webUrl) {
      publishArgs.push(`--url "${getSecret(`SITE_URL`)}"`);
    }

    publishArgs.push(`--retryWhenFailed`);
    publishArgs.push(`--confirm`);

    return publishArgs
      .map((arg, idx) =>
        idx === publishArgs.length - 1
          ? `${indent}${arg}`
          : `${indent}${arg} \\`
      )
      .join(`\n`);
  }

  /**
   * Retrieve the path filter to use for the workflow trigger.
   * @param options Command options containing the content folder.
   * @returns The relative content path.
   */
  private static getContentPath(options: CommandArguments): string {
    const folder = (options.startFolderRel || `./src`)
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    return folder || "src";
  }

  /**
   * Retrieve the description to document a secret with.
   * @param secret The name of the secret.
   * @returns The description of the secret.
   */
  private static getSecretDescription(secret: string): string {
    switch (secret) {
      case `CERTIFICATE`:
        return `the base64 encoded contents of your certificate (.pfx, .p12, or .pem)`;
      case `CERTIFICATE_PASSWORD`:
        return `the password of your certificate`;
      case `APP_ID`:
        return `the client ID of your Entra ID app registration`;
      case `TENANT_ID`:
        return `the ID of your tenant`;
      case `SITE_URL`:
        return `the URL of the SharePoint site to publish to`;
      default:
        return ``;
    }
  }
}

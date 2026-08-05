---
title: Getting Started
sidebar:
  order: 0
  label: Overview
---

This section walks you through everything you need to get your first documentation site published on SharePoint with `doctor`.

## Prerequisites

Before you can publish your first page, make sure the following is in place:

- **Node.js 22.13.0 or higher** and `doctor` installed on your machine or build agent. Check the [installation](./installation) section.
- **An Azure Entra ID app registration**. `doctor` does not ship with an application of its own, you bring your own app registration. It needs the **Sites.FullControl.All** application permission from SharePoint, with admin consent granted, and a certificate to authenticate with. Check the [certificate authentication](./certificate-authentication) section for the full setup.
- **A SharePoint site** where your documentation gets published. You pass its URL with the `--url` option, or store it in the `doctor.json` file.

:::caution[Important]
Certificate authentication is the only authentication type `doctor` supports. Without the Entra ID app registration and its certificate, `doctor` cannot sign in to your tenant.
:::

## Publish your first pages

Once the prerequisites are in place:

1. Create the folder structure and the `doctor.json` file in your project:

   ```sh
   doctor init --url <url> --appId <appId> --tenant <tenant>
   ```

2. Write your content as Markdown files in the source folder (`./src` by default). Check the [pages](../content/pages) section for the front matter each page supports.

3. Check what the next publishing run will do:

   ```sh
   doctor status
   ```

4. Publish your content to SharePoint:

   ```sh
   doctor publish --certificate ./cert.pfx
   ```

:::note[Info]
The `appId`, `tenant`, and `url` values can live in the `doctor.json` file, so you only need to pass the `certificate` (and its `password`) on each run. Keep those secrets out of source control. More information can be found in the [configuration](../configuration) section.
:::

## Next steps

- [Content](../content): write your pages, build the navigation, and reuse snippets with partials and shortcodes.
- [CLI](../cli): all the commands `doctor` offers.
- [Configuration](../configuration): every command argument and `doctor.json` setting.
- [CI/CD](../ci-cd): publish your documentation automatically from Azure DevOps or GitHub Actions.

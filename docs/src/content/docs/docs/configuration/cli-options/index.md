---
title: CLI options
sidebar:
  order: 1
---

Options are specified via command arguments, or within a [`doctor.json`](../doctor-json) file (automatically gets created on initialization `doctor init`). Check the [commands](../../cli) section for the commands these options can be passed to.

## Authentication

`doctor` authenticates with the certificate of your own Entra app registration. The `--appId`, `--tenant`, and `--certificate` options are **required** for every command which talks to SharePoint, and can be defined in the `doctor.json` file so you do not need to repeat them.

:::note[Info]
Check out the [Certificate Authentication](../../getting-started/certificate-authentication) section for the full setup of the app registration and the certificate.
:::

`-a, --auth <auth>`
: The authentication type to use. `certificate` is the only supported value, and it is the default.

:::caution[Important]
Since v2.0.0 the `deviceCode` and `password` authentication types are removed. Check the [authentication changes](#authentication-changes-in-v200) section below.
:::

`--appId <appId>`
: The ID of the Entra app registration to authenticate with. **Required**.

`--tenant <tenant>`
: The ID of the tenant to authenticate to. **Required**.

`--certificate <certificate>`
: The certificate to authenticate with. **Required**. This can be the path to your certificate file (`.pfx`, `.p12`, or `.pem`), relative to the folder from where you run `doctor`, or the base64 encoded contents of that file.

```bash
# Path to the certificate file
doctor publish --certificate ./cert.pfx --appId <appId> --tenant <tenant> --url <url>

# Base64 encoded certificate
doctor publish --certificate <base64String> --appId <appId> --tenant <tenant> --url <url>
```

:::note[Info]
The base64 encoded value is the easiest option to use in a CI/CD pipeline, as you can store it as a secret. Use the `--password` option when your certificate is password protected.
:::

`--password <password>`
: The password of your certificate file, when you protected it with one.

### Authentication changes in v2.0.0

Before v2.0.0, `doctor` could also authenticate with the `deviceCode` and `password` authentication types. Both are removed:

- The `password` type is no longer supported by the CLI for Microsoft 365.
- The `deviceCode` type signs you in as a user, which does not work for all the APIs `doctor` calls during a publishing run.

Certificate authentication uses application permissions, which work for every API `doctor` needs, and it is the only type which works unattended in a CI/CD pipeline. If you used one of the removed types, follow the [certificate authentication](../../getting-started/certificate-authentication) guide to set up an app registration.

## For all commands

`-u, --url <url>`
: The URL of the site collection to use.

`--library <library>`
: Specified the library which you want to use in SharePoint to store your referenced images.

`-f, --folder <folder>`
: The folder location in where you will create your markdown files.

`--webPartTitle <webPartTitle>`
: This defined the title of the markdown web part to be created/updated on the page. Default value is: `doctor-placeholder`.

`--overwriteImages`
: Specifies if you allow `doctor` to overwrite the images in the SharePoint library that are referenced in the markdown files.

`--debug`
: Provides more information of what is happening during command execution. You can also enable this by setting the `DEBUG=true` environment variable, which is useful in CI/CD pipelines.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--verbose`
: Provides extended logging output. When enabled, the task list is rendered with the verbose renderer, so every task and its output stays visible instead of being collapsed. For the `doctor status` command, this flag also lists the unchanged files.

`--commandName <commandName>`
: Override the command used to execute `CLI for Microsoft 365`. By default, `doctor` executes commands through the bundled `@pnp/cli-microsoft365` API directly. The `m365` (default) and `localm365` values both use this in-process API. Any other value is executed as a binary on your `PATH`. Use this option only when you explicitly want to run a different command binary.

`--commandTimeout <commandTimeout>`
: The timeout in **milliseconds** for each `CLI for Microsoft 365` command which `doctor` executes. Default value is: `120000` (2 minutes). Increase this value when you run into `Command timed out after 120000ms` errors, which can happen on large sites or slow connections.

```json
{
  "commandTimeout": 300000
}
```

:::caution[Important]
The value must be a whole number greater than `0`. When an invalid value is provided, `doctor` shows a warning and continues with the default of `120000`.
:::

## Publish command specific options

`--continueOnError`
: Continue when an error occurs during the publishing process.

`--outputFolder <outputFolder>`
: When providing this option, the processed markdown files will be generated in this folder.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--cleanEnd`
: Removes the pages which have not been touched during the publishing run. This will happen at the end of the whole process.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--cleanStart`
: Removes all pages before creation. This ensures that you that all changes made to your documentation get removed.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--confirm`
: Don't prompt for confirming removing the files when you specified to clean up pages and assets before publishing.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--skipExistingPages`
: Will not overwrite pages if they already existed on the site. The shorter `--skipExisting` alias can be used as well.

`--forceAll`
: Reprocess all pages, ignoring the saved publish state. By default `doctor` only publishes pages which are new or whose content changed since the last run. Check the [change detection](#change-detection--publish-state) section for more information.

`--removeDeleted`
: Recycles the pages which `doctor` published before, but whose markdown file no longer exists. Requires the `--confirm` flag, or `doctor` asks you to confirm the removal. Check the [removing deleted pages](#removing-deleted-pages) section for more information.

`--skipPrecheck`
: Skips the pre-process validation which runs before any SharePoint calls are made. Check the [pre-process checks](#pre-process-checks) section for more information.

`--timingDetails`
: Shows additional per-page timing statistics (average, fastest and slowest page) after the publishing run. The total publishing time is always shown, also without this flag.

`--applyTheme`
: Applies the theme defined in the [`siteDesign.theme`](../doctor-json/#site-look-and-feel) property of your `doctor.json` file.

:::caution[Important]
Since v2.0.0 the theme is no longer applied automatically. SharePoint returns an error when the theme name is not known on the tenant, which would fail the whole publishing run. When you defined a theme but did not pass this flag, `doctor` logs that it skipped applying it. All other `siteDesign` settings (logo and chrome) are still applied without this flag.
:::

`--retryWhenFailed`
: Specifying this flag will retry the command if it failed. In some cases it can be that SharePoint failes to process your request, and this allows you to try again without running the whole flow from scratch.

`--skipPages`:
: This flag allows you to skip the pages provisioning in the publish flow.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--skipNavigation`:
: This flag allows you to skip setting the navigation in the publish flow.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--skipSiteDesign`:
: This flag allows you to skip setting the site its look and feel in the publish flow.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.
:::

`--cleanQuickLaunch`
: Allows you to specify if you want to remove all the navigation elements defined in the `QuickLaunch` navigation before adding the new navigation structure.

`--cleanTopNavigation`
: Allows you to specify if you want to remove all the navigation elements defined in the `TopNavigation` navigation before adding the new navigation structure.

`--pageTemplate`
: Name of the default page template to use for all the pages which will be created.

`--disableComments`
: Disable comments for all pages. By default the comments are enabled on the pages.

:::caution[Important]
You can override this by specifying the `comments` option on page level.
:::

`--disableStatePersistence`
: Disables loading and saving of the publish state file. When you use this flag, `doctor` cannot detect changes, so all pages are processed on every run.

`--stateFile <stateFile>`
: The path of the state file within the library defined by `--library`. Default value is: `.doctor/state.json`, which results in `Shared Documents/.doctor/state.json` when the default library is used.

### Change detection / publish state

`doctor` keeps track of what it published in a state file which is stored on your SharePoint site. For every page it stores a hash of the source markdown file, together with the timestamp of when it got published.

On the next run, `doctor` compares the hash of each local file with the one in the state file:

- Pages which are **new** or **modified** get published.
- Pages which are **unchanged** get skipped.

:::caution[Important]
This is a behavior change since v2.0.0. Previously all pages were processed on every run. If you want the old behavior, use the `--forceAll` flag.
:::

The state is saved after each page, so when a publishing run fails halfway, the already published pages do not need to be processed again on the next run.

The following options influence this behavior:

- `--forceAll`: reprocess everything, ignoring the state.
- `--disableStatePersistence`: do not load or save the state at all.
- `--stateFile`: store the state on another location.
- `--library`: the library in which the state file is stored.

Use the [`doctor status`](../../cli/#status) command to see which pages will be published on the next run.

:::note[Info]
The state gets skipped when you use the `--skipPages` flag, as no pages are processed in that case.
:::

### Removing deleted pages

Deleting a markdown file does not remove the page it created on your site. `doctor` knows which pages it published, as it tracks them in the state file, and `doctor status` lists the ones without a local file as **Deleted**.

Pass the `--removeDeleted` flag to act on them:

```sh
doctor publish --removeDeleted --confirm
```

Every page which is tracked in the state, but has no markdown file anymore, gets recycled and dropped from the state. The pages end up in the site its recycle bin, so you can still restore them from SharePoint itself.

:::caution[Important]
The removal needs to be confirmed. When you do not pass the `--confirm` flag, `doctor` asks you to confirm it before the publishing run starts. In a CI/CD pipeline you always need to pass `--confirm`, as there is nobody to answer the question.
:::

Good to know:

- The state file is the source of truth. Pages which were created outside of `doctor`, or before the state file existed, are not touched. Use the `--cleanEnd` flag when you want to remove everything which was not published during the run.
- Multilingual pages are removed together with their source page. Translations of a page which still exists are kept.
- Pages which are already gone from the site are removed from the state as well, so the state keeps matching your site.
- When a markdown file cannot be resolved to a page (an unreadable file, or one without a `title`), no pages get removed at all. The [pre-process checks](#pre-process-checks) catch these before the publishing run, unless you use `--skipPrecheck`.
- The flag has no effect in combination with `--disableStatePersistence` or `--skipPages`, as `doctor` needs the state to know which pages it created.

### Pre-process checks

Before any call to SharePoint is made, `doctor` validates your markdown files and stops the publishing run when it finds issues. This prevents a run from failing halfway through. The following checks are performed:

- Files which cannot be read.
- Front matter which cannot be parsed.
- Pages without a `title` in their front matter.
- Duplicate slugs, as these pages would overwrite each other on the site.
- Localization references in the front matter pointing to a file which does not exist on disk.

When one or more issues are found, the run stops and all issues are listed at once (up to a maximum of 20, followed by the number of remaining issues). Pages of the `translation` type are skipped during this validation.

Use the `--skipPrecheck` flag when you want to skip this validation.

## Workflow command specific options

`--provider <provider>`
: The CI/CD platform to generate the definition for. Supported values are `github` (default) and `azdo`. Check the [workflow command](../../cli/#workflow) section for more information.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` file will be ignored.
:::

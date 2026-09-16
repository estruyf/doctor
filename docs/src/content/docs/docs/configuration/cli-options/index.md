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

`--output <default|json>`
: The way the command reports its result. With `json`, the human readable output is silenced and a single JSON document is written to stdout, which a CI/CD pipeline can gate on or turn into a pull request comment. Check the [JSON output](#json-output) section for the documents the `status` and `publish` commands return.

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

### JSON output

The `--output json` argument turns the result of a run into something a script can act on. All human readable output is left out, and `doctor` writes a single JSON document to stdout.

```sh
doctor status --output json
```

Which lets your pipeline decide whether it has anything to publish:

```sh
if doctor status --output json | jq -e '.summary.upToDate' > /dev/null; then
  echo "Nothing changed, skipping the publish"
fi
```

#### Status

```json
{
  "command": "status",
  "success": true,
  "version": "2.1.0",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  "state": {
    "enabled": true,
    "tracked": 12,
    "filesChecked": 14
  },
  "summary": {
    "new": 1,
    "modified": 2,
    "unchanged": 11,
    "deleted": 0,
    "orphaned": 0,
    "changed": 3,
    "upToDate": false
  },
  "pages": {
    "new": [{ "file": "docs/new-page.md", "slug": "new-page.aspx" }],
    "modified": [],
    "unchanged": [],
    "deleted": [],
    "orphaned": []
  },
  "warnings": []
}
```

| Property | Description |
| --- | --- |
| `state.enabled` | Whether the publish state is used. All pages are reported as new when it is disabled with `--disableStatePersistence`. |
| `summary.changed` | The new and modified pages together: what the next publish run processes. |
| `summary.upToDate` | `true` when there is nothing left to publish, and nothing to remove. |
| `pages.*` | The pages of each category, with the `file` path relative to the folder you ran `doctor` from. A `deleted` page has no `file`, an `orphaned` language file has no `slug`. |

The `pages` lists are always complete, also for the unchanged pages. The `--verbose` flag only influences the human readable output.

#### Publish

```json
{
  "command": "publish",
  "success": true,
  "version": "2.1.0",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  "summary": {
    "pages": { "total": 14, "created": 1, "updated": 2, "skipped": 11, "removed": 0 },
    "images": { "total": 3, "uploaded": 3, "skipped": 0 },
    "retries": 0,
    "errors": 0,
    "durationMs": 42123
  },
  "failedFiles": [],
  "warnings": []
}
```

The `timings` property is added when you pass the `--timingDetails` flag.

:::note[Info]
A publish run with `--continueOnError` exits with code `0`, also when pages failed. Gate on `success` or on `summary.errors`, and use `failedFiles` to report which pages need attention.
:::

#### Failures

A failing run writes the same kind of document, and exits with code `1`:

```json
{
  "command": "publish",
  "success": false,
  "version": "2.1.0",
  "error": {
    "message": "The provided folder location doesn't exist."
  }
}
```

Every other command returns a `{ "command", "success", "version" }` document, so `--output json` never leaves you with output which cannot be parsed.

:::caution[Important]
`doctor` cannot ask you anything while it reports machine readable output, as a prompt would corrupt the document and block your pipeline. Pass all required values as arguments, or add them to the `doctor.json` file. That includes `--confirm` for the commands which remove content.
:::

:::note[Info]
The `--debug` output goes to stderr, so it never ends up in the document you parse.
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
: Removes the pages which the run did not want, at the end of the whole process. A page which was *skipped* — as unchanged, or because its metadata could not be worked out — is still a page `doctor` wants, and is left alone. What gets removed is what has no markdown file behind it any more.

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
: Skips the checks which run before any page is written: the local front matter and slug validation, and the capability check described below. Check the [pre-process checks](#pre-process-checks) section for more information.

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
: Name of the default page template to use for all the pages which will be created. It accepts the
  template's page title, its file name or its page id. A page can override it with the `template`
  front matter — see [page templates](../../content/pages/#page-templates).

`--reapplyTemplates`
: Applies the page template to pages which already exist, not only to the ones `Doctor` creates. Off
  by default. Check [page templates](../../content/pages/#page-templates).

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

`doctor` keeps track of what it published in a state file which is stored on your SharePoint site. For every page it stores a hash of everything the page is built from, the timestamp of when it got published, and the instance ids of the web parts `doctor` put on it — which is how it recognises its own controls on the next run and leaves the ones you added in SharePoint alone. The file also carries a hash of the publish settings and your custom shortcodes, so changing one of those marks every page as changed.

On the next run, `doctor` compares the hash of each local file with the one in the state file:

- Pages which are **new** or **modified** get published.
- Pages which are **unchanged** get skipped.

A skipped page is still a page on the site, so it keeps everything a published page would have kept:
its entry in the [site navigation](../../content/pages/#menu), which is rebuilt on every run, and its
place in the site when [`--cleanEnd`](#--cleanend) removes the pages the run did not want. The same
goes for a page skipped because [its metadata could not be worked out](../../content/pages/#what-happens-when-a-value-cannot-be-set).

The hash covers everything the published page is built from, not just the file you edited:

| What changed | Effect |
| --- | --- |
| The markdown file | that page is modified |
| A [partial](../doctor-json/#reusable-content-partials) it uses | every page using that partial is modified |
| An **image** it references | every page referencing that image is modified, and the image is re-uploaded |
| The **slug of a page it links to** | every page linking to it is modified, so its links keep pointing at the right page |
| A **custom shortcode's** code | every page is modified — a shortcode decides what its pages render |
| A publish **setting** in `doctor.json` (`markdown.*`, `webPartTitle`, `partials.*`, `library`, the template options) | every page is modified |
| The **page template**, with [`--reapplyTemplates`](#--reapplytemplates) | every page using that template is modified |

Images and linked pages are read once per run, however many pages refer to them.

:::note[The first run after upgrading publishes everything]
`Doctor` 2.3.0 folds images, links, shortcodes and settings into the hash, so every hash recorded by
an earlier version now differs. The first run after upgrading therefore republishes the whole site,
once. Runs after that behave as normal.
:::

Localized pages are tracked the same way, under the URL SharePoint issued for them. They are published in their own phase which runs after the normal pages, so a changed `.lang.md` file gets published even when its source page did not change.

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

- The state file is the source of truth. Pages which were created outside of `doctor`, or before the state file existed, are not touched. Use the `--cleanEnd` flag when you want to remove everything `doctor` does not have a markdown file for, whether or not it is in the state.
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

### Available permissions

`doctor` then asks the site which of its operations the account is actually allowed to perform, and
prints the answer before anything is written:

```
 Available permissions on https://contoso.sharepoint.com/sites/docs:
   yes  Publish pages
   yes  Set page metadata
   yes  Upload assets to "Shared Documents"
    no  Update a page without changing its history — page descriptions will change 'Modified' and 'Modified By'
    no  Manage the site navigation — the 'menu' setting is skipped
    no  Change the look of the site — the 'siteDesign' setting is skipped
   yes  Read the term store
   yes  Read the site users
```

Publishing pages and setting metadata need rights on the **Site Pages library**. The navigation, the
theme, the header and footer and the site logo need **Manage Web** rights on the **site** — an
account that is perfectly able to publish pages often does not have those, which used to surface as a
failure at the very end of a run, with every page already written.

- A step the account cannot perform is **skipped**, not attempted and failed. Each one is repeated in
  the warnings at the end of the run.
  - Without **Manage Web**, the `menu` and `siteDesign` settings are left alone and the pages still
    publish.
  - Without rights to **set columns**, the `metadata` and `author` front matter is skipped — and not
    even worked out, so the term store and the user lookups are not paid for either.
  - Without rights to **write to the asset library**, a page which references an image is skipped
    whole rather than published with its pictures pointing at nothing, and the publish state is not
    saved — so the next run publishes everything again.
- A missing **system update** right is the one that is not a skip: descriptions are written with an
  ordinary update instead, at the cost of the page's `Modified` date and `Modified By`.
- Not being able to **create or update pages** stops the run straight away, since that is the whole
  job.
- Only the steps this run was going to take are listed — no `menu` in your configuration means no
  line about navigation.
- If the site's permissions cannot be read at all, `doctor` says so and attempts everything, exactly
  as it did before this check existed.

This is a check of what the account may *do*, not of what the site will accept. A term which is not
in the term set, or an author who is not a member of this site, is still found per page while
publishing.

Use the `--skipPrecheck` flag when you want to skip this validation and the capability check.

## Workflow command specific options

`--provider <provider>`
: The CI/CD platform to generate the definition for. Supported values are `github` (default) and `azdo`. Check the [workflow command](../../cli/#workflow) section for more information.

:::caution[Important]
This flag can only be added to the command execution. Using it in the `doctor.json` file will be ignored.
:::
